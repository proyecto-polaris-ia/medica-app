# Design: Preferencia de zona horaria por usuario

Referencia de evidencia: `openspec/changes/user-timezone-preferences/exploration.md`
(mapa de consumidores, modelo de usuarios, flujos de captura y pruebas).

## 1. Resumen

Se agrega una preferencia de zona horaria IANA por usuario autenticado y se
parametriza la **presentación** de horas en la capa de UI para usar la zona del
observador. Los instantes almacenados no se tocan: siguen en `timestamptz`. La
lógica operativa de la clínica (recordatorios, follow-up, Nora, métricas, Eva,
`get_free_slots`, seeds) conserva `America/Mexico_City` sin cambios.

## 2. Alcance real por consumidor

| Consumidor (ruta) | Tipo | Cambio |
|---|---|---|
| `app/(admin)/appointments/page.tsx` (lista, modal, captura) | cliente | zona del observador |
| `src/components/admin/calendar/{MonthCalendar,DayCell,ProviderLegend}.tsx` | cliente | zona del observador |
| `src/components/admin/PatientRecordView.tsx` | cliente | zona del observador |
| `src/components/admin/patient-record/PatientVisitsTab.tsx` | cliente | zona del observador |
| `src/components/admin/follow-up/FollowUpCaseCard.tsx` | cliente | zona del observador |
| `app/(admin)/dashboard/components/NoraSection.tsx` | servidor | zona del observador (prop/helper) |
| `src/components/admin/ProviderSnapshot.tsx` | servidor | zona del observador (prop) |
| `src/lib/wcc-appointments.ts` (`formatWccAppointmentStart`) | servidor | parámetro de zona del observador |
| `src/lib/admin/timezone.ts`, `src/lib/admin/clinic-time.ts` | puro | helpers parametrizados (default clínica) |
| `src/lib/admin/provider-snapshot.ts` (rangos), `metrics/*`, `follow-up/*`, `nora/*`, `citas/*`, `booking/*`, `agents/eva/*`, `0004_agenda_functions.sql`, `scripts/demo/*` | servidor/operativo | **sin cambio** (default clínica) |

## 3. Decisiones de arquitectura

### D1 — La preferencia vive en una tabla `user_settings` con RLS por usuario (recomendado)

Se descarta `auth.users.raw_user_meta_data` (Supabase Auth) y se crea una tabla
dedicada. Razones:

1. **Fuente de verdad de esquema**: la regla del repo es "migrations are the
   source of truth for schema and RLS" (`openspec/config.yaml`). `raw_user_meta_data`
   queda fuera de las migraciones y sin constraints; no es auditable como el
   resto del esquema.
2. **Validación y tipos**: la tabla permite `NOT NULL`, default y un `CHECK` de
   forma/longitud; el metadato de Auth es texto libre sin garantías.
3. **RLS consultable**: con `user_settings` se puede forzar
   `auth.uid() = user_id` en la base de datos. `raw_user_meta_data` es
   auto-editable por el navegador vía `supabase.auth.updateUser`, lo que permite
   escribir valores arbitrarios sin pasar por validación de servidor.
4. **Precedente**: `supabase/migrations/0005_providers_color.sql` establece el
   patrón "columna de preferencia + constraint + RLS authenticated"; la tabla
   sigue ese idioma con políticas por dueño en lugar de "cualquier autenticado".
5. **Consultas limpias**: la app ya resuelve el usuario en el servidor
   (`requireUser()` en `src/lib/supabase/auth.ts`); leer una tabla indexada por
   `user_id` es directo y no requiere tocar la sesión de Auth.

### D2 — Esquema y RLS (migración `supabase/migrations/<UTC-timestamp>_user_settings.sql`)

> Convención vigente del repo: migraciones nuevas con timestamp UTC
> `YYYYMMDDHHMMSS_descripcion.sql` (ver `architecture.md` §4); la numeración
> secuencial está deprecada. El timestamp se toma al crear el archivo.

```sql
create table if not exists public.user_settings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  timezone   text not null default 'America/Mexico_City',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_settings_timezone_shape
    check (char_length(timezone) between 3 and 64)
);

alter table public.user_settings enable row level security;
alter table public.user_settings force row level security;
revoke all on public.user_settings from anon;
grant select, insert, update, delete on public.user_settings to authenticated;

create policy "user_settings_owner_all"
  on public.user_settings for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

- Es la primera tabla del repo que referencia `auth.users`; el `on delete cascade`
  evita filas huérfanas si se elimina el usuario de Auth.
- El idioma de política (`(select auth.uid())`) replica
  `supabase/migrations/0006_whatsapp_inbound_command_center.sql` y
  `0020_follow_up_contacts.sql`, pero con `= user_id` en lugar de
  `is not null` para aislar por usuario.
- **Validación IANA en aplicación, no en SQL**: Postgres no trae una lista IANA
  portable. El `CHECK` sólo garantiza forma/longitud; la validez IANA la decide
  `isValidIanaTimeZone` (D3). Un valor inválido se normaliza al default al
  leerlo (D3) y se rechaza al escribirlo (API).

### D3 — Capa de dominio: validador puro + persistencia

- `src/lib/admin/timezone.ts` (puro, sin Supabase) agrega:
  - `isValidIanaTimeZone(value: string): boolean` — `new Intl.DateTimeFormat('en-US', { timeZone: value })` en `try/catch`.
  - `resolveTimeZone(value: string | null | undefined): string` — devuelve `value` si es válido, si no `CLINIC_TZ`.
- `src/lib/admin/user-settings.ts` (server-only) agrega:
  - `getUserTimezone(userId: string): Promise<string>` — lee la fila y aplica `resolveTimeZone`.
  - `setUserTimezone(userId: string, timezone: string): Promise<void>` — valida con `isValidIanaTimeZone` (lanza `Error` si no), hace upsert por `user_id`.
  - Ambos usan `createSupabaseServerClient()` (`src/lib/supabase/auth.ts`) para
    que **RLS aplique con la sesión del usuario**. Es una desviación deliberada
    del patrón `getSupabaseAdmin()` de los CRUD administrativos: aquí el dato es
    privado del usuario y queremos que la base lo garantice, no que el servicio
    lo confíe.

### D4 — Cómo llega la zona horaria a la UI

Hay dos trees y cada uno necesita un camino distinto (el contexto React no
cruza el límite servidor/cliente):

- **Componentes cliente**: `src/components/admin/TimezoneProvider.tsx`
  (`'use client'`) expone `TimezoneContext` con default `CLINIC_TZ`,
  `TimezoneProvider({ timezone, children })` y `useViewerTimezone()`.
  `app/(admin)/layout.tsx` (server component) lo monta una sola vez leyendo la
  preferencia: `const timezone = await getViewerTimezone();` y
  `<TimezoneProvider timezone={timezone}>…</TimezoneProvider>`.
- **Componentes servidor** (`NoraSection.tsx`, `ProviderSnapshot` y la página
  del command center): recibirán `timezone` como prop desde su página, o leen
  `getViewerTimezone()`.
- **Enmienda de implementación (chain 3):** `NoraSection` y `ProviderSnapshot`
  quedaron como componentes cliente que consumen `useViewerTimezone()` del
  contexto (el layout ya monta `TimezoneProvider` para todo el árbol admin).
  Comportamiento observable idéntico al diseño D4; se eligió así porque las
  páginas que los renderizan (`dashboard/page.tsx`, `providers/[id]/page.tsx`)
  quedaron fuera de la chain y jsdom no renderiza RSCs asíncronos en pruebas.
  La página del command center de citas (server) sí usa `getViewerTimezone()`.
- `src/lib/admin/viewer-timezone.ts` (server-only) expone
  `getViewerTimezone = cache(async () => getUserTimezone((await requireUser()).id))`
  usando `cache` de React para deduplicar dentro del mismo request.
- `app/(admin)/layout.tsx` ya es `force-dynamic` y ya llama `requireUser()`, así
  que no agrega waterfall ni cambio de renderizado.
- El layout también agrega el nav `Configuración` → `/settings`.

Interpretación: la preferencia se lee **una vez por request** en el layout
(superficie autenticada completa). No hay fetch de cliente ni estado global.

### D5 — Helpers puros parametrizados, default = comportamiento actual

El cambio es **backwards compatible**: se agrega un parámetro opcional
`timeZone` con default `CLINIC_TZ`/`CLINIC_TIME_ZONE`. Los llamados existentes
no cambian, por lo que la lógica operativa conserva la zona clínica sin tocar
sus archivos.

`src/lib/admin/timezone.ts`:

```ts
export const CLINIC_TZ = 'America/Mexico_City';
function parseParts(date: Date, timeZone: string): ClinicParts;            // antes parseClinicParts
function offsetAtUtc(utc: Date, timeZone: string): number;
function utcFromParts(y, m, d, h, min, s, timeZone: string): Date;         // antes utcFromClinicParts

export function clinicDayKey(iso: string, timeZone: string = CLINIC_TZ): string;
export function clinicTimeLabel(iso: string, timeZone: string = CLINIC_TZ): string;
export function toClinicLocalInput(iso: string, timeZone: string = CLINIC_TZ): string;
export function clinicLocalInputToUtc(value: string, timeZone: string = CLINIC_TZ): string;
export function clinicMonthRangeUtc(year: number, month: number, timeZone: string = CLINIC_TZ): { startAt: string; endAt: string };
export function getCalendarGrid(year: number, month: number, timeZone: string = CLINIC_TZ): CalendarDayCell[];
export function getCurrentClinicMonth(timeZone: string = CLINIC_TZ): { year: number; month: number };
export function groupAppointmentsByDay(appointments, providerColor, timeZone: string = CLINIC_TZ): Record<string, CalendarBlock[]>;
```

`src/lib/admin/clinic-time.ts`:

```ts
const CLINIC_TIME_ZONE = 'America/Mexico_City';
function getParts(instant: Date, timeZone: string): DateParts;
function getOffsetMinutes(instant: Date, timeZone: string): number;
function startOfLocalDay(instant: Date, timeZone: string): Date;

export function clinicDayRange(now: Date, timeZone: string = CLINIC_TIME_ZONE): [Date, Date];
export function trailingDaysRange(now: Date, days: number, timeZone: string = CLINIC_TIME_ZONE): [Date, Date];
```

Se conservan los nombres con "clinic" para minimizar el diff y porque el default
**es** la zona clínica; renombrarlos a nombres neutros queda como follow-up de
bajo valor. `FALLBACK_COLOR` no se toca.

### D6 — Captura en la zona del observador (modal de citas)

`app/(admin)/appointments/page.tsx` es cliente y hoy usa funciones de módulo sin
zona. Pasa a:

1. `const viewerTz = useViewerTimezone();`
2. Prellenado: `toClinicLocalInput(appointment.startAt, viewerTz)`.
3. Envío: `clinicLocalInputToUtc(value, viewerTz)` antes del POST.
4. Etiqueta explícita junto a los inputs `datetime-local` (por ejemplo
   `Zona horaria: {viewerTz}`), para desambiguar. Requisito observable en
   `appointments-calendar-view` spec ("La captura indica la zona horaria").

### D7 — Lógica operativa de la clínica sin cambios

Estos archivos no reciben `timeZone` y quedan en el default clínico:
`src/lib/admin/provider-snapshot.ts`, `src/lib/admin/metrics/*`,
`src/lib/admin/follow-up/follow-up.ts`, `src/lib/admin/nora/*`,
`src/lib/citas/*`, `src/lib/booking/*`, `agents/eva/agent/tools/*`,
`supabase/migrations/0004_agenda_functions.sql` (`get_free_slots` default) y
`scripts/demo/seed-demo-data.sql`.

Razón: son operación del consultorio (qué día es "hoy" para recordatorios,
rondas, notas y buckets), no presentación dependiente del espectador. Adaptarlos
a zona del paciente/espectador es un cambio futuro.

### D8 — Wizard público excluido (decisión)

Se excluye `/booking` de este cambio. Justificación: las etiquetas de horario
del wizard describen la hora **del consultorio** donde ocurre la cita; el
paciente anónimo no tiene preferencia guardada y no existe un paso que confirme
su zona horaria. Presentar slots en la zona del dispositivo del paciente
introduciría un riesgo real de que elija una hora creyendo que es su hora local,
sin que el sistema lo confirme. Adaptar el wizard requiere el flujo futuro de
"Eva/booking pregunta la zona horaria del paciente con default configurable" y
queda explícitamente fuera. Incluirlo además inflaría el cambio por encima del
presupuesto de revisión sin cambiar el comportamiento por default (seguiría
`America/Mexico_City`).

### D9 — Métricas: buckets y etiquetas de ventana permanecen clínicos

El requisito `Zona horaria de la clínica` de `dashboard-metrics` cubre cálculo y
presentación. Las etiquetas del panel de métricas son **límites de ventana
operativa** (semana/mes de la clínica), no instantes de cita. Se mantienen en
`America/Mexico_City` y por eso **no se modifica** `dashboard-metrics`. Si en el
futuro el panel muestra el instante de una cita individual, ése sí debería
seguir la zona del observador.

## 4. Flujo captura → almacenamiento → presentación

```
Admin (cliente)                    Servidor                          Postgres
────────────────                   ────────                          ────────
useViewerTimezone()  ───┐
                         │ viewerTz
abre modal edición  ◄────┘
  prellena: toClinicLocalInput(startAt, viewerTz)
usuario captura "17:00"
  submit: clinicLocalInputToUtc(value, viewerTz) ──► POST /api/admin/appointments
                                                        (requireUser, service_role)
                                                              └──► appointments.start_at = 22:00Z  (timestamptz, sin cambio)

render lista/calendario:
  groupAppointmentsByDay(appts, color, viewerTz) ──► startLabel en zona del observador
render expediente/command center:
  formato Intl con timeZone: viewerTz
```

La preferencia se resuelve en el layout:

```
app/(admin)/layout.tsx (server)
  requireUser() ─► getViewerTimezone() [cache] ─► TimezoneProvider(timezone)
                                                     └─ useViewerTimezone() (cliente)
```

## 5. Superficie de configuración

- `app/(admin)/settings/page.tsx` (server): lee la preferencia con
  `getViewerTimezone()` y renderiza el formulario cliente.
- `src/components/admin/settings/TimezoneSettingsForm.tsx` (cliente): selector
  con opciones IANA comunes + campo para valor; muestra error de validación sin
  sobrescribir; guarda vía API.
- `app/api/admin/settings/timezone/route.ts`: `GET` devuelve
  `{ timezone }`; `PUT` valida y llama `setUserTimezone(user.id, value)`;
  `requireUser()` rechaza sin sesión con `401` (reusa
  `handleAdminRequest`/`parseJsonBody` de `app/api/admin/_lib/responses.ts`).

## 6. Pruebas que cambian / se agregan

- `src/lib/admin/__tests__/timezone.test.ts`: se conservan los casos actuales
  (default clínico) y se agregan casos con `timeZone` explícito (round-trip
  `toClinicLocalInput`/`clinicLocalInputToUtc`, `clinicTimeLabel`,
  `clinicDayKey`, `getCalendarGrid`) más `isValidIanaTimeZone`/`resolveTimeZone`.
- `src/lib/admin/__tests__/clinic-time.test.ts`: casos con `timeZone` explícito;
  los casos actuales (default) siguen verdes.
- Nuevo `src/lib/admin/__tests__/user-settings.test.ts` (local DB,
  `localDbEnabled` + `src/test-utils/local-db.ts`): get/set, default sin fila,
  normalización de valor inválido y aislamiento por usuario (RLS).
- Nuevo `src/components/admin/__tests__/TimezoneProvider.test.tsx`: `useViewerTimezone()`
  devuelve el valor provisto y el default `CLINIC_TZ` sin provider.
- Nuevo test del formulario de settings (validación y guardado).
- `app/(admin)/appointments/page.test.tsx` (suite "clinic-timezone rendering",
  ~línea 380): se actualiza a zona del observador y se agrega un caso con
  preferencia distinta a la clínica y otro con default clínico.
- `src/components/admin/__tests__/ProviderSnapshot.test.tsx`: caso con
  `timezone` distinta a la clínica.
- `app/(admin)/dashboard/page.test.tsx` y
  `app/(admin)/dashboard/__tests__/nora-section.test.tsx`: los fixtures actuales
  asumen UTC−6 y siguen válidos con el default clínico; se agrega un caso de
  observador en otra zona.
- `src/lib/wcc-appointments.test.ts` y `src/lib/admin/__tests__/provider-snapshot.test.ts`:
  conservan sus casos clínicos; el rango operativo no cambia.

## 7. Riesgos

- **Aislamiento de preferencia**: si la API usara `getSupabaseAdmin()` sin
  acotar `user_id`, se podría leer/escribir la preferencia de otro. Mitigación:
  `user_id` sale siempre de `requireUser()`, nunca del body, y RLS lo respalda.
- **Doble fuente de zona clínica** (`CLINIC_TZ` en `timezone.ts` y
  `CLINIC_TIME_ZONE` en `clinic-time.ts`): el refactor debe mantener ambas
  constantes sincronizadas; se documenta como deuda menor.
- **Componentes servidor vs cliente**: `NoraSection` y `ProviderSnapshot` son
  servidor; no pueden usar el contexto. Mitigación: prop/`getViewerTimezone()`.
- **Cambios de firma silenciosos**: un parámetro `timeZone` opcional que se
  olvide pasar mantiene el default clínico; los tests por superficie deben
  pasar una zona distinta para probar el efecto real.
