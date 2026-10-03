# Tasks: Lista diaria de pacientes a contactar (Clara ligera)

**Cambio:** `clara-daily-contact-list` (issue #
[#89](https://github.com/proyecto-polaris-ia/medica-app/issues/89),
fases 1–3, decisión del usuario 2026-10-03).
**Capability:** nueva `follow-up` — contrato normativo en
`specs/follow-up/spec.md` (16 requirements, 48 escenarios).
**Design:** `design.md` (rutas, migraciones `0019`/`0020`, corte de API,
componentes y forecast por fase).

**TDD:** `strict_tdd: true` (`openspec/config.yaml`) → RED → GREEN →
TRIANGULATE → REFACTOR. Cada tarea de implementación va precedida por su tarea
de prueba en rojo y la observación RED queda anotada en la verificación de esa
tarea. Runner autorizado: `npm run test` (Vitest). Verificación global:
`npx tsc --noEmit` y `npm run build` (`npm run lint` **no** existe en
`package.json`; se registra la limitación, no se inventa runner).

**Principios que no se negocian en esta entrega:** el LLM no participa (reglas
puras + plantillas deterministas); **nunca** hay envío automático ni cron; todo
instante nuevo se persiste como `timestamptz` y se presenta en
`America/Mexico_City`; el cambio es **aditivo** (no altera tablas, rutas ni
contratos existentes).

---

## Decisión de entrega: 3 PRs apilados (ya decidida, no pendiente)

El usuario ya decidió entregar el cambio como **PRs apilados por fase**
(2026-10-03), en línea con el patrón del issue #87. No queda una decisión de
entrega abierta; la cadena es:

- **PR 1 (Fase 1):** lib `src/lib/admin/follow-up/` — `config.ts`, `types.ts`,
  `rules.ts` (reglas puras + tests) y capa de datos `follow-up.ts` (+ helper
  `clinicDayKey` en `clinic-time.ts`) + tests.
- **PR 2 (Fase 2):** migración `0019` + down, API admin
  (`GET /api/admin/follow-up`, `POST /api/admin/follow-up/contacts`) + route
  tests, página `app/(admin)/follow-up/` + componentes, y preselección mínima
  del wizard.
- **PR 3 (Fase 3):** migración `0020` + down, `draft.ts` puro + tests
  (guardrails de texto), API de borradores (crear / aprobar / rechazar / enviar)
  + route tests, superficie de aprobación en el WCC
  (`whatsapp-command-center/follow-up-drafts`) e integración con la página
  `follow-up`.

Cada PR es incremental y desplegable por separado: Fase 1 no cambia
comportamiento observable, Fase 2 introduce `0019` y la página, Fase 3
introduce `0020` y el envío aprobado.

---

## Superficies de edición (Apply)

**Nuevos (Fase 1):** `src/lib/admin/follow-up/config.ts`,
`src/lib/admin/follow-up/types.ts`, `src/lib/admin/follow-up/rules.ts`,
`src/lib/admin/follow-up/follow-up.ts`,
`src/lib/admin/follow-up/__tests__/rules.test.ts`,
`src/lib/admin/follow-up/__tests__/follow-up.test.ts`.

**Modificados (Fase 1):** `src/lib/admin/clinic-time.ts` (solo añade
`clinicDayKey`), `src/lib/admin/__tests__/clinic-time.test.ts` (extiende).

**Nuevos (Fase 2):** `supabase/migrations/0019_follow_up_contacts.sql`,
`supabase/migrations/down/0019_follow_up_contacts.down.sql`,
`app/api/admin/follow-up/route.ts`,
`app/api/admin/follow-up/route.test.ts`,
`app/api/admin/follow-up/contacts/route.ts`,
`app/api/admin/follow-up/contacts/route.test.ts`,
`app/(admin)/follow-up/page.tsx`,
`src/components/admin/follow-up/FollowUpList.tsx`,
`src/components/admin/follow-up/FollowUpCaseCard.tsx`,
`src/components/admin/follow-up/__tests__/FollowUpList.test.tsx`.

**Modificados (Fase 2):** `src/lib/admin/validate.ts`
(`parseFollowUpContactStatus`), `src/lib/admin/__tests__/validate.test.ts`
(extiende), `src/lib/admin/patients.ts` (`getPatient`),
`src/lib/admin/__tests__/patients.test.ts` (extiende),
`app/(admin)/appointments/new/page.tsx`, `src/components/booking/BookingWizard.tsx`,
`src/components/booking/ConfirmStep.tsx`, `app/(admin)/layout.tsx`.

**Nuevos (Fase 3):** `supabase/migrations/0020_follow_up_message_drafts.sql`,
`supabase/migrations/down/0020_follow_up_message_drafts.down.sql`,
`src/lib/admin/follow-up/draft.ts`,
`src/lib/admin/follow-up/__tests__/draft.test.ts`,
`src/lib/follow-up/send-follow-up-draft.ts`,
`src/lib/follow-up/__tests__/send-follow-up-draft.test.ts`,
`src/lib/wcc-follow-up-drafts.ts`,
`app/api/admin/follow-up/drafts/route.ts`,
`app/api/admin/follow-up/drafts/route.test.ts`,
`app/api/admin/follow-up/drafts/[id]/route.ts`,
`app/api/admin/follow-up/drafts/[id]/route.test.ts`,
`app/api/admin/follow-up/drafts/[id]/send/route.ts`,
`app/api/admin/follow-up/drafts/[id]/send/route.test.ts`,
`app/(admin)/whatsapp-command-center/follow-up-drafts/page.tsx`,
`app/(admin)/whatsapp-command-center/follow-up-drafts/page.test.tsx`,
`app/(admin)/whatsapp-command-center/follow-up-drafts/draft-actions.tsx`.

**Modificados (Fase 3):** `src/lib/whatsapp/store.ts`
(`insertFollowUpOutboundMessage`),
`app/(admin)/whatsapp-command-center/page.tsx` (tarjeta en `sections`).

Traza de requirements: R1–R16 según la tabla final de este documento.

---

## Forecast de carga y riesgo

| Fase / PR | Archivos | Líneas estimadas | Riesgo de review | Riesgo técnico |
|---|---|---|---|---|
| **Fase 1 · PR 1** — lib pura + capa de datos | 8 (6 nuevos + 2 modificados) | ~850–950 | **High** (supera el presupuesto de 400 líneas) | **Low** — lógica pura, determinista y unit-testeable |
| **Fase 2 · PR 2** — migración `0019` + API + página + wizard | 15 (11 nuevos + 4 modificados) | ~800–900 | **High** (supera el presupuesto de 400 líneas) | **Medium** — cambio aditivo a `BookingWizard`/`ConfirmStep` con prop opcional |
| **Fase 3 · PR 3** — migración `0020` + borradores + WCC + envío | 16 (13 nuevos + 2 modificados) | ~1000–1150 | **High** (supera el presupuesto de 400 líneas) | **High** — envío HSM externo, idempotencia y dependencia operativa de plantilla Meta |
| **Total** | ~39 (30 nuevos + 9 modificados) | ~2650–3000 | **High** | **Medium-High** |

**Estrategia de mitigación:** cada fase es un PR apilado revisable de forma
independiente; la revisión se enfoca por fase (reglas puras → persistencia y UI
→ borradores y envío). Los tres PR superan el umbral de 400 líneas de
`chained-pr`, y esa cadena apilada es justamente la mitigación acordada.

---

## 1. Fase 1 — Reglas puras y capa de datos (PR 1)

**Objetivo:** entregar la segmentación determinista como módulo puro y su capa de
lectura/persistencia, sin cambiar comportamiento observable. Archivos de
implementación: `src/lib/admin/follow-up/config.ts`, `rules.ts`, `types.ts`,
`follow-up.ts` y el helper nuevo `clinicDayKey` en
`src/lib/admin/clinic-time.ts`. Archivos de prueba:
`src/lib/admin/follow-up/__tests__/rules.test.ts` y
`src/lib/admin/follow-up/__tests__/follow-up.test.ts`, más la extensión de
`src/lib/admin/__tests__/clinic-time.test.ts`.

- [x] 1.1 **RED** — Escribir en
  `src/lib/admin/follow-up/__tests__/rules.test.ts` los casos del segmento de
  no-shows recuperables (`design.md` §1.2): no-show con `start_at` hace 30 días
  sin cita posterior → incluido; **límite exacto de 90 días** → incluido
  (`daysBetween <= NO_SHOW_WINDOW_DAYS`); no-show hace 20 días con cita
  `attended` posterior hace 5 días → excluido; no-show hace 20 días con **solo**
  citas `cancelled` posteriores → incluido; no-show con cita posterior
  `rescheduled` → excluido (su estado es `!== 'cancelled'`). Importar
  `daysBetween` e `isRecoverableNoShow`.
  - Verificación: `npm run test -- src/lib/admin/follow-up/__tests__/rules.test.ts`
    → **falla** (módulo `@/lib/admin/follow-up/rules` inexistente; casos RED).
  - **Traza:** R1.
- [x] 1.2 **GREEN** — Implementar `src/lib/admin/follow-up/config.ts`
  (`NO_SHOW_WINDOW_DAYS = 90`, `STALLED_TREATMENT_DAYS = 45`,
  `INACTIVE_PATIENT_MONTHS = 6`, `INACTIVE_PATIENT_DAYS = INACTIVE_PATIENT_MONTHS
  * 30`, `UNANSWERED_QUOTE_DAYS = 21`, `FOLLOW_UP_REASON_PRIORITY`, `MS_PER_DAY`)
  y en `rules.ts` `daysBetween`, `isRecoverableNoShow` con las condiciones
  exactas del design (sin cita posterior con `startAt > noShow.startAt` y
  `status !== 'cancelled'`). Sin I/O y con `now: Date` explícito.
  - Verificación: `npm run test -- src/lib/admin/follow-up/__tests__/rules.test.ts`
    → **pasa** los casos de 1.1.
  - **Traza:** R1, R6.
- [x] 1.3 **RED** — Extender `rules.test.ts` con el segmento de tratamientos
  inconclusos (`design.md` §1.2): plan `in_progress` con última visita
  (`clinical_visits.created_at` máxima) hace 60 días → incluido; última visita
  hace 30 días → excluido; plan `in_progress` sin visitas creado hace 60 días →
  incluido usando `treatment_plans.created_at`; plan con visita de exactamente
  45 días → excluido. Importar `isStalledTreatmentPlan`.
  - Verificación: `npm run test -- src/lib/admin/follow-up/__tests__/rules.test.ts`
    → **falla** (casos RED de `isStalledTreatmentPlan`).
  - **Traza:** R2.
- [x] 1.4 **GREEN** — Implementar `isStalledTreatmentPlan(plan,
  lastVisitCreatedAt, now)` con fallback a `plan.createdAt` cuando no hay visita
  y umbral `> STALLED_TREATMENT_DAYS`.
  - Verificación: `npm run test -- src/lib/admin/follow-up/__tests__/rules.test.ts`
    → **pasa** los casos de 1.3.
  - **Traza:** R2.
- [x] 1.5 **RED** — Extender `rules.test.ts` con el segmento de pacientes
  inactivos (`design.md` §1.2): paciente con cita atendida hace 8 meses sin cita
  posterior → incluido; cita atendida hace 2 meses → excluido; paciente con cita
  futura programada cuya última cita pasada fue hace 8 meses → excluido
  (`daysBetween` negativo no califica); paciente sin ninguna cita histórica →
  excluido. Importar `isInactivePatient`.
  - Verificación: `npm run test -- src/lib/admin/follow-up/__tests__/rules.test.ts`
    → **falla** (casos RED de `isInactivePatient`).
  - **Traza:** R3.
- [x] 1.6 **GREEN** — Implementar `isInactivePatient(patientId,
  patientAppointments, now)` usando la cita no cancelada más reciente y umbral
  `daysBetween > INACTIVE_PATIENT_DAYS`.
  - Verificación: `npm run test -- src/lib/admin/follow-up/__tests__/rules.test.ts`
    → **pasa** los casos de 1.5.
  - **Traza:** R3.
- [x] 1.7 **RED** — Extender `rules.test.ts` con el segmento de presupuestos sin
  respuesta (`design.md` §1.2): plan `presented` con `updated_at` hace 30 días →
  incluido; `presented` hace 10 días → excluido; plan `accepted`/`cancelled` con
  `updated_at` hace 30 días → excluido. Importar `isUnansweredQuote`.
  - Verificación: `npm run test -- src/lib/admin/follow-up/__tests__/rules.test.ts`
    → **falla** (casos RED de `isUnansweredQuote`).
  - **Traza:** R4.
- [x] 1.8 **GREEN** — Implementar `isUnansweredQuote(plan, now)` con
  `updated_at` y umbral `> UNANSWERED_QUOTE_DAYS`, dejando el comentario de
  limitación documentada (último cambio del plan, nunca fecha de presentación).
  - Verificación: `npm run test -- src/lib/admin/follow-up/__tests__/rules.test.ts`
    → **pasa** los casos de 1.7.
  - **Traza:** R4.
- [x] 1.9 **RED** — Extender `rules.test.ts` con deduplicación y prioridad
  (`design.md` §1.2): paciente que califica a la vez para no-show y presupuesto →
  aparece **una vez** con motivo `no_show`; paciente que califica para
  tratamiento inconcluso + presupuesto + inactivo → una vez con motivo
  `treatment_in_progress`; paciente de un solo segmento conserva su motivo;
  `buildFollowUpList` no emite duplicados por `patientId`. Importar
  `pickReasonForPatient` y `buildFollowUpList`.
  - Verificación: `npm run test -- src/lib/admin/follow-up/__tests__/rules.test.ts`
    → **falla** (casos RED de deduplicación).
  - **Traza:** R5.
- [x] 1.10 **GREEN** — Implementar `pickReasonForPatient` y `buildFollowUpList`
  recorriendo `FOLLOW_UP_REASON_PRIORITY` de mayor a menor y emitiendo una sola
  entrada `FollowUpCandidate` por paciente, con `sourceAppointmentId` /
  `sourcePlanId` según el motivo.
  - Verificación: `npm run test -- src/lib/admin/follow-up/__tests__/rules.test.ts`
    → **pasa** los casos de 1.9.
  - **Traza:** R5.
- [x] 1.11 **RED** — Extender `rules.test.ts` con determinismo y umbrales
  (`design.md` §1.2): la misma `now` y los mismos datos producen listas
  idénticas en contenido **y orden**; el orden es estable por (índice de
  prioridad, `reasonDate` asc, `patientId` asc); un caso en el límite exacto de
  cada umbral depende de las constantes de `config.ts`; una `now` distinta
  cambia el resultado sin leer el reloj del sistema.
  - Verificación: `npm run test -- src/lib/admin/follow-up/__tests__/rules.test.ts`
    → **falla** (casos RED de orden/determinismo).
  - **Traza:** R6.
- [x] 1.12 **GREEN** — Añadir a `buildFollowUpList` el orden estable por
  (índice de prioridad, `reasonDate` asc, `patientId` asc) y asegurar que todas
  las comparaciones usan las constantes de `config.ts`. Ningún
  `Date.now()`/`new Date()` implícito dentro de `config.ts`/`rules.ts`.
  - Verificación: `npm run test -- src/lib/admin/follow-up/__tests__/rules.test.ts`
    → **pasa** los casos de 1.11.
  - **Traza:** R6.
- [x] 1.13 **SUPERADA** — El helper ya existe como `clinicDayKey(iso)` en
  `src/lib/admin/timezone.ts` (fuente canónica en uso por `wcc-appointments.ts`,
  calendario, etc.), con su comportamiento equivalente verificado. No se duplica
  en `clinic-time.ts` (decisión: opción C del worker; actualiza D9).
  - **Traza:** R7.
- [x] 1.14 **SUPERADA** — `currentRoundDate(now)` en
  `src/lib/admin/follow-up/follow-up.ts` delega en `timezone.ts#clinicDayKey`;
  suite de Fase 1 en verde (41 tests) y `npx tsc --noEmit` limpio.
  - **Traza:** R7.
- [x] 1.15 **RED** — Escribir
  `src/lib/admin/follow-up/__tests__/follow-up.test.ts` con Supabase mockeado
  (patrón `src/lib/citas/__tests__/send-appointment-reminder.test.ts`):
  `listDailyFollowUpCases` ejecuta un número **constante** de queries (lectura
  masiva, sin N+1) sobre `appointments`, `treatment_plans` (`in_progress` /
  `presented`), `clinical_visits` y `patients` (`SELECT_COLUMNS` explícitos,
  nunca `select('*')`); filtra por `follow_up_contacts` con
  `.eq('round_date', roundDate)`; excluye de la lista a pacientes `contacted` o
  `dismissed` de la ronda actual; un estado de la ronda de ayer **no** excluye
  hoy; `markFollowUpContact` hace `upsert` con
  `onConflict: 'patient_id,round_date'` y persiste `contacted_at` /
  `dismissed_at` como instante de `now` inyectado; `currentRoundDate(now)`
  delega en `clinicDayKey`.
  - Verificación: `npm run test -- src/lib/admin/follow-up/__tests__/follow-up.test.ts`
    → **falla** (módulo `@/lib/admin/follow-up/follow-up` inexistente; casos RED).
  - **Traza:** R7, R9, R10, R12.
- [x] 1.16 **GREEN** — Implementar `src/lib/admin/follow-up/types.ts`
  (`FollowUpCase`, `FollowUpContact`, `FollowUpContactStatus`, `FollowUpDraft`,
  `FollowUpDraftStatus`; errores y validación **reutilizados** de `../errors` y
  `../validate`, sin jerarquía paralela) y `follow-up.ts` con
  `SELECT_COLUMNS` explícitos, `mapRow` snake→camel, `getSupabaseAdmin()`,
  `listDailyFollowUpCases({ now? })`, `loadFollowUpContactsForRound`,
  `markFollowUpContact({ ... now? })` y `currentRoundDate(now)`.
  **Desviación registrada:** `currentRoundDate(now)` delega en el
  `clinicDayKey(iso)` ya existente de `src/lib/admin/timezone.ts` (fuente canónica
  en uso por `wcc-appointments.ts`), porque 1.13/1.14 (helper en
  `clinic-time.ts`) quedan fuera de las superficies de edición autorizadas.
  Decisión humana pendiente en el reporte.
  - Verificación: `npm run test -- src/lib/admin/follow-up/__tests__/follow-up.test.ts`
    → **pasa** los casos de 1.15.
  - **Traza:** R7, R9, R10, R12.
- [x] 1.17 **TRIANGULATE/REFACTOR** — Cubrir negativos que protegen el contrato:
  arrays vacíos (sin citas/planes/visitas) no lanzan; un plan `completed` no
  entra; un no-show fuera de la ventana (>90 días) no entra; `rescheduled`
  cuenta como cita posterior; una cita cancelada pasada no cuenta como "cita
  histórica"; el mismo paciente con dos no-shows recuperables produce **una**
  entrada. Limpiar nombres y constantes manteniendo la suite de Fase 1 en verde.
  - Verificación: `npm run test -- src/lib/admin/follow-up/__tests__/rules.test.ts src/lib/admin/follow-up/__tests__/follow-up.test.ts src/lib/admin/__tests__/clinic-time.test.ts`
    → **pasa**.
  - **Traza:** R1, R2, R3, R4, R5, R6, R7.

**Cobertura de spec (Fase 1):** R1, R2, R3, R4, R5, R6, R7, R9 (persistencia
base), R10 (persistencia base), R12 (estado de contacto, parte de datos).

---

## 2. Fase 2 — Migración `0019`, API y página con acciones manuales (PR 2)

**Objetivo:** persistir el estado de contacto, exponer la API admin autenticada,
entregar la página `app/(admin)/follow-up/` con las acciones manuales y habilitar
la preselección del paciente en el wizard existente. Archivos de implementación:
migración `0019` + down, `app/api/admin/follow-up/…`, `validate.ts`
(`parseFollowUpContactStatus`), `src/components/admin/follow-up/…`,
`app/(admin)/follow-up/page.tsx`, `src/lib/admin/patients.ts` (`getPatient`),
`app/(admin)/appointments/new/page.tsx`, `BookingWizard.tsx`, `ConfirmStep.tsx` y
`app/(admin)/layout.tsx`.

- [x] 2.1 **Migración `0019` + down** — Crear
  `supabase/migrations/0019_follow_up_contacts.sql` (`design.md` §2.1): enum
  idempotente `follow_up_contact_status ('contacted','dismissed')` en bloque
  `DO $$`; tabla `follow_up_contacts` con `patient_id uuid NOT NULL REFERENCES
  patients(id) ON DELETE CASCADE`, `round_date date NOT NULL`, `status`,
  `contacted_at timestamptz`, `dismissed_at timestamptz`, `note text`,
  `created_by uuid` (sin FK, criterio de `treatment_plans.created_by`),
  `created_at`/`updated_at timestamptz`, `UNIQUE (patient_id, round_date)`;
  índice `idx_follow_up_contacts_round (round_date, status)`; trigger
  `follow_up_contacts_set_updated_at` con guarda `IF NOT EXISTS`; y **RLS
  patrón 0018 exacto** (`ENABLE` + `FORCE ROW LEVEL SECURITY`, `REVOKE ALL` de
  `anon` y `authenticated`, `GRANT` a `authenticated`, policy
  `follow_up_contacts_admin_all FOR ALL TO authenticated USING ((SELECT
  auth.uid()) IS NOT NULL) WITH CHECK (...)`). Crear
  `supabase/migrations/down/0019_follow_up_contacts.down.sql` en orden
  `DROP INDEX` → `DROP TABLE` → `DROP TYPE`.
  - Verificación: releer la migración up (cada `CREATE` con `IF NOT EXISTS`,
    enum con guarda `pg_type`) y confirmar que el down invierte el orden
    (índices → tabla → tipo) con `IF EXISTS`.
  - **Traza:** R12.
- [x] 2.2 **RED** — Escribir `app/api/admin/follow-up/route.test.ts` con auth y
  `@/lib/admin/follow-up/follow-up` mockeados (patrón
  `app/api/admin/appointments/route.test.ts`): sin sesión → `401`; con sesión →
  `200 { cases, roundDate }`; el handler calcula `now` en el servidor y no recibe
  la fecha del cliente; `export const dynamic = 'force-dynamic'`.
  - Verificación: `npm run test -- app/api/admin/follow-up/route.test.ts`
    → **falla** (ruta inexistente; casos RED).
  - **Traza:** R8.
- [x] 2.3 **GREEN** — Implementar `app/api/admin/follow-up/route.ts` con
  `export const dynamic = 'force-dynamic'`, `GET` envuelto en
  `handleAdminRequest` + `requireUser()` y `listDailyFollowUpCases()` +
  `currentRoundDate()`.
  - Verificación: `npm run test -- app/api/admin/follow-up/route.test.ts`
    → **pasa**.
  - **Traza:** R8.
- [x] 2.4 **RED** — Escribir
  `app/api/admin/follow-up/contacts/route.test.ts`: sin sesión → `401`; `POST {
  patientId, status: 'contacted' }` válido → `201 { contact }` con
  `contacted_at` persistido y `created_by = user.id`; `status: 'dismissed'` →
  `201` con estado descartado; `note` opcional se persiste; `status` inválido o
  `patientId` no-UUID → `400`; `patientId` inexistente → `404`.
  - Verificación: `npm run test -- app/api/admin/follow-up/contacts/route.test.ts`
    → **falla** (ruta válida no existe / `parseFollowUpContactStatus` inexistente).
  - **Traza:** R9, R10.
- [x] 2.5 **GREEN** — Añadir `parseFollowUpContactStatus(value)` (enum cerrado
  `contacted | dismissed`, `ValidationError` si no coincide) a
  `src/lib/admin/validate.ts` e implementar
  `app/api/admin/follow-up/contacts/route.ts` (`handleAdminRequest` +
  `requireUser()`, `POST` → `markFollowUpContact({ patientId, status, note,
  userId, now })`, `201 { contact }`).
  - Verificación: `npm run test -- app/api/admin/follow-up/contacts/route.test.ts`
    → **pasa**.
  - **Traza:** R9, R10.
- [x] 2.6 **RED** — Escribir
  `src/components/admin/follow-up/__tests__/FollowUpList.test.tsx`: la lista
  agrupa casos por motivo; cada caso muestra nombre, teléfono y `reasonLabel` +
  `reasonDate` formateada en `America/Mexico_City`; "Marcar contactado" y
  "Descartar" hacen `POST` a `/api/admin/follow-up/contacts` y recargan la lista;
  "Agendar cita" es un `<Link>` a `/appointments/new?patientId=<id>` que **solo
  navega** (no crea cita ni cambia el estado de contacto); "Generar borrador"
  aparece como acción de Fase 3.
  - Verificación: `npm run test -- src/components/admin/follow-up/__tests__/FollowUpList.test.tsx`
    → **falla** (componente inexistente; casos RED).
  - **Traza:** R8, R9, R10, R11.
- [x] 2.7 **GREEN** — Implementar
  `src/components/admin/follow-up/FollowUpList.tsx` y `FollowUpCaseCard.tsx`
  (client) con la agrupación por motivo, los datos mínimos del paciente y las
  cuatro acciones; "Agendar cita" como `<Link>` puro.
  - Verificación: `npm run test -- src/components/admin/follow-up/__tests__/FollowUpList.test.tsx`
    → **pasa**.
  - **Traza:** R8, R9, R10, R11.
- [x] 2.8 **GREEN** — Implementar `app/(admin)/follow-up/page.tsx` como server
  component delgado (patrón `appointments/new/page.tsx`) que renderiza
  `FollowUpList` (client-fetch de `/api/admin/follow-up`) y agregar
  `{ href: '/follow-up', label: 'Seguimiento' }` a `navItems` en
  `app/(admin)/layout.tsx`.
  - Verificación: `npm run test -- app/api/admin/follow-up/route.test.ts src/components/admin/follow-up/__tests__/FollowUpList.test.tsx`
    → **pasa**; `npx tsc --noEmit` sin errores de tipos en la ruta nueva.
  - **Traza:** R8.
- [x] 2.9 **RED** — Escribir/extender
  `src/lib/admin/__tests__/patients.test.ts` para `getPatient(id)`
  (`.maybeSingle()`, reutiliza `SELECT_COLUMNS`/`mapRow`; `id` inválido lanza
  `ValidationError`; inexistente → `null`) y un caso de componente que verifica
  que `ConfirmStep` sembrado con `initialPatient` deja `patientId`, `phone`,
  `email` y `fullName` preseleccionados sin volver a elegir en `PatientSearch`.
  - Verificación: `npm run test -- src/lib/admin/__tests__/patients.test.ts`
    → **falla** (`getPatient` no exportado; caso RED de preselección).
  - **Traza:** R11.
- [x] 2.10 **GREEN** — Implementar `getPatient` en `src/lib/admin/patients.ts`;
  `app/(admin)/appointments/new/page.tsx` recibe
  `searchParams: Promise<{ patientId?: string }>`, valida con `parseUuid` y
  obtiene el paciente server-side; `BookingWizard` acepta `initialPatient?`
  opcional y lo pasa a `ConfirmStep`; `ConfirmStep` siembra el estado inicial
  exacto que hoy llena `PatientSearch`. Sin `initialPatient` el wizard se
  comporta igual que hoy (cero regresión).
  - Verificación: `npm run test -- src/lib/admin/__tests__/patients.test.ts`
    → **pasa**; `npx tsc --noEmit` sin errores.
  - **Traza:** R11.
- [x] 2.11 **TRIANGULATE/REFACTOR** — Cubrir negativos que protegen el contrato:
  `anon` no accede a `follow_up_contacts` (revisión de RLS de 2.1); un paciente
  contactado/descartado en la ronda no reaparece tras recargar; un estado de la
  ronda de ayer no excluye hoy; el `POST` de contacto con `note` larga no rompe;
  "Agendar cita" no crea cita ni toca el estado de contacto. Limpiar la UI y el
  handler manteniendo la suite de Fase 2 en verde.
  - Verificación: `npm run test -- app/api/admin/follow-up/route.test.ts app/api/admin/follow-up/contacts/route.test.ts src/components/admin/follow-up/__tests__/FollowUpList.test.tsx src/lib/admin/__tests__/patients.test.ts src/lib/admin/__tests__/validate.test.ts`
    → **pasa**.
  - **Traza:** R8, R9, R10, R11, R12.

**Cobertura de spec (Fase 2):** R8, R9, R10, R11, R12.

---

## 3. Fase 3 — Borradores con aprobación humana y envío (PR 3)

**Objetivo:** generar borradores deterministas con guardrails, exponer su ciclo
de aprobación en el WhatsApp Command Center y habilitar el envío **solo** tras
aprobación humana por el transporte existente. Archivos de implementación:
migración `0020` + down, `src/lib/admin/follow-up/draft.ts`,
`src/lib/follow-up/send-follow-up-draft.ts`, el helper nuevo en
`src/lib/whatsapp/store.ts`, `src/lib/wcc-follow-up-drafts.ts`, las rutas
`app/api/admin/follow-up/drafts/…` y la superficie
`app/(admin)/whatsapp-command-center/follow-up-drafts/`.

- [x] 3.1 **Migración `0020` + down** — Crear
  `supabase/migrations/0020_follow_up_message_drafts.sql` (`design.md` §3.1):
  enum idempotente `follow_up_draft_status ('draft','approved','rejected',
  'sent','sent_failed')`; tabla `follow_up_message_drafts` con `patient_id`,
  `body text NOT NULL`, `template_name text NOT NULL DEFAULT
  'seguimiento_paciente'`, `status … DEFAULT 'draft'`, `dedup_key text NOT NULL
  UNIQUE`, `provider_message_id`, `error_message`, `approved_by`, `approved_at
  timestamptz`, `sent_at timestamptz`, `created_by`, `created_at`/`updated_at`;
  índices `idx_follow_up_drafts_status (status, created_at DESC)` y
  `idx_follow_up_drafts_patient (patient_id, created_at DESC)`; trigger
  `set_updated_at`; y **RLS patrón 0018** con policy
  `follow_up_message_drafts_admin_all`. Crear
  `supabase/migrations/down/0020_follow_up_message_drafts.down.sql` (índices →
  tabla → enum).
  - Verificación: releer la migración up (cada `CREATE` con `IF NOT EXISTS`,
    enum con guarda `pg_type`, `UNIQUE (dedup_key)`) y el down (orden inverso con
    `IF EXISTS`).
  - **Traza:** R14.
- [x] 3.2 **RED** — Escribir
  `src/lib/admin/follow-up/__tests__/draft.test.ts` (`design.md` §3.2):
  `buildFollowUpDraft({ patientName, reason })` produce un texto determinista por
  plantilla y correspondiente al motivo; **sin** precios/moneda, **sin**
  diagnósticos ni consejos clínicos, **sin** presión comercial; tono es-MX;
  `validateFollowUpDraftText` normaliza (`trim`, colapsa saltos/espacios), lanza
  `ValidationError('body', …)` por arriba de `MAX_DRAFT_LENGTH = 600` y por
  precios (`/\$\s?\d/`, `\b(precio|costo|cuánto cuesta|descuento)\b`), clínicos
  (`diagnóstico|receta|medicamento|antibiótico|analgésico|infección|dolor
  intenso`) y presión (`última oportunidad|oferta|promoción|urgente|ahora o
  nunca`). Importar `FOLLOW_UP_TEMPLATE_NAME`.
  - Verificación: `npm run test -- src/lib/admin/follow-up/__tests__/draft.test.ts`
    → **falla** (módulo inexistente; casos RED).
  - **Traza:** R13, R16.
- [x] 3.3 **GREEN** — Implementar `src/lib/admin/follow-up/draft.ts` (puro) con
  las cuatro plantillas es-MX del design (`no_show`, `treatment_in_progress`,
  `quote_no_response`, `inactive`), `FOLLOW_UP_TEMPLATE_NAME =
  'seguimiento_paciente'`, `MAX_DRAFT_LENGTH = 600`,
  `buildFollowUpDraft`, `validateFollowUpDraftText`. Sin LLM ni texto inventado.
  - Verificación: `npm run test -- src/lib/admin/follow-up/__tests__/draft.test.ts`
    → **pasa**.
  - **Traza:** R13, R16.
- [x] 3.4 **RED** — Escribir `app/api/admin/follow-up/drafts/route.test.ts`: sin
  sesión → `401`; `GET` devuelve borradores (con filtro opcional `?status=`) para
  el WCC; `POST { patientId }` genera y persiste un borrador determinista en
  `draft` → `201`; un segundo `POST` para el mismo paciente y ronda **no**
  duplica (`dedup_key = follow-up-draft:<patientId>:<roundDate>`, `UPSERT`
  `ignoreDuplicates: true`); un guardrail de texto falla → `400 invalid_request`
  sin persistir.
  - Verificación: `npm run test -- app/api/admin/follow-up/drafts/route.test.ts`
    → **falla** (ruta inexistente; casos RED).
  - **Traza:** R13, R14.
- [x] 3.5 **GREEN** — Implementar `src/lib/wcc-follow-up-drafts.ts` (patrón
  `src/lib/wcc-appointments.ts`, `getSupabaseAdmin()` server-only) y
  `app/api/admin/follow-up/drafts/route.ts` con `requireUser()` +
  `handleAdminRequest()`: `GET` lista y `POST` genera/persiste con `dedup_key` e
  `ignoreDuplicates`.
  - Verificación: `npm run test -- app/api/admin/follow-up/drafts/route.test.ts`
    → **pasa**.
  - **Traza:** R13, R14.
- [x] 3.6 **RED** — Escribir
  `app/api/admin/follow-up/drafts/[id]/route.test.ts` (`design.md` §3.3): sin
  sesión → `401`; `PATCH { status: 'approved' }` desde `draft` → transiciona y
  guarda `approved_by = user.id` y `approved_at`; `{ status: 'rejected' }` desde
  `draft` → `rejected` y **no** envía; aprobar/rechazar desde un estado distinto
  de `draft` → `409 ConflictError`; `id` inexistente → `404`.
  - Verificación: `npm run test -- app/api/admin/follow-up/drafts/[id]/route.test.ts`
    → **falla** (ruta inexistente; casos RED).
  - **Traza:** R14.
- [x] 3.7 **GREEN** — Implementar
  `app/api/admin/follow-up/drafts/[id]/route.ts` con transiciones guardadas
  (`approve`/`reject` solo desde `draft`) y `ConflictError` en cualquier otra.
  - Verificación: `npm run test -- app/api/admin/follow-up/drafts/[id]/route.test.ts`
    → **pasa**.
  - **Traza:** R14.
- [x] 3.8 **RED** — Escribir
  `src/lib/follow-up/__tests__/send-follow-up-draft.test.ts` (`design.md` §3.4,
  mock de `@/lib/supabase/server`): un borrador no `approved` (`draft`/`rejected`)
  **no** se envía (`ConflictError`); `approved` re-valida el `body` con
  `validateFollowUpDraftText` y envía por `sendWhatsAppTemplateMessage` con
  `languageCode 'es_MX'`; un teléfono `null` lanza `ValidationError` (no se
  inventa destino); éxito → borrador `sent` + `provider_message_id` + `sent_at`
  y un `outbound` en `whatsapp_messages`; fallo del transporte → `sent_failed` +
  `error_message` visible; reintento con la misma clave
  (`follow-up-draft:<draftId>`) **no** duplica el saliente ni registra un segundo
  envío.
  - Verificación: `npm run test -- src/lib/follow-up/__tests__/send-follow-up-draft.test.ts`
    → **falla** (módulo inexistente; casos RED).
  - **Traza:** R15.
- [x] 3.9 **GREEN** — Implementar
  `src/lib/follow-up/send-follow-up-draft.ts` (`sendFollowUpDraft({ draftId,
  userId })`: exige `approved`, re-valida el texto, resuelve
  `patients.phone_e164`, asegura `whatsapp_contacts` (`source='manual'`) y una
  `whatsapp_conversations` abierta, envía la plantilla HSM y persiste el
  resultado) y añadir `insertFollowUpOutboundMessage` a
  `src/lib/whatsapp/store.ts` (`upsert` en `whatsapp_messages` con
  `whatsapp_message_id = providerMessageId ?? idempotencyKey`, `direction:
  'outbound'`, `message_type: 'template'`, `payload: { purpose: 'follow_up',
  draftId }`, `ignoreDuplicates: true`). Sin cron, queue, webhook ni job que
  invoque esta función.
  - **Desviación registrada:** `insertFollowUpOutboundMessage` se implementó en
    `src/lib/follow-up/send-follow-up-draft.ts` (exportado), no en
    `src/lib/whatsapp/store.ts`, porque el alcance autorizado fijó
    `store.ts`/`client.ts` como READ-ONLY. La semántica (`upsert` en
    `whatsapp_messages` con `whatsapp_message_id = providerMessageId ??
    idempotencyKey` e `ignoreDuplicates: true`) es la especificada.
  - Verificación: `npm run test -- src/lib/follow-up/__tests__/send-follow-up-draft.test.ts`
    → **pasa**.
  - **Traza:** R15.
- [x] 3.10 **RED** — Escribir
  `app/api/admin/follow-up/drafts/[id]/send/route.test.ts`: sin sesión → `401`;
  `POST` sobre `approved` → `200` con borrador `sent`; `POST` sobre
  `draft`/`rejected` → `409` y **no** envía; reintento idempotente no duplica.
  - Verificación: `npm run test -- app/api/admin/follow-up/drafts/[id]/send/route.test.ts`
    → **falla** (ruta inexistente; casos RED).
  - **Traza:** R15.
- [x] 3.11 **GREEN** — Implementar
  `app/api/admin/follow-up/drafts/[id]/send/route.ts` con `requireUser()` +
  `handleAdminRequest()` delegando en `sendFollowUpDraft({ draftId, userId })`.
  - Verificación: `npm run test -- app/api/admin/follow-up/drafts/[id]/send/route.test.ts`
    → **pasa**.
  - **Traza:** R15.
- [x] 3.12 **RED** — Escribir
  `app/(admin)/whatsapp-command-center/follow-up-drafts/page.test.tsx`: la
  página del WCC lista borradores con el nombre del paciente y expone las
  acciones Aprobar / Rechazar / Enviar solo cuando corresponden por estado
  (`approved` habilita Enviar; `draft` habilita Aprobar/Rechazar; `sent` no
  habilita nada); un `sent_failed` muestra su `error_message`.
  - Verificación: `npm run test -- app/(admin)/whatsapp-command-center/follow-up-drafts/page.test.tsx`
    → **falla** (página inexistente; casos RED).
  - **Traza:** R14, R15.
- [x] 3.13 **GREEN** — Implementar
  `app/(admin)/whatsapp-command-center/follow-up-drafts/page.tsx` (server
  component que consume `src/lib/wcc-follow-up-drafts.ts`),
  `…/draft-actions.tsx` (client con botones Aprobar/Rechazar/Enviar contra la
  API) y la tarjeta de acceso en `app/(admin)/whatsapp-command-center/page.tsx`
  (array `sections`).
  - Verificación: `npm run test -- app/(admin)/whatsapp-command-center/follow-up-drafts/page.test.tsx`
    → **pasa**.
  - **Traza:** R14.
- [x] 3.14 **GREEN** — Integrar la página `follow-up` con la Fase 3: la acción
  "Generar borrador" en `FollowUpCaseCard.tsx` hace `POST` a
  `/api/admin/follow-up/drafts` y ofrece un enlace al WCC para aprobar. La
  generación **no** envía nada por sí misma.
  - Verificación: `npm run test -- src/components/admin/follow-up/__tests__/FollowUpList.test.tsx`
    → **pasa**; `npx tsc --noEmit` sin errores.
  - **Traza:** R13.
- [x] 3.15 **TRIANGULATE/REFACTOR** — Cubrir negativos que protegen el contrato:
  ningún proceso programado envía un `draft` (sin ruta cron); `anon` no accede a
  `follow_up_message_drafts` (RLS de 3.1); un borrador `sent` reenviado es no-op
  idempotente; un guardrail de la lista negra detecta precios, diagnósticos y
  presión comercial aunque se intente inyectar texto; el `body` persistido es
  exactamente el que se valida antes de enviar. Limpiar la orquestación
  manteniendo la suite de Fase 3 en verde.
  - Verificación: `npm run test -- src/lib/admin/follow-up/__tests__/draft.test.ts src/lib/follow-up/__tests__/send-follow-up-draft.test.ts app/api/admin/follow-up/drafts/route.test.ts "app/api/admin/follow-up/drafts/[id]/route.test.ts" "app/api/admin/follow-up/drafts/[id]/send/route.test.ts" app/(admin)/whatsapp-command-center/follow-up-drafts/page.test.tsx`
    → **pasa**.
  - **Traza:** R13, R14, R15, R16.

**Cobertura de spec (Fase 3):** R13, R14, R15, R16.

---

## 4. Fase 4 — Verificación global

- [x] 4.1 Ejecutar la suite completa: `npm run test` → **en verde**. Si falla un
  caso ajeno a este cambio, registrarlo como limitación del entorno, no como
  completado.
  - **Traza:** todos los requirements.
- [x] 4.2 Ejecutar el typecheck: `npx tsc --noEmit` → **sin errores**.
- [x] 4.3 Ejecutar el build: `npm run build` → **éxito** (compilación de las
  rutas nuevas y de `app/(admin)/follow-up/`).
- [x] 4.4 **Revisión de migraciones** — Verificar idempotencia y reversión de
  `0019` y `0020`: cada `CREATE`/`CREATE INDEX` con `IF NOT EXISTS`, cada enum
  con guarda `pg_type`, cada `CREATE POLICY`/trigger con guarda o `DROP POLICY IF
  EXISTS`, y que los `down` invierten el orden (índices → tabla → enum) con
  `IF EXISTS`. Confirmar que las policies siguen el patrón 0018
  (`ENABLE` + `FORCE`, `REVOKE ALL` de `anon`/`authenticated`, `GRANT` a
  `authenticated`).
  - Verificación: relectura de
    `supabase/migrations/0019_follow_up_contacts.sql`,
    `supabase/migrations/down/0019_follow_up_contacts.down.sql`,
    `supabase/migrations/0020_follow_up_message_drafts.sql` y
    `supabase/migrations/down/0020_follow_up_message_drafts.down.sql`.
- [x] 4.5 **Prerrequisito operativo (no bloquea el código)** — Registrar que la
  plantilla HSM `seguimiento_paciente` debe registrarse y aprobarse en Meta
  **antes del release de la Fase 3** (envío proactivo fuera de la ventana de 24
  h). No es un cambio de código: el envío degrada con `sent_failed` +
  `error_message` visible mientras la plantilla no esté aprobada.
  - Verificación: nota escrita en este tasks.md y en `design.md` §3.4; sin
    comando ejecutable asociado.
- [x] 4.6 Registrar la limitación de lint: `npm run lint` **no** existe en
  `package.json` (no hay script `lint`); **no** se inventa runner. La
  verificación global se limita a `npm run test`, `npx tsc --noEmit` y
  `npm run build`.
  - Verificación: `node -e "console.log(require('./package.json').scripts.lint)"`
    → `undefined`.

---

## Matriz de trazabilidad (requirement → tareas)

Los 16 requirements de `specs/follow-up/spec.md` quedan mapeados a tareas:

| # | Requirement (spec `follow-up`) | Tareas |
|---|---|---|
| R1 | Segmento de no-shows recuperables | 1.1, 1.2, 1.17 |
| R2 | Segmento de tratamientos inconclusos | 1.3, 1.4, 1.17 |
| R3 | Segmento de pacientes inactivos | 1.5, 1.6, 1.17 |
| R4 | Segmento de presupuestos sin respuesta | 1.7, 1.8, 1.17 |
| R5 | Deduplicación por paciente con motivo principal | 1.9, 1.10, 1.17 |
| R6 | Determinismo y umbrales configurables | 1.2, 1.11, 1.12, 1.17 |
| R7 | Exclusión de pacientes ya contactados o descartados en la ronda | 1.13, 1.14, 1.15, 1.16, 1.17 |
| R8 | Página de lista diaria protegida | 2.2, 2.3, 2.6, 2.7, 2.8, 2.11 |
| R9 | Acción marcar como contactado | 1.15, 1.16, 2.4, 2.5, 2.6, 2.7, 2.11 |
| R10 | Acción descartar | 1.15, 1.16, 2.4, 2.5, 2.6, 2.7, 2.11 |
| R11 | Acción agendar cita enlaza al wizard existente | 2.6, 2.7, 2.9, 2.10, 2.11 |
| R12 | Persistencia del estado de contacto con RLS | 1.15, 1.16, 2.1, 2.11, 4.4 |
| R13 | Generación de borrador determinista | 3.2, 3.3, 3.4, 3.5, 3.14, 3.15 |
| R14 | Aprobación humana explícita del borrador | 3.1, 3.4, 3.5, 3.6, 3.7, 3.12, 3.13, 3.15, 4.4 |
| R15 | Envío solo tras aprobación por el transporte existente | 3.8, 3.9, 3.10, 3.11, 3.12, 3.15 |
| R16 | Tono y guardrails de los textos | 3.2, 3.3, 3.15 |

**Cobertura:** 16/16 requirements con al menos una tarea de prueba RED y su
GREEN, más las verificaciones transversales de la Fase 4.

---

## Conteo de tareas

| Fase | PR | Tareas |
|---|---|---|
| Fase 1 — Reglas puras y capa de datos | PR 1 | 17 (1.1–1.17) |
| Fase 2 — Migración `0019`, API y página | PR 2 | 11 (2.1–2.11) |
| Fase 3 — Borradores y envío aprobado | PR 3 | 15 (3.1–3.15) |
| Fase 4 — Verificación global | — | 6 (4.1–4.6) |
| **Total** | 3 PRs apilados | **49** |

Ninguna tarea está marcada como completada: todas permanecen en `- [ ]` hasta su
ejecución y verificación observada.
