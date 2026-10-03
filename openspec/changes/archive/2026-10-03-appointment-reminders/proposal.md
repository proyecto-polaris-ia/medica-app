# Change: Recordatorios automáticos de citas (H-24 y día mismo)

## Why

El problema de negocio que resuelve este cambio es el hueco en la agenda: hay
espacios que se pierden porque nadie confirma la cita de forma proactiva. Hoy
Eva confirma citas *dentro de la conversación* (el paciente escribe, Eva
responde y, si todo cuadra, agenda), pero **no existe ningún recordatorio
proactivo**: una cita agendada hace dos semanas y nunca reconfirmada llega al
día sin aviso, y el consultorio solo descubre el `no_show` cuando el paciente no
aparece.

El plan del cliente ya pide explícitamente esta capacidad — "confirmar citas
automáticamente o semiautomáticamente" y "recibir recordatorios" (ver
`docs/01-problema-y-solucion-esperada.md`, plan del cliente; ver también el
issue [#86](https://github.com/proyecto-polaris-ia/medica-app/issues/86) y la
guía operativa de la plantilla en `docs/plantilla-hsm-recordatorio-cita.md`).

Este cambio cierra ese loop con recordatorios deterministas por WhatsApp,
idempotentes, con feature flag y dry-run, y visibilidad operativa en el panel.

## What Changes

### Fase 1 — Recordatorio H-24

- Nuevo cron `app/api/cron/appointment-reminders/route.ts`, copiando el patrón de
  seguridad de `app/api/cron/payment-reminders/route.ts`:
  - auth por bearer `CRON_SECRET` con comparación timing-safe; si el secreto no
    está configurado, responde `401` y no hace trabajo;
  - feature flag por variable de entorno (`APPOINTMENT_REMINDERS_ENABLED`) que
    acepta solo `'true'` / `'1'`;
  - **dry-run por defecto fail-closed** (`resolveDryRun`: ausente ⇒ `true`; solo
    `'false'` / `'0'` lo apagan).
- Plantilla HSM `recordatorio_cita` (categoría Utility, `es_MX`), con variables
  para nombre del paciente, fecha y hora de la cita, doctor e
  dirección/indicaciones del consultorio. El orden exacto de los `bodyParameters`
  lo fija `docs/plantilla-hsm-recordatorio-cita.md` y **debe congelarse contra la
  plantilla aprobada en Meta antes de habilitar envíos reales**.
- Deduplicación por `reminder_key` con la forma
  `cita:{appointment_id}:h24:{YYYY-Www}` (semana ISO de la fecha de la cita).
- Selección de candidatas: citas en estado `requested` o `pending` con `start_at`
  dentro de la ventana de las próximas 24–36 horas. Se **excluyen**:
  - estados `cancelled`, `rescheduled`, `attended`, `no_show`;
  - citas sin paciente relacionado o sin teléfono.

### Fase 2 — Recordatorio el día mismo

- Segunda cadencia en la ventana matutina del día de la cita (schedule del cron a
  las 09:00 hora clínica), dirigida **solo a citas que siguen sin confirmar**
  (estado `requested` / `pending`).
- Key `cita:{appointment_id}:same_day:{YYYY-MM-DD}` con **fecha clínica local**
  (`America/Mexico_City`), no fecha UTC.

### Fase 3 — Visibilidad operativa

- Tabla `appointment_reminders` siguiendo el patrón de `payment_reminders`
  (migración `0017_payment_intents_reminders.sql`): `reminder_key text NOT NULL
  UNIQUE`, `status`, `dry_run`, `provider_message_id`, `sent_at`, `error` y FK a
  `appointments`.
- Vista en el panel de citas que muestra "recordatorio enviado H-24 el {fecha}" y
  el estado de confirmación de la cita.
- Indicador en el Command Center (tab "Citas", siguiendo el patrón de
  `src/lib/wcc-payments.ts`) con las citas sin confirmar a las X horas de su
  `start_at`.

## Capabilities

### New Capabilities

- `appointment-reminders`: Envío proactivo, idempotente y auditable de
  recordatorios de cita por WhatsApp (H-24 y día mismo), con feature flag,
  dry-run fail-closed, deduplicación por `reminder_key` y respeto al opt-out del
  contacto.

### Modified Capabilities

- `wcc-command-center`: Agregar un indicador tab "Citas" con las citas sin
  confirmar a las X horas, siguiendo el patrón de `src/lib/wcc-payments.ts`.
- `appointments-calendar-view`: Mostrar en el panel de citas el recordatorio
  enviado (H-24, con fecha) y el estado de confirmación de cada cita.

## Approach

- Copiar y adaptar el patrón ya probado de recordatorios de pago: auth bearer,
  feature flag, dry-run fail-closed, selección determinista, dedup por
  `reminder_key` a nivel DB (`UNIQUE`) y persistencia de estado
  `scheduled` / `sent` / `failed`.
- La lógica de envío vive en `src/lib/citas/send-appointment-reminder.ts` y usa el
  helper existente `sendWhatsAppTemplateMessage` de `src/lib/whatsapp/client.ts`
  (degrada a `{ ok: false, skipped: true }` sin credenciales).
- Todo cálculo de tiempo (ventanas de selección, día clínico, formateo de fecha y
  hora) usa `src/lib/admin/clinic-time.ts` sobre `America/Mexico_City`; los
  instantes se persisten siempre como `timestamptz`.
- El opt-out de contacto (`whatsapp_contacts.opt_in_status === 'opted_out'`) se
  re-filtra por teléfono en cada corrida, igual que en el cron de pagos.

## Impacto

Archivos nuevos esperados (sin modificar TravelHub):

| Archivo | Tipo | Descripción |
|---------|------|-------------|
| `app/api/cron/appointment-reminders/route.ts` | New | Endpoint de cron para las dos cadencias, con auth, flag, dry-run y dedup. |
| `src/lib/citas/send-appointment-reminder.ts` | New | Construcción de `reminder_key`, selección de candidatas, envío idempotente y persistencia. |
| `supabase/migrations/00XX_appointment_reminders.sql` | New | Tabla `appointment_reminders` (patrón de `payment_reminders`), índices y constraint `UNIQUE(reminder_key)`. |
| `vercel.json` | Modified | Agregar el cron de `appointment-reminders` (schedule UTC equivalente a 09:00 hora clínica para el día mismo y la ventana H-24). |
| Vista del panel de citas | Modified | Mostrar recordatorio H-24 enviado y estado de confirmación. |
| Tab "Citas" del Command Center | Modified | Indicador de citas sin confirmar (patrón `src/lib/wcc-payments.ts`). |

## Riesgos y rollback

- **Dependencia externa (plantilla Meta):** `recordatorio_cita` está pendiente de
  aprobación en Meta Business. Mitigación: el cron se despliega con
  `APPOINTMENT_REMINDERS_ENABLED` apagado y `..._DRY_RUN=true` (fail-closed) hasta
  que la plantilla quede `Approved`; el orden de parámetros se congela contra la
  plantilla aprobada antes de encender el envío real.
- **Duplicados:** mitigado con deduplicación a nivel DB vía
  `UNIQUE(reminder_key)`; una cita con recordatorio H-24 no vuelve a recibirlo.
- **Timezone:** mitigado usando `src/lib/admin/clinic-time.ts`
  (`America/Mexico_City`) para toda ventana, día clínico y formateo; los instantes
  persistidos son siempre `timestamptz`.
- **Rollback:** desactivar la variable de entorno del feature flag apaga ambas
  cadencias sin necesidad de deploy. La tabla de recordatorios es aditiva y no
  afecta lecturas existentes; la migración no es destructiva. Revertir el commit
  restaura el estado previo sin migraciones de rollback obligatorias.

## Fuera de alcance

- Interpretación de las respuestas del paciente ("1" / "Confirmar" /
  "Reprogramar"): lo cubre el issue
  [#87](https://github.com/proyecto-polaris-ia/medica-app/issues/87).
- Cambios a Eva conversacional (prompt, tools o topología del agente).
- Cobros de `no_show` o cargos por inasistencia.
