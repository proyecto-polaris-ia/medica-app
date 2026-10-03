# Tasks

Recordatorios automáticos de citas (H-24 y día mismo). El orden respeta las
dependencias: **migración → helper → cron → schedule → data layer → vistas**, con
TDD (RED → GREEN → TRIANGULATE → REFACTOR) en las tareas de código.

## 1. Migración y schema

- [ ] 1.1 Crear `supabase/migrations/0018_appointment_reminders.sql` (siguiente número tras `0017_payment_intents_reminders.sql`) con: enum idempotente `appointment_reminder_status` (`'scheduled'|'sent'|'failed'`) dentro de bloque `DO`; tabla `appointment_reminders` con `id`, `appointment_id` (FK a `appointments` `ON DELETE CASCADE`), `reminder_key text NOT NULL UNIQUE`, `cadence text CHECK (cadence IN ('h24','same_day'))`, `status` (default `'scheduled'`), `template_name` (default `'recordatorio_cita'`), `dry_run boolean NOT NULL DEFAULT false`, `provider_message_id`, `sent_at timestamptz`, `error`, `created_at`, `updated_at`.
  - Verificación: lectura estructural contra el patrón de `supabase/migrations/0017_payment_intents_reminders.sql` (idempotencia `IF NOT EXISTS`, `UNIQUE(reminder_key)`, `CHECK` de `cadence`).
- [ ] 1.2 Agregar en el mismo archivo los índices: parcial `idx_appointments_pending_start_at ON appointments (start_at) WHERE status IN ('requested','pending')` (predicado exacto del cron y del tab) e índice de join `idx_appointment_reminders_appointment (appointment_id, created_at DESC)`.
  - Verificación: confirmar en el SQL que el predicado del índice parcial coincide con la consulta `status IN ('requested','pending')`.
- [ ] 1.3 Agregar trigger `set_updated_at` y RLS: `ENABLE` + `FORCE ROW LEVEL SECURITY`, `REVOKE ALL ... FROM anon`, `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`, policy `appointment_reminders_admin_all FOR ALL TO authenticated USING/WITH CHECK (auth.uid() IS NOT NULL)`.
  - Verificación: lectura estructural contra el bloque RLS de `0017` (mismos `ENABLE`/`FORCE`, `REVOKE anon`, policy `authenticated`).
- [ ] 1.4 Crear `supabase/migrations/down/0018_appointment_reminders.down.sql` (`DROP TABLE IF EXISTS appointment_reminders` + `DROP TYPE IF EXISTS appointment_reminder_status`), siguiendo `supabase/migrations/down/0016_payments.down.sql`.
  - Verificación: revisar que el down revierta exactamente lo creado en 1.1–1.3.
  - Nota: no hay runner de migraciones en `npm test`; la verificación de esta sección es estructural (lectura del SQL), no un test ejecutable.

## 2. Helper de dominio — TDD

Archivo de implementación: `src/lib/citas/send-appointment-reminder.ts`.
Archivo de prueba: `src/lib/citas/__tests__/send-appointment-reminder.test.ts`.

- [ ] 2.1 **RED** — Escribir `src/lib/citas/__tests__/send-appointment-reminder.test.ts` con los casos de `design.md` §6: `buildAppointmentReminderKey` h24 (`cita:{id}:h24:{YYYY-Www}` con semana ISO de la fecha clínica de la cita) y same_day (`cita:{id}:same_day:{YYYY-MM-DD}` con fecha clínica local); misma cita en dos corridas de la misma ventana → misma llave; selección H-24 (dentro / fuera de `[now+24h, now+36h]`); same_day (día clínico correcto; excluye `start_at < now`); exclusión de estados no elegibles y de filas sin paciente/teléfono; formateo de fecha (`"lunes 5 de octubre"`) y hora (`"10:00"`) en `America/Mexico_City` con caso que cruza medianoche UTC; idempotencia (llave existente → skip), dry-run (inserta `scheduled`, no envía) y modo real (`sent`/`failed`). Mock de `getSupabaseAdmin` y de `sendWhatsAppTemplateMessage`. Fijar tiempo con `vi.setSystemTime` o pasar `now` explícito.
  - Verificación: `npx vitest run src/lib/citas/__tests__/send-appointment-reminder.test.ts` → falla (módulo inexistente / casos RED).
- [ ] 2.2 **GREEN** — Implementar `src/lib/citas/send-appointment-reminder.ts` con: tipos `AppointmentReminderCadence`, `AppointmentReminderCandidate`, `SendAppointmentReminderInput`, `SendAppointmentReminderResult`; `buildAppointmentReminderKey`; `selectAppointmentReminderCandidates(cadence, now)` (`appointments` JOIN `patients`/`providers`, `status IN ('requested','pending')`, ventana por cadencia); `resolveClinicReminderConfig` (env `APPOINTMENT_REMINDER_CLINIC_NAME` → `WEB_CHAT_CLINIC_NAME` → `'Consultorio Dental'`; `APPOINTMENT_REMINDER_CLINIC_ADDRESS` → `''`); formateo de los 5 `bodyParameters` congelados (`nombre`, `consultorio`, `fecha`, `hora`, `doctor`); `sendAppointmentReminder` idempotente que persiste `scheduled`/`sent`/`failed` y trata `23505` como `{ sent:false, skipped:true }`. Reutilizar `clinicDayRange`/`clinicTimeLabel` y `sendWhatsAppTemplateMessage`.
  - Verificación: `npx vitest run src/lib/citas/__tests__/send-appointment-reminder.test.ts` → pasa.
- [ ] 2.3 **TRIANGULATE** — Cubrir casos negativos que protegen el contrato: dry-run **no** llama `sendWhatsAppTemplateMessage`; sin credenciales el helper degrada a `{ ok:false, skipped:true }`; fecha/hora cruzan medianoche UTC sin cambiar el día clínico; filas con `patient_id`/`full_name`/`phone_e164` vacíos se descartan.
  - Verificación: `npx vitest run src/lib/citas/__tests__/send-appointment-reminder.test.ts` → pasa con los casos nuevos.
- [ ] 2.4 **REFACTOR** — Limpiar el helper (nombres, extracción de formateo) manteniendo la prueba en verde.
  - Verificación: `npx vitest run src/lib/citas/__tests__/send-appointment-reminder.test.ts` → sigue pasando.

## 3. Cron route — TDD

Archivo de implementación: `app/api/cron/appointment-reminders/route.ts`.
Archivo de prueba: `app/api/cron/appointment-reminders/route.test.ts`.
Referencia de patrón: `app/api/cron/payment-reminders/route.ts` (+ su `route.test.ts`).

- [ ] 3.1 **RED** — Escribir `app/api/cron/appointment-reminders/route.test.ts` montando queries encadenables (como `payment-reminders/route.test.ts`): auth (sin header / secreto equivocado / `CRON_SECRET` no configurado / esquema no-Bearer → `401` y `getSupabaseAdmin` no llamado); flag (`APPOINTMENT_REMINDERS_ENABLED` ausente / `false` / `0` → `200 { skipped: true }`); dry-run (ausente ⇒ `true`; `false` ⇒ modo real); respuesta con `cadencias.h24` / `cadencias.sameDay`; dedup (llave existente ⇒ `skipped`); opt-out excluye el envío; fallo de proveedor no interrumpe la corrida.
  - Verificación: `npx vitest run app/api/cron/appointment-reminders/route.test.ts` → falla (ruta inexistente / casos RED).
- [ ] 3.2 **GREEN** — Implementar `app/api/cron/appointment-reminders/route.ts`: `export const dynamic = 'force-dynamic'`; `POST` con `readBearerToken` + `timingSafeStringEqual` (copia literal de pagos) que responde `401` sin trabajo si `CRON_SECRET` falta; `isFeatureEnabled('APPOINTMENT_REMINDERS_ENABLED')` (solo `'true'`/`'1'`) ⇒ `200 { skipped: true }` sin tocar Supabase; `resolveDryRun('APPOINTMENT_REMINDERS_DRY_RUN')` default `true`; ejecutar las dos cadencias en una corrida; re-filtrar opt-out por teléfono desde `whatsapp_contacts.opt_in_status === 'opted_out'`; iterar candidato por candidato registrando `failed` sin abortar; responder `{ sent, skipped, dryRun, cadencias }`; alias `GET` → `POST`.
  - Verificación: `npx vitest run app/api/cron/appointment-reminders/route.test.ts` → pasa.
- [ ] 3.3 **TRIANGULATE** — Confirmar que (a) `CRON_SECRET` ausente ⇒ `401` **sin** trabajo y (b) `dryRun` no apagado explícitamente ⇒ **ningún** envío real (`sendWhatsAppTemplateMessage` no se llama). Agregar los casos si no quedaron en 3.1.
  - Verificación: `npx vitest run app/api/cron/appointment-reminders/route.test.ts` → pasa.
- [ ] 3.4 **REFACTOR** — Extraer helpers de auth/flag si repiten, manteniendo la prueba en verde.
  - Verificación: `npx vitest run app/api/cron/appointment-reminders/route.test.ts` → sigue pasando.

## 4. `vercel.json`

- [ ] 4.1 Agregar al arreglo `crons` la corrida base obligatoria `{ "path": "/api/cron/appointment-reminders", "schedule": "0 15 * * *" }` (09:00 `America/Mexico_City`), conservando `payment-reminders`.
  - Verificación: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"` → JSON válido; confirmar la entrada.
- [ ] 4.2 (Condicional, según plan de Vercel — ver Open Questions) Agregar la segunda corrida `{ "path": "/api/cron/appointment-reminders", "schedule": "0 3 * * *" }` (21:00 clínica) **solo** si el plan permite frecuencia sub-diaria; si es Hobby, dejar la corrida única y documentar la limitación como fallback.
  - Verificación: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"` → JSON válido; confirmar cuántas entradas de `appointment-reminders` hay.

## 5. Visibilidad: data layer admin

- [ ] 5.1 **RED** — Extender `src/lib/admin/__tests__/appointments.test.ts` (agrupa `appointment_reminders` por `appointment_id` y devuelve `reminders`, incluido el caso sin recordatorios) y `app/api/admin/appointments/route.test.ts` (el payload de `GET` incluye `reminders` por cita y `[]` cuando no hay).
  - Verificación: `npx vitest run src/lib/admin/__tests__/appointments.test.ts app/api/admin/appointments/route.test.ts` → falla.
- [ ] 5.2 **GREEN** — En `src/lib/admin/types.ts` agregar `AppointmentReminderSummary` (`cadence`, `status`, `sentAt`, `dryRun`, `createdAt`) y `reminders: AppointmentReminderSummary[]` en `Appointment`. En `src/lib/admin/appointments.ts`, tras leer las citas, hacer una consulta adicional a `appointment_reminders` con `.in('appointment_id', ids)` (patrón "join manual" de `patientsFor` en `src/lib/wcc-payments.ts`) y agrupar por `appointment_id` en `mapRow`, sin tocar `SELECT_COLUMNS`.
  - Verificación: `npx vitest run src/lib/admin/__tests__/appointments.test.ts app/api/admin/appointments/route.test.ts` → pasa.
- [ ] 5.3 **TRIANGULATE/REFACTOR** — Caso sin recordatorios (`reminders: []`) y orden estable; limpiar si hace falta.
  - Verificación: `npx vitest run src/lib/admin/__tests__/appointments.test.ts app/api/admin/appointments/route.test.ts` → sigue pasando.

## 6. Visibilidad: panel de citas

- [ ] 6.1 **RED** — Extender `app/(admin)/appointments/page.test.tsx`: nueva columna de recordatorio (H-24 `sent` con fecha, `same_day` `sent`, `scheduled` + `dryRun` → "Simulado (dry-run)", sin recordatorios → "Sin recordatorio") y etiqueta legible de estado de confirmación ("Sin confirmar"/"Confirmada"). Ampliar el mock de `fetch` por URL para que `/api/admin/appointments` incluya `reminders`.
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` → falla.
- [ ] 6.2 **GREEN** — En `app/(admin)/appointments/page.tsx` agregar la columna "Recordatorio" al `DataTable` con los badges (fecha en `America/Mexico_City`) y la etiqueta legible de estado de confirmación; nunca mostrar una fecha inexistente.
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` → pasa.
- [ ] 6.3 **TRIANGULATE/REFACTOR** — Caso de cita sin recordatorios y de `same_day` enviado; limpiar el render.
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` → sigue pasando.

## 7. Visibilidad: Command Center — tab Citas

Archivos nuevos: `src/lib/wcc-appointments.ts` (+ `src/lib/wcc-appointments.test.ts`), `app/(admin)/whatsapp-command-center/appointments/page.tsx` (+ `page.test.tsx`). Modificado: `app/(admin)/whatsapp-command-center/layout.tsx`.
Referencia de patrón: `src/lib/wcc-payments.ts` (+ test) y `app/(admin)/whatsapp-command-center/payments/page.tsx`.

- [ ] 7.1 **RED** — Escribir `src/lib/wcc-appointments.test.ts` (orden por `start_at`, `hoursUntilStart`, ventana que excluye fuera de `windowHours`, `isConfiguredButUnavailable` cuando el cliente lanza, estado vacío) y `app/(admin)/whatsapp-command-center/appointments/page.test.tsx` (render de citas con "en X h"; H-24 enviado muestra la fecha; sin recordatorio muestra estado neutro; lista vacía muestra `WccEmptyState`).
  - Verificación: `npx vitest run src/lib/wcc-appointments.test.ts "app/(admin)/whatsapp-command-center/appointments/page.test.tsx"` → falla.
- [ ] 7.2 **GREEN** — Implementar `src/lib/wcc-appointments.ts` con `WccAppointmentReminderRow`, `WccUnconfirmedAppointmentRow`, `WccAppointmentsQueue` y `getWccUnconfirmedAppointments(filters?)`: `status IN ('requested','pending')`, `start_at >= now` y `start_at < now + windowHours` (default `WCC_APPOINTMENTS_WINDOW_HOURS` = 72), orden `start_at ASC`, join manual a `patients`/`providers` y recordatorios por `appointment_id`; contrato `isSupabaseConfigured` / `isConfiguredButUnavailable` / vacío (nunca lanza).
  - Verificación: `npx vitest run src/lib/wcc-appointments.test.ts` → pasa.
- [ ] 7.3 **GREEN** — Implementar `app/(admin)/whatsapp-command-center/appointments/page.tsx` como server component `async` con `export const dynamic = 'force-dynamic'`: lista las citas sin confirmar ordenadas por `start_at` con "en X h" y el estado de recordatorio por cita (H-24 enviado con fecha / "Sin recordatorio H-24" / estado `same_day`); lista vacía con `WccEmptyState`. Reutilizar `WccEmptyState`/`WccNotice` y `formatRelativeTime`.
  - Verificación: `npx vitest run "app/(admin)/whatsapp-command-center/appointments/page.test.tsx"` → pasa.
- [ ] 7.4 **GREEN** — Agregar la entrada `{ href: '/whatsapp-command-center/appointments', label: 'Citas' }` al arreglo `wccNav` en `app/(admin)/whatsapp-command-center/layout.tsx` (sin tocar `nav-link.tsx`).
  - Verificación: `npx vitest run "app/(admin)/whatsapp-command-center/appointments/page.test.tsx"` (la ruta se resuelve) + lectura del `wccNav`.
- [ ] 7.5 **TRIANGULATE/REFACTOR** — Caso sin citas sin confirmar (estado vacío) y cita que pasa a `confirmed` deja de aparecer (`status IN (...)`); limpiar si hace falta.
  - Verificación: `npx vitest run src/lib/wcc-appointments.test.ts "app/(admin)/whatsapp-command-center/appointments/page.test.tsx"` → sigue pasando.

## 8. Verificación final

- [ ] 8.1 Ejecutar la suite completa: `npm run test`.
- [ ] 8.2 Ejecutar el typecheck: `npx tsc --noEmit`.
- [ ] 8.3 Ejecutar el lint: `npm run lint`. **Nota:** `package.json` no define el script `lint` (ni depende de `eslint`); si no existe, registrar la limitación en lugar de inventar un runner.
- [ ] 8.4 Ejecutar el build: `npm run build`.
- [ ] 8.5 Verificación manual de despliegue seguro (`design.md` §7): el commit llega con `APPOINTMENT_REMINDERS_ENABLED` ausente (flag off) y `APPOINTMENT_REMINDERS_DRY_RUN` ausente (default `true`); confirmar que el orden de `bodyParameters` está congelado contra la plantilla aprobada **antes** de cualquier envío real.
  - Verificación: revisión de que no se hardcodea `true` en el flag ni `false` en dry-run.

---

## Forecast

- **Tareas:** 30 checkboxes en 8 secciones de verificación.
- **Archivos nuevos:** 10 — `supabase/migrations/0018_appointment_reminders.sql`, `supabase/migrations/down/0018_appointment_reminders.down.sql`, `src/lib/citas/send-appointment-reminder.ts`, `src/lib/citas/__tests__/send-appointment-reminder.test.ts`, `app/api/cron/appointment-reminders/route.ts`, `app/api/cron/appointment-reminders/route.test.ts`, `src/lib/wcc-appointments.ts`, `src/lib/wcc-appointments.test.ts`, `app/(admin)/whatsapp-command-center/appointments/page.tsx`, `app/(admin)/whatsapp-command-center/appointments/page.test.tsx`.
- **Archivos modificados:** 8 — `vercel.json`, `src/lib/admin/types.ts`, `src/lib/admin/appointments.ts`, `src/lib/admin/__tests__/appointments.test.ts`, `app/api/admin/appointments/route.test.ts`, `app/(admin)/appointments/page.tsx`, `app/(admin)/appointments/page.test.tsx`, `app/(admin)/whatsapp-command-center/layout.tsx`.
- **Líneas aproximadas:** ~1,500–2,200 (implementación ~700–900; pruebas ~600–900; migración ~90; config/vistas ~150–300).
- **Riesgo de tamaño de review:** **alto**. La implementación más las pruebas superan con holgura el umbral de ~400 líneas que pide `chained-pr`. Recomendación: dividir en PRs encadenados por capacidad (1) migración + helper, (2) cron + `vercel.json`, (3) visibilidad (data layer + panel + Command Center), cada uno con sus pruebas.
- **Riesgo de dependencia externa:** la plantilla `recordatorio_cita` en Meta es un prerequisito para el envío real, pero no bloquea el Apply (el cron se despliega apagado y en dry-run).
- **Riesgo de runner:** `npm run lint` falla hoy por falta de script en `package.json` (ver 8.3); es un hueco de verificación, no del cambio.

## Decision needed before apply

**Decision needed before apply: No.**

Las dos open questions del `design.md` tienen fallbacks documentados que permiten aplicar sin bloquear:

- **(a) Segunda corrida diaria de cron según plan de Vercel.** La corrida base obligatoria `0 15 * * *` (09:00 clínica) funciona en Hobby y Pro y cubre el `same_day` y una pasada del H-24. El fallback explícito es una **sola corrida diaria** si el plan es Hobby, aceptando como limitación conocida que las citas antes de las 09:00 del día siguiente dependen del recordatorio `same_day`, y documentándolo en el runbook. La tarea 4.2 queda marcada como condicional; el Apply puede proceder con la corrida única y agregar la segunda después sin cambiar código.
- **(b) Verificación del verbo GET de Vercel en producción.** El diseño agrega el **alias `GET` → `POST`** en la ruta nueva (tarea 3.2), de modo que el endpoint responde correctamente tanto si Vercel Cron invoca con `GET` como con `POST`. La verificación en logs de `payment-reminders` es informativa, no un prerequisito: cualquiera de los dos verbos funciona sin cambio adicional.

Otras open questions del diseño tampoco bloquean: la dirección del consultorio no se envía en `bodyParameters` (solo config), la ventana del tab tiene default operativo `WCC_APPOINTMENTS_WINDOW_HOURS=72`, y el parsing de botones Quick Reply pertenece al issue #87 (fuera de alcance). Quedan como ajustes posteriores habilitables por configuración o re-aprobación de plantilla, no como decisiones previas al Apply.
