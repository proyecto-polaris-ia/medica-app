# Diseño: Recordatorios automáticos de citas (H-24 y día mismo)

## Contexto y objetivos

Este cambio cierra el hueco de negocio descrito en `proposal.md`: hoy Eva
confirma citas *dentro* de la conversación, pero no existe ningún recordatorio
proactivo, así que una cita agendada hace semanas llega al día sin aviso y el
consultorio descubre el `no_show` cuando el paciente no aparece. Este diseño
implementa la capacidad nueva `appointment-reminders` (13 requisitos / 33
escenarios en `specs/appointment-reminders/spec.md`) y los dos deltas de
visibilidad (`specs/appointments-calendar-view/spec.md` y
`specs/wcc-command-center/spec.md`).

Objetivos técnicos:

- Un **solo cron** `app/api/cron/appointment-reminders/route.ts` que ejecuta las
  dos cadencias (H-24 y `same_day`) en una corrida, para minimizar entradas en
  `vercel.json`.
- Reutilizar al 100% el patrón ya probado de recordatorios de pago: auth bearer
  timing-safe, feature flag, dry-run fail-closed, dedup por `reminder_key` a
  nivel DB (`UNIQUE`) y estatus `scheduled` / `sent` / `failed`.
- Toda la lógica determinista (ventanas, día clínico, formateo) rige por
  `America/Mexico_City`; los instantes se persisten siempre como `timestamptz`.
- Enviar por plantilla HSM aprobada (`recordatorio_cita`, `es_MX`), nunca texto
  libre.
- Dar visibilidad operativa en el panel de citas y en un tab "Citas" del
  Command Center.

Base reutilizada (leída para este diseño):

- `app/api/cron/payment-reminders/route.ts` — patrón de auth/flag/dry-run/dedup.
- `src/lib/payments/send-payment-reminder.ts` — contrato del helper idempotente.
- `src/lib/admin/clinic-time.ts` — `clinicDayRange(now)` para el día clínico.
- `src/lib/admin/timezone.ts` — `clinicDayKey`, `clinicTimeLabel`,
  `clinicMonthRangeUtc`.
- `src/lib/whatsapp/client.ts` — `sendWhatsAppTemplateMessage`.
- `supabase/migrations/0017_payment_intents_reminders.sql` — modelo de tabla.
- `supabase/migrations/0001_agenda_tables.sql` — `appointments`,
  `appointment_status`, `patients`, `providers`.
- `docs/plantilla-hsm-recordatorio-cita.md` — guía de la plantilla y orden de
  `bodyParameters`.

---

## 1. Arquitectura del cron

### Endpoint único

`app/api/cron/appointment-reminders/route.ts` es el único punto de entrada. En
la misma corrida ejecuta **dos cadencias**:

1. `h24` — recordatorio 24–36 h antes.
2. `same_day` — recordatorio la mañana del día clínico de la cita.

Se eligió un endpoint único (en lugar de dos rutas) para simplificar
`vercel.json`, compartir auth/flag/dry-run sin duplicar código y mantener una
respuesta JSON única que los operadores puedan leer de un vistazo. El patrón de
un solo endpoint para trabajo periódico ya existe (`payment-reminders`).

```ts
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> { /* … */ }
// Alias defensivo: Vercel Cron invoca el path con GET; delegamos a POST para
// no depender del verbo del scheduler (ver Open Questions).
export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
```

### Auth: bearer timing-safe (mismo `CRON_SECRET`)

Se copia **literal** el patrón de `payment-reminders`:

- `readBearerToken(request)` exige el esquema `Bearer` (regex
  `/^Bearer\s+(.+)$/i`).
- `timingSafeStringEqual(a, b)` compara longitud y XOR byte a byte.
- Si `CRON_SECRET` no está configurado o está vacío → `401` **sin hacer
  trabajo** (fail-closed, requisito "Seguridad del disparador programado").

Ambos crons comparten `CRON_SECRET`, que ya está configurado en Vercel para
`payment-reminders`.

### Feature flag: `APPOINTMENT_REMINDERS_ENABLED`

Solo `'true'` / `'1'` (case-insensitive, `trim`) encienden. Cualquier otro valor
o `undefined` deja la corrida apagada y responde `200 { skipped: true }` sin
tocar Supabase, replicando `isFeatureEnabled` y el req. "Recordatorios
deshabilitados no envían nada".

### Dry-run: `APPOINTMENT_REMINDERS_DRY_RUN` (default `true`, fail-closed)

`resolveDryRun` copia el contrato de pagos: ausente ⇒ `true`; solo `'false'` /
`'0'` lo apagan. Cubre los escenarios "Configuración ausente falla cerrado" y
"Modo real envía solo con habilitación explícita".

### Respuesta JSON

Cuando el flag está encendido:

```json
{
  "sent": 2,
  "skipped": 1,
  "dryRun": true,
  "cadencias": {
    "h24": { "candidates": 2, "sent": 1, "skipped": 1 },
    "sameDay": { "candidates": 1, "sent": 1, "skipped": 0 }
  }
}
```

- `sent` / `skipped` son los totales de la corrida (suma de cadencias).
- `dryRun` refleja el modo efectivo.
- `cadencias.{h24,sameDay}` da el desglose por cadencia (`candidates` = filas
  devueltas por la selección antes de dedup).
- Con el flag apagado se devuelve `200 { skipped: true }` (mismo contrato que
  pagos).

El cron **nunca** lanza: por cada cadencia se itera candidato por candidato; un
fallo de proveedor o de una fila se registra (`status='failed'` + `error`) y se
continúa con las demás, cumpliendo "Degradación ante fallos del proveedor". La
única excepción no capturada es un fallo de lectura de Supabase en la
selección, que responde `500` sin escribir.

---

## 2. Helper de dominio — `src/lib/citas/send-appointment-reminder.ts`

Módulo nuevo que contiene toda la lógica determinista y el envío idempotente.

### Claves de idempotencia

```ts
export type AppointmentReminderCadence = 'h24' | 'same_day';

/**
 * Llave estable de deduplicación. El periodo SIEMPRE se deriva de la fecha
 * clínica de la CITA (`start_at`), nunca de `now`, para que la llave sea la
 * misma en corridas sucesivas de la misma ventana.
 */
export function buildAppointmentReminderKey(
  appointmentId: string,
  cadence: AppointmentReminderCadence,
  period: { isoWeekKey?: string; clinicDate?: string }
): string;
```

- `h24` → `cita:{appointment_id}:h24:{YYYY-Www}` (semana ISO de la fecha clínica
  de `start_at`).
- `same_day` → `cita:{appointment_id}:same_day:{YYYY-MM-DD}` (fecha clínica
  local de `start_at` en `America/Mexico_City`).

Las dos cadencias son independientes (cumple "Las cadencias se deduplican de
forma independiente"). Derivar el periodo de la cita —y no de `now`— evita el
bug de duplicar un recordatorio H-24 si dos corridas caen en semanas ISO
distintas pero dentro de la misma ventana de la cita.

### Selección de candidatas

```ts
export type AppointmentReminderCandidate = {
  appointmentId: string;
  patientId: string;
  patientName: string;      // patients.full_name
  patientPhoneE164: string; // patients.phone_e164
  providerName: string;     // providers.name
  startAt: string;          // appointments.start_at (timestamptz ISO)
  status: 'requested' | 'pending';
};

export async function selectAppointmentReminderCandidates(
  cadence: AppointmentReminderCadence,
  now: Date
): Promise<AppointmentReminderCandidate[]>;
```

Consulta base (mismas columnas en ambas cadencias):

```
appointments
  join patients(id)   → full_name, phone_e164
  join providers(id)  → name
  status IN ('requested','pending')
  <ventana según cadencia>
```

- **H-24** — `start_at >= now + 24h AND start_at <= now + 36h`. La ventana es de
  **instantes absolutos**, así que la aritmética se hace con `Date` sobre `now`
  (UTC), que es correcto aquí: `now + 24h` y `now + 36h` son el mismo instante
  sin importar la zona.
- **same_day** — día clínico de la cita == día clínico de `now` **y**
  `start_at >= now` (no recordar citas ya pasadas). Se resuelve con
  `clinicDayRange(now)` de `src/lib/admin/clinic-time.ts`:
  `start_at >= max(now, dayStart) AND start_at < dayEnd`. Como `dayStart <= now`
  por construcción, la condición efectiva es
  `start_at >= now AND start_at < dayEnd`.
- Se **excluyen** por el `WHERE status IN ('requested','pending')` los estados
  `confirmed`, `cancelled`, `rescheduled`, `attended` y `no_show` (cubre
  "Estados de cita excluidos" y "Cita ya confirmada no recibe el recordatorio del
  día mismo").
- Se descartan en código filas sin `patient_id`, sin `full_name` o sin
  `phone_e164` no vacío (cubre "Cita sin paciente o sin teléfono").

### Formateo de variables de plantilla

Orden **congelado** contra `docs/plantilla-hsm-recordatorio-cita.md` (5
parámetros; no se reordena ni se agrega ninguno sin re-aprobar la plantilla):

| # | Valor | Fuente / formato |
|---|-------|------------------|
| `{{1}}` | Nombre del paciente | Primer token de `patients.full_name`, con inicial mayúscula (`María`). |
| `{{2}}` | Consultorio | `APPOINTMENT_REMINDER_CLINIC_NAME` → fallback `WEB_CHAT_CLINIC_NAME` → `'Consultorio Dental'`. |
| `{{3}}` | Fecha | `Intl.DateTimeFormat('es-MX', { timeZone:'America/Mexico_City', weekday:'long', day:'numeric', month:'long' })` → `"lunes 5 de octubre"`. |
| `{{4}}` | Hora | `clinicTimeLabel(startAt)` de `src/lib/admin/timezone.ts` → `"10:00"`. |
| `{{5}}` | Doctor | `providers.name` tal cual (`"Dr. Jorge"`); fallback `"tu especialista"`. |

La fecha y la hora del ejemplo de la plantilla son campos separados
(`{{3}}` fecha, `{{4}}` hora), por lo que **no** se combinan en un solo string.

**Dirección del consultorio:** se resuelve desde configuración
`APPOINTMENT_REMINDER_CLINIC_ADDRESS` (fallback `''`). No existe una tabla de
`clinic settings` en el esquema, y crear una está fuera del alcance de Fase 3;
por consistencia con `app/api/web-chat/config/route.ts` la fuente elegida es
variable de entorno. Como el body aprobado hoy **no tiene** variable de
dirección, la dirección NO se envía en `bodyParameters`; si el consultorio la
quiere en el mensaje, debe re-aprobarse la plantilla con una sexta variable y
solo entonces se agrega (nunca se mete a `{{2}}` para "colarla").

Un único helper privado resuelve todo:

```ts
function resolveClinicReminderConfig(): { clinicName: string; clinicAddress: string } {
  return {
    clinicName:
      process.env.APPOINTMENT_REMINDER_CLINIC_NAME ??
      process.env.WEB_CHAT_CLINIC_NAME ??
      'Consultorio Dental',
    clinicAddress: process.env.APPOINTMENT_REMINDER_CLINIC_ADDRESS ?? '',
  };
}
```

### Envío idempotente

Mismo contrato que `sendPaymentReminder`:

```ts
export type SendAppointmentReminderInput = {
  appointmentId: string;
  cadence: AppointmentReminderCadence;
  patientId: string;
  patientName: string;
  patientPhoneE164: string;
  providerName: string;
  startAt: string;
  period: { isoWeekKey?: string; clinicDate?: string };
  dryRun: boolean;
};

export type SendAppointmentReminderResult = {
  reminderKey: string;
  sent: boolean;
  skipped: boolean;
  dryRun?: boolean;
  providerMessageId?: string;
  error?: string;
};

export async function sendAppointmentReminder(
  input: SendAppointmentReminderInput
): Promise<SendAppointmentReminderResult>;
```

Flujo:

1. `buildAppointmentReminderKey(...)`.
2. `findExistingReminder(reminderKey)` sobre `appointment_reminders`; si existe
   → `{ sent: false, skipped: true }` sin reenviar.
3. Si `dryRun` → `INSERT` con `status='scheduled'`, `dry_run=true`,
   `template_name='recordatorio_cita'`, y **sin** `sent_at`. Devuelve
   `{ dryRun: true }`.
4. Modo real → `sendWhatsAppTemplateMessage({ to, templateName:'recordatorio_cita',
   languageCode:'es_MX', bodyParameters:[…5 parámetros…] })` y luego `INSERT`
   con `status = ok ? 'sent' : 'failed'`, `dry_run=false`, `provider_message_id`
   y `sent_at` (solo si `ok`), y `error` cuando falla. Devuelve el resultado del
   proveedor.

Un `23505` (carrera de dos corridas simultáneas sobre la misma llave) se
interpreta como `{ sent:false, skipped:true }`, igual que en pagos.

### Opt-out del contacto

Antes de iterar candidatas, el cron re-consulta
`whatsapp_contacts.opt_in_status` por teléfono (mismo patrón que
`fetchOptedOutPhones` de `payment-reminders`) y excluye cualquier teléfono con
`'opted_out'`. Se evalúa **en cada corrida**, así que un opt-out registrado
entre la selección y el envío excluye el envío (cubre "Opt-out registrado antes
de la corrida excluye el envío").

---

## 3. Base de datos — `supabase/migrations/0018_appointment_reminders.sql`

El siguiente número disponible es `0018` (el último aplicado es
`0017_payment_intents_reminders.sql`). Se sigue su mismo patrón idempotente
(`IF NOT EXISTS`, bloque `DO` para el enum, trigger `set_updated_at`, RLS).

```sql
-- Enum idempotente
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointment_reminder_status') THEN
    CREATE TYPE appointment_reminder_status AS ENUM ('scheduled', 'sent', 'failed');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS appointment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  reminder_key text NOT NULL UNIQUE,
  cadence text NOT NULL CHECK (cadence IN ('h24', 'same_day')),
  status appointment_reminder_status NOT NULL DEFAULT 'scheduled',
  template_name text NOT NULL DEFAULT 'recordatorio_cita',
  dry_run boolean NOT NULL DEFAULT false,
  provider_message_id text,
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índice parcial: cubre exactamente el predicado del cron y del tab de WCC
-- (status de cita + rango de start_at).
CREATE INDEX IF NOT EXISTS idx_appointments_pending_start_at
  ON appointments (start_at)
  WHERE status IN ('requested', 'pending');

-- Join del panel de citas (reminders por cita).
CREATE INDEX IF NOT EXISTS idx_appointment_reminders_appointment
  ON appointment_reminders (appointment_id, created_at DESC);

-- Trigger updated_at (patrón de 0017 / 0006).
-- RLS: ENABLE + FORCE; REVOKE anon; GRANT a authenticated; policy admin-all
-- (idéntico a payment_reminders).
```

**Justificación del índice.** El cron filtra siempre
`status IN ('requested','pending')` más un rango de `start_at`; el tab de Citas
del WCC hace el mismo filtro ordenado por `start_at`. Un índice **parcial**
`idx_appointments_pending_start_at (start_at) WHERE status IN ('requested',
'pending')` es más pequeño que `(status, start_at)` (excluye citas confirmadas,
atendidas, etc.) y su predicado coincide exactamente con la consulta, así que
Postgres puede usarlo como index scan sobre el rango. El índice
`(status, start_at)` se descarta porque el `IN` de dos valores lo vuelve menos
selectivo que el parcial, sin beneficio adicional.

**RLS.** `ENABLE` + `FORCE ROW LEVEL SECURITY`; `REVOKE ALL ... FROM anon`;
`GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`; policy
`appointment_reminders_admin_all FOR ALL TO authenticated USING/ WITH CHECK
(auth.uid() IS NOT NULL)`. El cron y los helpers usan el **admin client**
(`getSupabaseAdmin()` / service role), que ignora RLS; el `authenticated` solo
aplica al panel.

**Down migration (recomendada, opcional).** Se propone
`supabase/migrations/down/0018_appointment_reminders.down.sql` siguiendo el
patrón de `down/0016_payments.down.sql` (`DROP TABLE` + `DROP TYPE`). `0017` no
tiene down, así que no bloquea; se incluye como higiene.

---

## 4. Schedule de `vercel.json`

Se agrega al arreglo `crons` (que hoy solo tiene `payment-reminders`):

```json
{ "path": "/api/cron/appointment-reminders", "schedule": "0 15 * * *" }
```

`0 15 * * *` UTC = **09:00 `America/Mexico_City`** (México ya no observa horario
de verano, offset fijo UTC-6). Esa corrida sirve para el `same_day` del día y
para una pasada del H-24.

**Cobertura del H-24 (decisión).** La ventana H-24 es de 12 h de ancho
(`[now+24h, now+36h]`). Con una **sola** corrida diaria, una cita cuya hora de
inicio caiga antes de las 09:00 del día siguiente queda con menos de 24 h al
momento de la corrida y no entra a la ventana H-24; si además es de la mañana
temprana, el `same_day` de las 09:00 tampoco la toma porque ya pasó
(`start_at >= now`). Por eso se recomienda:

- **(a) Dos corridas diarias** — `"0 15 * * *"` (09:00) y `"0 3 * * *"` (21:00
  hora clínica). La separación de 12 h iguala el ancho de la ventana H-24, de
  modo que **toda** cita cae al menos una vez dentro de `[24h, 36h]`. La corrida
  de las 09:00 es la que garantiza el `same_day`; la de las 21:00 solo aporta
  cobertura H-24 (las citas del mismo día ya tienen su llave `same_day` y el
  `start_at >= now` las excluye).
- **(b) Corrida horaria `"0 * * * *"`** — máxima precisión, pero es
  sobredimensionada: la ventana mide 12 h y 24 corridas al día no agregan
  cobertura, solo invocaciones y costo. Se descarta.

**Nota de plan de Vercel.** En el plan **Hobby** los crons se limitan a una
ejecución diaria; en **Pro** se permite mayor frecuencia. La corrida de las
09:00 (`0 15 * * *`) es la **base obligatoria** y funciona en ambos planes; la
de las 21:00 (`0 3 * * *`) es la recomendada y **solo** se agrega si el proyecto
está en un plan que permite frecuencia sub-diaria. Si el proyecto sigue en
Hobby, se acepta como limitación conocida que las citas antes de las 09:00 del
día siguiente dependen del recordatorio `same_day` (y se documenta en el
runbook). **Decisión por defecto: dos corridas diarias; fallback de una sola
corrida diaria si el plan no lo permite.**

---

## 5. Visibilidad operativa (Fase 3)

### 5.1 Panel de citas — `app/(admin)/appointments/page.tsx`

El route handler **ya existe**: `app/api/admin/appointments/route.ts` (`GET`
devuelve `{ appointments }`), y el data layer vive en
`src/lib/admin/appointments.ts` (`listAppointments` / `listAppointmentsRange`).

Cambios al data layer (`src/lib/admin/appointments.ts`):

1. Extender el tipo `Appointment` (`src/lib/admin/types.ts`) con
   `reminders: AppointmentReminderSummary[]`:

   ```ts
   export type AppointmentReminderSummary = {
     cadence: 'h24' | 'same_day';
     status: 'scheduled' | 'sent' | 'failed';
     sentAt: string | null;
     dryRun: boolean;
     createdAt: string;
   };
   ```

2. Tras leer las citas, hacer **una** consulta adicional a
   `appointment_reminders` con `.in('appointment_id', ids)` (mismo patrón de
   "join manual" que `patientsFor` en `src/lib/wcc-payments.ts`) y agrupar por
   `appointment_id` en `mapRow`. Esto evita depender de un `select` anidado de
   PostgREST y mantiene el `SELECT_COLUMNS` existente.

Cambios en la página:

- Nueva columna **"Recordatorio"** en `DataTable`:
  - con H-24 `sent` → badge `"Recordatorio H-24 enviado el {fecha}"` (fecha
    formateada en `America/Mexico_City`);
  - con `same_day` `sent` → badge `"Recordatorio día mismo enviado el {fecha}"`;
  - con `scheduled` + `dryRun` → badge `"Simulado (dry-run)"`;
  - sin recordatorios → texto neutro `"Sin recordatorio"` (nunca una fecha
    inexistente).
- La columna **"Estado"** existente ya expone el estado de confirmación
  (`requested` / `pending` / `confirmed` / …); se agrega una etiqueta legible
  ("Sin confirmar" / "Confirmada") para cumplir "Cita confirmada muestra su
  estado" sin ambigüedad.

### 5.2 Command Center — tab "Citas"

Archivos nuevos siguiendo el patrón exacto de `src/lib/wcc-payments.ts` +
`app/(admin)/whatsapp-command-center/payments/page.tsx`:

- `src/lib/wcc-appointments.ts` — data layer:

  ```ts
  export type WccAppointmentReminderRow = {
    cadence: 'h24' | 'same_day';
    status: 'scheduled' | 'sent' | 'failed';
    sentAt: string | null;
    dryRun: boolean;
  };

  export type WccUnconfirmedAppointmentRow = {
    appointmentId: string;
    patientId: string | null;
    patientName: string;
    patientPhoneE164: string | null;
    providerName: string;
    startAt: string;          // timestamptz
    status: 'requested' | 'pending';
    hoursUntilStart: number;  // calculado en el data layer
    reminders: WccAppointmentReminderRow[];
  };

  export type WccAppointmentsQueue = {
    isSupabaseConfigured: boolean;
    isConfiguredButUnavailable: boolean;
    appointments: WccUnconfirmedAppointmentRow[];
    windowHours: number;
    generatedAt: string;
  };

  export async function getWccUnconfirmedAppointments(
    filters?: { windowHours?: number }
  ): Promise<WccAppointmentsQueue>;
  ```

  Consulta: `appointments` con `status IN ('requested','pending')` y
  `start_at >= now` y `start_at < now + windowHours`, orden `start_at ASC`,
  más join manual a `patients` y `providers`, más los recordatorios por
  `appointment_id`. Ventana por defecto
  `WCC_APPOINTMENTS_WINDOW_HOURS` → **72 h** (cubre H-24 y el día mismo con
  margen operativo). Sigue el contrato `isSupabaseConfigured` /
  `isConfiguredButUnavailable` / vacío de `wcc-payments.ts` (nunca lanza, nunca
  filtra a `anon`). `hoursUntilStart` se calcula como
  `Math.max(0, Math.round((start_at - now) / 3_600_000))`.

- `app/(admin)/whatsapp-command-center/appointments/page.tsx` — server component
  `async` con `export const dynamic = 'force-dynamic'` que renderiza la lista de
  citas sin confirmar ordenadas por `start_at`, con "en X h" (`hoursUntilStart`)
  y el estado de recordatorio por cita:
  - H-24 `sent` → "Recordatorio H-24 enviado {fecha relativa}";
  - sin H-24 → "Sin recordatorio H-24";
  - `same_day` `sent`/`scheduled` → estado correspondiente;
  - lista vacía → `WccEmptyState` con estado vacío claro.
  Reutiliza `WccEmptyState` / `WccNotice` de
  `app/(admin)/whatsapp-command-center/components.tsx` y `formatRelativeTime`
  de `src/lib/date-format.ts`.

- `app/(admin)/whatsapp-command-center/layout.tsx` — agregar una entrada al
  arreglo `wccNav`:
  `{ href: '/whatsapp-command-center/appointments', label: 'Citas' }`
  (el layout ya es el contenedor de tabs; no se toca `nav-link.tsx`).

---

## 6. Estrategia de pruebas (Vitest)

Se usa el runner existente (`npm test` → `vitest run`), con la política
test-first (RED → GREEN → TRIANGULATE) del ciclo SDD. Los patrones de mock ya
existen: `vi.mock` de módulos para rutas y mocks de `fetch` por URL para
componentes.

| Archivo | Capa | Casos |
|---|---|---|
| `src/lib/citas/__tests__/send-appointment-reminder.test.ts` (nuevo) | Unidad | `buildAppointmentReminderKey` h24 (semana ISO) y same_day (fecha clínica local), incluida la misma cita en dos corridas de la misma ventana → misma llave; `selectAppointmentReminderCandidates` para H-24 (dentro / fuera de ventana) y same_day (día clínico correcto; excluye `start_at < now`); excluye estados no elegibles y filas sin paciente/teléfono; formateo de fecha (`"lunes 5 de octubre"`) y hora (`"10:00"`) en `America/Mexico_City` con un caso que cruza medianoche UTC; `sendAppointmentReminder` idempotente (llave existente → skip), dry-run (inserta `scheduled`, no envía) y modo real (`sent`/`failed` con `provider_message_id` / `error`). Mock de `getSupabaseAdmin` y de `sendWhatsAppTemplateMessage`. |
| `app/api/cron/appointment-reminders/route.test.ts` (nuevo) | Ruta | Auth: sin header / secreto equivocado / `CRON_SECRET` no configurado / esquema no-Bearer → `401` y sin trabajo. Flag: ausente / `false` / `0` → `200 { skipped: true }`. Dry-run: ausente ⇒ `true`; `false` ⇒ modo real. Respuesta con `cadencias.h24` / `cadencias.sameDay`; dedup (llave existente ⇒ `skipped`); opt-out excluye el envío; fallo de proveedor no interrumpe la corrida. Montaje de queries encadenables como en `payment-reminders/route.test.ts`. |
| `src/lib/wcc-appointments.test.ts` (nuevo) | Unidad | Orden por `start_at`, `hoursUntilStart`, estado de recordatorio por cita, ventana (excluye fuera de `windowHours`), `isConfiguredButUnavailable` cuando el cliente lanza y estado vacío. Patrón `src/lib/wcc-payments.test.ts`. |
| `app/(admin)/whatsapp-command-center/appointments/page.test.tsx` (nuevo) | Componente | Render de citas sin confirmar con "en X h"; cita con H-24 enviado muestra la fecha; cita sin recordatorio muestra estado neutro; lista vacía muestra `WccEmptyState`. |
| `app/(admin)/appointments/page.test.tsx` (modificar) | Componente | Nueva columna de recordatorio: H-24 enviado con fecha, `same_day` enviado, dry-run y "Sin recordatorio"; la etiqueta de estado de confirmación aparece. Se extiende el mock de `fetch` por URL (`/api/admin/appointments` ahora incluye `reminders`). |
| `app/api/admin/appointments/route.test.ts` (modificar) | Ruta | El payload de `GET /api/admin/appointments` incluye `reminders` por cita (y `[]` cuando no hay). |
| `src/lib/admin/__tests__/appointments.test.ts` (modificar) | Data layer | `listAppointments` / `listAppointmentsRange` agrupan `appointment_reminders` por `appointment_id` y devuelven `reminders` (incluido el caso sin recordatorios). |

Notas:

- Los tests de fecha/hora deben fijar un instante con `vi.setSystemTime` (o pasar
  `now` explícito a `selectAppointmentReminderCandidates`) para evitar
  time-bombs, como ya hace `appointments/page.test.tsx`.
- Regresión explícita: ningún test debe enviar cuando `dryRun` no fue apagado
  explícitamente; `sendWhatsAppTemplateMessage` **no** se llama en dry-run.

---

## 7. Plan de despliegue seguro

1. **Merge con la capacidad apagada**: el commit llega con
   `APPOINTMENT_REMINDERS_ENABLED` ausente (flag off) y
   `APPOINTMENT_REMINDERS_DRY_RUN` ausente (default `true`). Aunque el cron
   dispare, no envía nada.
2. **Plantilla en Meta**: `recordatorio_cita` (Utility, `es_MX`) debe estar
   **`Approved`** antes de encender el envío real (guía:
   `docs/plantilla-hsm-recordatorio-cita.md`). Es una dependencia externa.
3. **Congelar `bodyParameters`**: una vez aprobada, revisar el body real de Meta
   y congelar el orden exacto `nombre, consultorio, fecha, hora, doctor`. Si Meta
   entrega la plantilla con orden o número de variables distinto, se ajusta el
   helper **antes** de encender; nunca se "adapta" en runtime.
4. **Encendido gradual**: primero `APPOINTMENT_REMINDERS_ENABLED=true` con
   `..._DRY_RUN` **sin definir** (sigue `true`) durante al menos un día; validar
   filas `scheduled`/`dry_run=true` en `appointment_reminders` y el conteo en la
   respuesta del cron.
5. **Envío real**: definir `APPOINTMENT_REMINDERS_DRY_RUN=false` solo después de
   validar el paso 4. Verificar `status='sent'` + `provider_message_id` en la
   tabla y en el tab "Citas".
6. **Rollback**: `APPOINTMENT_REMINDERS_ENABLED=false` (sin deploy) apaga ambas
   cadencias; la migración `0018` es aditiva y no afecta lecturas existentes.

---

## 8. Matriz de decisiones (resumen)

| Decisión | Alternativa | Por qué |
|---|---|---|
| Un solo endpoint de cron ejecuta H-24 y `same_day` | Dos rutas de cron | Simplifica `vercel.json`, comparte auth/flag/dry-run y da una respuesta única; el patrón ya existe en `payment-reminders`. |
| `APPOINTMENT_REMINDERS_ENABLED` (solo `true`/`1`) con default off | Flag con default on | Fail-closed: la capacidad no envía nada hasta habilitarse explícitamente. |
| `APPOINTMENT_REMINDERS_DRY_RUN` default `true` (solo `false`/`0` lo apagan) | Default `false` | Replica el requisito "configuración ausente falla cerrado" y el patrón de pagos. |
| Llave H-24 `cita:{id}:h24:{YYYY-Www}` con la semana ISO de la **fecha clínica de la cita** | Semana ISO de `now` | Estable entre corridas de la misma ventana; evita duplicados si dos corridas caen en semanas distintas. |
| Ventana H-24 `[now+24h, now+36h]` como instantes absolutos | Calcular la ventana en hora clínica | La ventana es de instantes; `Date` sobre `now` es correcto y más simple. El día clínico sí rige para `same_day`. |
| `same_day`: `clinicDayRange(now)` + `start_at >= now` | Solo comparar fecha UTC | Cumple la zona clínica y evita recordar citas ya pasadas. |
| Índice parcial `(start_at) WHERE status IN ('requested','pending')` | Índice `(status, start_at)` | Coincide con el predicado exacto del cron y del tab; más pequeño y selectivo. |
| Plantilla con 5 parámetros congelados; dirección en config pero no enviada | Meter dirección en `{{2}}` | El body aprobado no tiene variable de dirección; alterarlo requiere re-aprobación. |
| Opt-out: excluir solo `opted_out` por teléfono en cada corrida | Exigir `opted_in` | Mismo contrato que `payment-reminders`; `unknown`/`pending` siguen siendo enviables. |
| Dirección/consultorio desde variables de entorno | Tabla `clinic_settings` | No existe tabla de settings; el patrón `WEB_CHAT_CLINIC_NAME` ya resuelve config sin migración. |
| Dos corridas diarias (`0 15 * * *` + `0 3 * * *`) | Corrida horaria `0 * * * *` | 12 h de separación igualan el ancho de la ventana H-24 sin sobredimensionar; fallback a una sola corrida si el plan de Vercel es Hobby. |
| `GET` alias de `POST` en el cron | Solo `POST` | Vercel Cron invoca el path con `GET`; el alias elimina la dependencia del verbo (ver Open Questions). |

---

## 9. Flujo de datos

```text
Vercel Cron (0 15 * * * UTC = 09:00 CDMX; + 0 3 * * * recomendado = 21:00)
  ──▶ GET/POST /api/cron/appointment-reminders
        auth Bearer CRON_SECRET (timing-safe) ──no──▶ 401 (sin trabajo)
        APPOINTMENT_REMINDERS_ENABLED? ──no──▶ 200 { skipped: true }
        dryRun = resolveDryRun(APPOINTMENT_REMINDERS_DRY_RUN)   // default true
        │
        ├─ cadencia h24
        │    selectAppointmentReminderCandidates('h24', now)   // status in (requested,pending), [now+24h, now+36h]
        │    opt-out filter (whatsapp_contacts)
        │    por cita: key = cita:{id}:h24:{YYYY-Www de la fecha clínica de la cita}
        │      ├─ key existe ─▶ skipped
        │      ├─ dryRun ─▶ INSERT scheduled/dry_run=true (sin sent_at)
        │      └─ real ─▶ sendWhatsAppTemplateMessage(recordatorio_cita, [nombre,consultorio,fecha,hora,doctor])
        │                   └─▶ INSERT sent/failed (+provider_message_id, sent_at, error)
        │
        └─ cadencia same_day
             selectAppointmentReminderCandidates('same_day', now) // clinicDayRange(now) && start_at>=now
             …mismo flujo con key cita:{id}:same_day:{YYYY-MM-DD}
        ──▶ 200 { sent, skipped, dryRun, cadencias:{h24,sameDay} }

Panel de citas:  /api/admin/appointments ─▶ listAppointments(+reminders) ─▶ columna "Recordatorio"
Command Center:  /whatsapp-command-center/appointments ─▶ getWccUnconfirmedAppointments() ─▶ tab "Citas"
```

---

## 10. Cambios de archivos

### Crear

| Archivo | Descripción |
|---|---|
| `app/api/cron/appointment-reminders/route.ts` | Endpoint único de las dos cadencias: auth bearer timing-safe, `APPOINTMENT_REMINDERS_ENABLED`, `APPOINTMENT_REMINDERS_DRY_RUN` (default `true`), opt-out, dedup y respuesta `{sent, skipped, dryRun, cadencias}`. Incluye alias `GET` → `POST`. |
| `app/api/cron/appointment-reminders/route.test.ts` | Pruebas de ruta (auth, flag, dry-run, dedup, opt-out, respuesta por cadencia). |
| `src/lib/citas/send-appointment-reminder.ts` | `buildAppointmentReminderKey`, `selectAppointmentReminderCandidates`, formateo de variables, `sendAppointmentReminder` idempotente y config del consultorio. |
| `src/lib/citas/__tests__/send-appointment-reminder.test.ts` | Unidad del helper (ventanas, estados, claves, formato de fecha/hora, idempotencia). |
| `supabase/migrations/0018_appointment_reminders.sql` | Enum `appointment_reminder_status`, tabla `appointment_reminders`, índice parcial `appointments(start_at) WHERE status IN (...)`, índice de join, trigger `updated_at` y RLS admin-all. |
| `supabase/migrations/down/0018_appointment_reminders.down.sql` | Down migration (recomendada): `DROP TABLE` + `DROP TYPE`. |
| `src/lib/wcc-appointments.ts` | Data layer del tab "Citas" (patrón `wcc-payments.ts`). |
| `src/lib/wcc-appointments.test.ts` | Unidad del data layer del tab. |
| `app/(admin)/whatsapp-command-center/appointments/page.tsx` | Server component del tab "Citas" (citas sin confirmar, horas al inicio y estado de recordatorio). |
| `app/(admin)/whatsapp-command-center/appointments/page.test.tsx` | Pruebas del tab. |

### Modificar

| Archivo | Descripción |
|---|---|
| `vercel.json` | Agregar `{ "path": "/api/cron/appointment-reminders", "schedule": "0 15 * * *" }` (y `"0 3 * * *"` si el plan lo permite). |
| `src/lib/admin/types.ts` | Agregar `AppointmentReminderSummary` y `reminders` a `Appointment`. |
| `src/lib/admin/appointments.ts` | Traer y agrupar `appointment_reminders` en `listAppointments` / `listAppointmentsRange`. |
| `src/lib/admin/__tests__/appointments.test.ts` | Cubrir `reminders` en el data layer. |
| `app/api/admin/appointments/route.test.ts` | Cubrir `reminders` en el payload de `GET`. |
| `app/(admin)/appointments/page.tsx` | Columna/badge "Recordatorio" + etiqueta legible de estado de confirmación. |
| `app/(admin)/appointments/page.test.tsx` | Casos de la columna de recordatorio. |
| `app/(admin)/whatsapp-command-center/layout.tsx` | Entrada `{ href: '/whatsapp-command-center/appointments', label: 'Citas' }` en `wccNav`. |

### Sin cambios

- `app/api/cron/payment-reminders/**` y `src/lib/payments/**` (solo se copian
  patrones).
- `src/lib/admin/clinic-time.ts` y `src/lib/admin/timezone.ts` (se reutilizan
  `clinicDayRange`, `clinicDayKey`, `clinicTimeLabel`).
- `src/lib/whatsapp/client.ts` (`sendWhatsAppTemplateMessage` ya existe).
- `agent/**` (Eva conversacional, fuera de alcance) y `travelhub-app`.

---

## 11. Matriz de amenazas

Aplica porque el cambio agrega una **ruta API nueva con autorización**
(`/api/cron/appointment-reminders`), un **envío outbound** (plantilla) y una
**escritura** en `appointment_reminders`. No se tocan shell, subprocesos, VCS ni
clasificación de archivos ejecutables.

| Frontera | Caso adversario mínimo | Aplica | Respuesta de diseño | Prueba RED planeada |
|---|---|---|---|---|
| Rutas tipo documentación | `requirements.txt`, MD ejecutable | No | No hay frontera de ejecución de archivos | — |
| Selección de repo Git / commit / push / PR | `git -C`, staged, refspec | No | No se invoca git | — |
| Auth del cron | Petición sin `Bearer` válido o `CRON_SECRET` ausente | Sí | `401` sin trabajo antes de tocar Supabase | Sin header / secreto erróneo / secreto ausente → `401` y `getSupabaseAdmin` no llamado |
| Abuso de plantilla (PII/contacto) | Enviar a un contacto con opt-out | Sí | Re-filtrar `whatsapp_contacts.opt_in_status='opted_out'` por teléfono en cada corrida | Contacto `opted_out` → sin insert y sin `sendWhatsAppTemplateMessage` |
| Duplicidad / reenvío | Dos corridas sobre la misma cita y ventana | Sí | `UNIQUE(reminder_key)` + check previo; `23505` ⇒ skip | Segunda corrida ⇒ `skipped`, sin insert ni envío |
| Filtración de datos (RLS) | Lectura con rol `anon` | Sí | RLS `ENABLE`+`FORCE`, `REVOKE anon`, policy solo `authenticated`; cron usa admin client | (Migración) policy admin-all; sin acceso anon |
| Plantilla no aprobada | Envío real antes de `Approved` | Sí | Flag off + dry-run default `true`; orden de `bodyParameters` congelado contra Meta | Dry-run no llama `sendWhatsAppTemplateMessage` |

---

## 12. Open Questions

- [ ] **Plan de Vercel.** Confirmar Hobby vs Pro para saber si se pueden agregar
      dos corridas diarias. Base obligatoria: `0 15 * * *`; recomendada: también
      `0 3 * * *`.
- [ ] **Verbo del cron.** Vercel Cron suele invocar el path con `GET`; la ruta
      de `payment-reminders` solo exporta `POST`. Este diseño agrega el alias
      `GET` → `POST` en la ruta nueva para no depender del verbo, pero conviene
      verificar en los logs de producción si `payment-reminders` realmente
      recibe `POST` (si recibe `GET` y funciona, la plataforma admite ambos).
- [ ] **Dirección del consultorio en el mensaje.** El body aprobado hoy no tiene
      variable de dirección. Si el cliente la quiere, re-aprobar
      `recordatorio_cita` con una sexta variable y solo entonces agregarla; hasta
      entonces la dirección queda solo en config.
- [ ] **Ventana del tab "Citas".** Se fija `WCC_APPOINTMENTS_WINDOW_HOURS=72`
      por defecto; confirmar con operación el horizonte deseado.
- [ ] **Botones Quick Reply.** `docs/plantilla-hsm-recordatorio-cita.md` los
      recomienda; su parsing es del issue #87 y no cambia este payload.
