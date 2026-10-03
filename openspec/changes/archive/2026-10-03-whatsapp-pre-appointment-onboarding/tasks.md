# Tasks: Onboarding pre-cita por WhatsApp (historia clínica básica y datos generales)

**Cambio:** `whatsapp-pre-appointment-onboarding` (issue
[#90](https://github.com/proyecto-polaris-ia/medica-app/issues/90), 3 fases
entregadas como PRs apilados).
**Capabilities:** nuevas `whatsapp-onboarding` (8 requirements) y
`patient-onboarding-status` (4 requirements); modificadas `flow-engine`,
`whatsapp-inbound-automation` y `clinical-record`.
**Design:** `design.md` (decisiones D1–D12, plan por fases, mapa de pruebas D11).

**TDD:** `strict_tdd: true` (`openspec/config.yaml`) → RED → GREEN →
TRIANGULATE → REFACTOR. Cada tarea de implementación va precedida por su tarea
de prueba en rojo, y la observación RED queda anotada en la verificación de esa
tarea. Runner autorizado: `npm run test` (Vitest). Verificación global:
`npx tsc --noEmit`, `npm run lint` y `npm run build`.

**Principios que no se negocian:** el LLM **interpreta y redacta**, pero el
backend decide el orden, valida y escribe (path determinista de flow engine); la
historia clínica se escribe **una sola vez** y all-or-nothing tras la
confirmación explícita; urgencia → humano **pausando** el onboarding (limpiar
`flow_state`); escritura clínica solo con el teléfono confiable del propio
paciente; provenance forzada en backend; feature flag default **off**; nunca se
modifica `travelhub-app`.

---

## Decisión de entrega: 3 PRs apilados (ya decidida)

El `proposal.md` fija la entrega en **tres fases con PRs apilados**, cada una
revisable y revertible por separado:

- **PR 1 (Fase 1):** provenance `source` + migración, flujo de onboarding de
  historia clínica, disparador + flag, acciones
  `evaluateOnboardingAnswer`/`saveOnboardingHistory`, pausa por urgencia,
  `registry.ts` y control de tema (D1–D7, D11, D12).
- **PR 2 (Fase 2):** pasos `ask_email`/`show_contact_summary`/`save_contact`,
  acción `saveOnboardingContact`, `updatePatientEmail` y arranque solo-contacto
  (D4, D8, D11).
- **PR 3 (Fase 3):** tabla `onboarding_nudges`, `send-onboarding-nudge.ts`, hook
  en el cron, `onboarding-status.ts`, `OnboardingStatusBadge.tsx` e inserción en
  el expediente (D9, D10, D11, D12).

Fase 1 no cambia el panel ni el cron; Fase 2 toca `patients` sin tocar historia
clínica; Fase 3 es aditiva (tabla y componente propios) y su rollback no toca
`recordatorio_cita`.

---

## Superficies de edición (Apply)

**Nuevos (Fase 1):** `supabase/migrations/YYYYMMDDHHMMSS_patient_medical_history_source.sql`,
`supabase/migrations/down/YYYYMMDDHHMMSS_patient_medical_history_source.down.sql`,
`src/lib/flows/registry.ts`, `src/lib/flows/definitions/onboarding.flow.ts`,
`src/lib/flows/onboarding-answers.ts`, `src/lib/flows/onboarding-eligibility.ts`,
`src/lib/flows/onboarding-urgency.ts`, `src/lib/whatsapp/onboarding-flag.ts`,
`src/lib/whatsapp/onboarding-context.ts`; tests nuevos
`src/lib/flows/__tests__/onboarding-answers.test.ts`,
`src/lib/flows/__tests__/onboarding-flow.test.ts`,
`src/lib/flows/__tests__/onboarding-eligibility.test.ts`,
`src/lib/flows/__tests__/onboarding-urgency.test.ts`,
`src/lib/flows/__tests__/registry.test.ts`,
`src/lib/whatsapp/__tests__/onboarding-flag.test.ts`,
`src/lib/whatsapp/__tests__/onboarding-context.test.ts`,
`src/lib/whatsapp/__tests__/orchestrator-onboarding.test.ts`,
`src/lib/whatsapp/__tests__/inbound-service-onboarding.test.ts`.

**Modificados (Fase 1):** `src/lib/admin/types.ts`,
`src/lib/admin/medical-history.ts`,
`src/lib/admin/__tests__/medical-history.test.ts`,
`src/lib/flows/types.ts`, `src/lib/flows/flow-engine.ts`,
`src/lib/flows/__tests__/flow-engine.test.ts`, `src/lib/flows/flow-control.ts`,
`src/lib/flows/__tests__/flow-control.test.ts`,
`src/lib/flows/definitions/book-appointment.flow.ts`,
`src/lib/whatsapp/orchestrator.ts`,
`src/lib/whatsapp/__tests__/orchestrator-flow-session.test.ts`,
`src/lib/whatsapp/inbound-service.ts`,
`src/lib/web-chat/web-inbound-service.ts`, `app/(admin)/patients/[id]/page.tsx`.

**Modificados (Fase 2):** `src/lib/flows/definitions/onboarding.flow.ts`,
`src/lib/flows/types.ts`, `src/lib/flows/onboarding-answers.ts`,
`src/lib/flows/onboarding-eligibility.ts`, `src/lib/whatsapp/orchestrator.ts`,
`src/lib/admin/patients.ts`, `src/lib/admin/__tests__/patients.test.ts`,
`src/lib/flows/__tests__/onboarding-answers.test.ts`,
`src/lib/flows/__tests__/onboarding-flow.test.ts`,
`src/lib/flows/__tests__/onboarding-eligibility.test.ts`,
`src/lib/whatsapp/__tests__/orchestrator-onboarding.test.ts`.

**Nuevos (Fase 3):** `supabase/migrations/YYYYMMDDHHMMSS_onboarding_nudges.sql`,
`supabase/migrations/down/YYYYMMDDHHMMSS_onboarding_nudges.down.sql`,
`src/lib/admin/onboarding-status.ts`,
`src/lib/admin/__tests__/onboarding-status.test.ts`,
`src/lib/citas/send-onboarding-nudge.ts`,
`src/lib/citas/__tests__/send-onboarding-nudge.test.ts`,
`src/components/admin/patient-record/OnboardingStatusBadge.tsx`,
`src/components/admin/patient-record/__tests__/OnboardingStatusBadge.test.tsx`.

**Modificados (Fase 3):** `src/lib/whatsapp/onboarding-flag.ts`,
`app/api/cron/appointment-reminders/route.ts`,
`app/api/cron/appointment-reminders/route.test.ts`,
`src/components/admin/patient-record/PatientRecordTabs.tsx`.

**Cierre:** `openspec/changes/whatsapp-pre-appointment-onboarding/verify-report.md`,
`openspec/specs/<capability>/spec.md` (materialización),
`openspec/changes/archive/YYYY-MM-DD-whatsapp-pre-appointment-onboarding/` y
`archive-report.md`.

---

## Workload forecast

| Fase / PR | Tareas | Archivos únicos (nuevos + modificados) | Líneas estimadas | Riesgo de review | Riesgo técnico |
|---|---|---|---|---|---|
| **Fase 1 · PR 1** — provenance + flujo + disparador + urgencia | 34 (1.1–1.34) | ~25 (14 nuevos + 11 modificados) | ~1400–1800 | **High** (excede el umbral ~400 de `chained-pr`) | **High** — toca el orquestador y la ingesta, y añade escalación real en el path de flow engine |
| **Fase 2 · PR 2** — datos generales | 12 (2.1–2.12) | ~11 (0 nuevos, 11 modificados) | ~500–700 | **High** (apilado; excede 400) | **Medium** — `updatePatientEmail` targeted y mismo flujo, reutiliza lo de Fase 1 |
| **Fase 3 · PR 3** — nudge y panel | 12 (3.1–3.12) | ~12 (8 nuevos + 4 modificados) | ~1100–1400 | **High** (apilado; excede 400) | **High** — envío HSM externo, dedup, fail-closed y dependencia operativa de plantilla Meta |
| **Verify** | 6 (V.1–V.6) | — | — | — | — |
| **Archive** | 4 (A.1–A.4) | — | — | — | — |
| **Total** | **68** | **~40 áreas de archivo únicas** | **~3000–3900** | **High** | **Medium-High** |

- **Áreas afectadas (7):** (1) flow engine puro (`flows/`), (2) orquestador e
  ingesta WhatsApp (`whatsapp/`), (3) capa de datos clínicos (`admin/`), (4)
  datos generales del paciente (`admin/patients.ts`, Fase 2), (5) recordatorios y
  cron (`citas/`, `app/api/cron/`), (6) componentes del expediente
  (`components/admin/patient-record/`), (7) migraciones (`supabase/migrations/`).
- **Estrategia de mitigación:** cada fase es un PR apilado revisable de forma
  independiente; la revisión se enfoca por fase (motor y flujo → datos generales
  → nudge y panel). Los tres PR exceden el umbral de 400 líneas de `chained-pr`;
  esa cadena apilada es la mitigación acordada.
- **Riesgo de runner de migraciones:** no hay runner de migraciones en
  `npm run test`; las migraciones se verifican de forma estructural (tareas 1.3,
  3.1 y V.5) y se aplican/proeban en Supabase local **antes** del merge (D12).
- **Prerrequisito operativo (no bloquea el desarrollo):** la plantilla HSM
  `onboarding_pendiente` debe registrarse y aprobarse en Meta **antes del release
  de la Fase 3** (envío proactivo fuera de la ventana de 24 h). Es un **gate de
  release, no de código**: mientras no esté aprobada, el nudge se persiste como
  `failed` con `error_message` y **nunca** degrada a texto libre.
- **Riesgo de lint:** `openspec/config.yaml` declara `lint: npm run lint`, pero
  `package.json` de esta rama **no** define el script `lint`; si sigue ausente,
  se registra como brecha ambiental en V.3 y **no** se inventa runner.

**Decision needed before apply: No.** Todas las decisiones quedaron cerradas en
`design.md` (D1–D12); los prerrequisitos restantes son operativos (aprobación de
la plantilla HSM en Meta y aplicación de migraciones en el entorno) y no cambian
el contrato de diseño.

---

## 1. Fase 1 — Historia clínica básica (PR 1)

**Objetivo:** agregar la provenance de la historia clínica, entregar el flujo de
onboarding de historia como step machine determinista, el disparador con feature
flag, las acciones nuevas del motor y la pausa por urgencia, sin cambiar el
comportamiento de reserva. Archivos nuevos: migración `source` + down,
`flows/registry.ts`, `flows/definitions/onboarding.flow.ts`,
`flows/onboarding-answers.ts`, `flows/onboarding-eligibility.ts`,
`flows/onboarding-urgency.ts`, `whatsapp/onboarding-flag.ts` y
`whatsapp/onboarding-context.ts`; modificados: `admin/types.ts`,
`admin/medical-history.ts`, `flows/types.ts`, `flows/flow-engine.ts`,
`flows/flow-control.ts`, `flows/definitions/book-appointment.flow.ts`,
`whatsapp/orchestrator.ts`, `whatsapp/inbound-service.ts`,
`web-chat/web-inbound-service.ts` y `app/(admin)/patients/[id]/page.tsx`.

### D1 — Provenance de la historia clínica

- [ ] 1.1 **RED** — Extender `src/lib/admin/__tests__/medical-history.test.ts`
  con la provenance (design.md D1): `mapRow` mapea `source` y aplica
  `'staff'` cuando la fila lo omite; `emptyHistory()` devuelve `source: null`;
  `validateMedicalHistoryInput` resuelve `source` a `'staff'` cuando el input no
  lo envía y acepta `'patient_autoreport'`; un `source` inválido cae en
  `'staff'`; el payload del `upsert` **siempre** incluye `source` (una escritura
  de staff regresa la procedencia a `'staff'`). Usar el `buildQuery()` encadenable
  ya presente en el archivo.
  - Verificación:
    `npm run test -- src/lib/admin/__tests__/medical-history.test.ts`
    → **falla** (casos RED de `source`).
  - **Traza:** CR-R2, ONB-R4.
- [ ] 1.2 **GREEN** — Implementar en `src/lib/admin/types.ts`
  `export type MedicalHistorySource = 'patient_autoreport' | 'staff';`,
  `MedicalHistory.source: MedicalHistorySource | null` y
  `MedicalHistoryInput.source?: MedicalHistorySource | null`; y en
  `src/lib/admin/medical-history.ts` agregar `'source'` a `SELECT_COLUMNS`,
  `source: (row.source as MedicalHistorySource) ?? 'staff'` en `mapRow`,
  `source: null` en `emptyHistory`,
  `parseStatus(input.source, ['patient_autoreport', 'staff'] as const, 'source') ?? 'staff'`
  en `validateMedicalHistoryInput` y `source` en el payload del `upsert`.
  - Verificación:
    `npm run test -- src/lib/admin/__tests__/medical-history.test.ts`
    → **pasa** los casos de 1.1.
  - **Traza:** CR-R1, CR-R2, ONB-R4.
- [ ] 1.3 **Migración `patient_medical_history_source` + down** — Crear
  `supabase/migrations/YYYYMMDDHHMMSS_patient_medical_history_source.sql`
  (design.md D1, D12): `ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT
  'staff'`; `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT
  patient_medical_history_source_check CHECK (source IN
  ('patient_autoreport', 'staff'))`. Timestamp UTC **fijo al crear el archivo**
  (no se renombra después de aplicarse). Crear el down
  `supabase/migrations/down/YYYYMMDDHHMMSS_patient_medical_history_source.down.sql`
  con `DROP CONSTRAINT IF EXISTS` y `DROP COLUMN IF EXISTS source`.
  - Verificación: relectura del up (idempotente y re-ejecutable) y del down
    (invierte el orden: constraint → columna, con `IF EXISTS`).
  - **Traza:** CR-R1, CR-R2, ONB-R4.
- [ ] 1.4 **GREEN** — Actualizar la constante `EMPTY_HISTORY` de
  `app/(admin)/patients/[id]/page.tsx` con `source: null` (mismo cambio de tipo
  que 1.2); sin fetch nuevo ni cambio de UI.
  - Verificación: `npx tsc --noEmit` → **sin errores** de tipo en la página.
  - **Traza:** CR-R2.

### D2 — Flujo de onboarding: módulo puro y definición

- [ ] 1.5 **RED** — Escribir
  `src/lib/flows/__tests__/onboarding-answers.test.ts` (design.md D2, mapa D11):
  `parseYesNo` (`sí|si|yes|claro|correcto` → `yes`; `no|nunca|ninguna|ninguno` →
  `no`; otra cosa → `null`); `parseSmoking`
  (`nunca|no|jamás` → `never`; `antes|exfumador|antes fumaba|dejé` → `former`;
  `sí|actualmente|actualmente fumo|fumo` → `current`; desconocido → `null`);
  `parseAlcohol` (`nunca|no` → `never`;
  `ocasional|ocasionalmente|a veces|socialmente` → `occasional`;
  `frecuente|frecuentemente|seguido|mucho` → `frequent`; desconocido → `null`);
  el detalle de alergias/medicamentos/condiciones se guarda **literal**
  (`[rawNormalizado]`, sin normalización clínica); `evaluateOnboardingStep`
  ramifica `yes`/`no` y devuelve `retry` ante respuesta no reconocida;
  **gating de embarazo** (sexo `female` → `next_pregnancy`; otro → 
  `next_no_pregnancy` con `pregnancyStatus = 'not_applicable'`);
  `buildOnboardingSummary(draft)` produce una línea por dato **fiel a lo
  capturado**. Sin mocks.
  - Verificación:
    `npm run test -- src/lib/flows/__tests__/onboarding-answers.test.ts`
    → **falla** (módulo inexistente; casos RED).
  - **Traza:** ONB-R2, ONB-R3.
- [ ] 1.6 **GREEN** — Implementar `src/lib/flows/onboarding-answers.ts` (puro)
  con `OnboardingDraft`, `OnboardingStepResult`, `parseYesNo`, `parseSmoking`,
  `parseAlcohol`, `evaluateOnboardingStep`, `buildOnboardingSummary` y
  `rawNormalizado` (trim + colapso de espacios, máx. 500 caracteres). Sin I/O ni
  LLM.
  - Verificación:
    `npm run test -- src/lib/flows/__tests__/onboarding-answers.test.ts`
    → **pasa** los casos de 1.5.
  - **Traza:** ONB-R2, ONB-R3.
- [ ] 1.7 **GREEN** — Agregar a los unions cerrados de `src/lib/flows/types.ts`
  (`FlowStateDefinition.action` y `FlowResult.action`) el valor
  `'evaluateOnboardingAnswer'` y `'saveOnboardingHistory'` (design.md D4;
  prerequisito de la definición de 1.9). No se agrega `'saveOnboardingContact'`
  hasta Fase 2.
  - Verificación: `npx tsc --noEmit` → **sin errores** de unión en `flows/`.
  - **Traza:** FE-R1, ONB-R4.
- [ ] 1.8 **RED** — Escribir `src/lib/flows/__tests__/onboarding-flow.test.ts`
  (design.md D2, mapa D11): la definición declara el flujo `'onboarding'` con
  los estados y transiciones de la tabla D2; cada paso interactivo tiene
  `required: 'onboardingAnswer'` **y** `action: 'evaluateOnboardingAnswer'`;
  `save_history` declara `action: 'saveOnboardingHistory'` y **sin** `required`;
  `complete` es terminal; `no` en `ask_allergies` transiciona a `ask_medications`
  (omite el detalle); las transiciones `retry`/`restart` existen.
  - Verificación:
    `npm run test -- src/lib/flows/__tests__/onboarding-flow.test.ts`
    → **falla** (definición inexistente; casos RED).
  - **Traza:** ONB-R2, FE-R1, FE-R2.
- [ ] 1.9 **GREEN** — Implementar
  `src/lib/flows/definitions/onboarding.flow.ts` (puro) con la máquina de
  estados 1:1 de la tabla D2 (prompts es-MX, orden fijo y gating de embarazo por
  `metadata.onboarding.context.sex`). Exportar solo `onboardingFlow` (el registry
  va en 1.15).
  - Verificación:
    `npm run test -- src/lib/flows/__tests__/onboarding-flow.test.ts`
    → **pasa** los casos de 1.8.
  - **Traza:** ONB-R2, FE-R1.
- [ ] 1.10 **RED** — Extender `src/lib/flows/__tests__/flow-engine.test.ts`
  (design.md D2): `FlowEngine.advance` respeta `required` igual que `execute` —
  si el estado destino exige `required` y falta la entidad, devuelve
  `{ action: 'ask', missingEntity }`; `select_slot`/`collect_notes` (required sin
  acción) siguen preguntando; `check_availability`/`confirm_booking` (acción sin
  required) siguen ejecutando la acción; el comportamiento de booking no cambia.
  - Verificación: `npm run test -- src/lib/flows/__tests__/flow-engine.test.ts`
    → **falla** (casos RED de simetría en `advance`).
  - **Traza:** FE-R1.
- [ ] 1.11 **GREEN** — Corregir `src/lib/flows/flow-engine.ts`: replicar en
  `advance` el bloque de validación de `required` de `execute`. No cambia el
  comportamiento de booking (verificado en 1.10).
  - Verificación: `npm run test -- src/lib/flows/__tests__/flow-engine.test.ts`
    → **pasa** los casos de 1.10.
  - **Traza:** FE-R1.
- [ ] 1.12 **RED** — Extender
  `src/lib/whatsapp/__tests__/orchestrator-flow-session.test.ts`: 
  `generateFlowResponse` sustituye `{patientFirstName}` (desde
  `metadata.onboarding.context.patientName`), `{onboardingSummary}` y
  `{onboardingContactSummary}`; los placeholders de booking siguen resolviéndose
  igual.
  - Verificación:
    `npm run test -- src/lib/whatsapp/__tests__/orchestrator-flow-session.test.ts`
    → **falla** (placeholders de onboarding no resueltos).
  - **Traza:** ONB-R3.
- [ ] 1.13 **GREEN** — Agregar a `generateFlowResponse` de
  `src/lib/whatsapp/orchestrator.ts` los placeholders `{patientFirstName}`,
  `{onboardingSummary}` y `{onboardingContactSummary}`, sin alterar los de
  booking.
  - Verificación:
    `npm run test -- src/lib/whatsapp/__tests__/orchestrator-flow-session.test.ts`
    → **pasa** los casos de 1.12.
  - **Traza:** ONB-R3.

### D3 — Registry de flujos

- [ ] 1.14 **RED** — Escribir `src/lib/flows/__tests__/registry.test.ts`
  (design.md D3, mapa D11): `getFlowDefinition('book_appointment')` y
  `getFlowDefinition('onboarding')` devuelven las definiciones registradas; un
  nombre desconocido lanza un error cuyo mensaje **incluye el nombre**.
  - Verificación: `npm run test -- src/lib/flows/__tests__/registry.test.ts`
    → **falla** (módulo `flows/registry` inexistente; casos RED).
  - **Traza:** FE-R2.
- [ ] 1.15 **GREEN** — Crear `src/lib/flows/registry.ts` con `flowRegistry`
  (`book_appointment`, `onboarding`) y `getFlowDefinition`; eliminar
  `flowRegistry`/`getFlowDefinition` de
  `definitions/book-appointment.flow.ts` (conserva solo `bookAppointmentFlow`) y
  actualizar los dos importadores: `src/lib/whatsapp/orchestrator.ts` y
  `src/lib/web-chat/web-inbound-service.ts`. Sin re-export de compatibilidad.
  - Verificación: `npm run test -- src/lib/flows/__tests__/registry.test.ts`
    → **pasa**; `npx tsc --noEmit` sin errores de import.
  - **Traza:** FE-R2.

### D5 — Disparador determinista y feature flag

- [ ] 1.16 **RED** — Escribir
  `src/lib/whatsapp/__tests__/onboarding-flag.test.ts` (design.md D5):
  `isOnboardingEnabled` encendido con `true|1|yes` (case-insensitive) y apagado
  con ausente o cualquier otro valor (**default off**); `isOnboardingNudgeEnabled`
  con la misma semántica sobre `WHATSAPP_ONBOARDING_NUDGE_ENABLED`.
  - Verificación:
    `npm run test -- src/lib/whatsapp/__tests__/onboarding-flag.test.ts`
    → **falla** (módulo inexistente; casos RED).
  - **Traza:** ONB-R7.
- [ ] 1.17 **GREEN** — Implementar `src/lib/whatsapp/onboarding-flag.ts`
  (patrón `src/lib/citas/reminder-reply-flag.ts`) con `isOnboardingEnabled` y
  `isOnboardingNudgeEnabled`.
  - Verificación:
    `npm run test -- src/lib/whatsapp/__tests__/onboarding-flag.test.ts`
    → **pasa** los casos de 1.16.
  - **Traza:** ONB-R7.
- [ ] 1.18 **RED** — Escribir
  `src/lib/flows/__tests__/onboarding-eligibility.test.ts` (design.md D5, mapa
  D11): `shouldStartOnboarding` con `enabled` + `hasFutureScheduledAppointment` +
  (`!historyExists` **o** `missingEmail`); no arranca con flag apagado, sin
  historia **y** sin cita futura, ni con historia y email presente;
  `resolveOnboardingStartState` devuelve `'ask_allergies'` cuando
  `!historyExists` y `null` en el resto (Fase 2 extiende a `'ask_email'`).
  - Verificación:
    `npm run test -- src/lib/flows/__tests__/onboarding-eligibility.test.ts`
    → **falla** (módulo inexistente; casos RED).
  - **Traza:** ONB-R1, ONB-R7.
- [ ] 1.19 **GREEN** — Implementar `src/lib/flows/onboarding-eligibility.ts`
  (puro) con `OnboardingEligibilityInput`, `shouldStartOnboarding` y
  `resolveOnboardingStartState` (solo `'ask_allergies' | null` en esta fase).
  - Verificación:
    `npm run test -- src/lib/flows/__tests__/onboarding-eligibility.test.ts`
    → **pasa** los casos de 1.18.
  - **Traza:** ONB-R1.
- [ ] 1.20 **RED** — Escribir
  `src/lib/whatsapp/__tests__/onboarding-context.test.ts` (design.md D5, mapa
  D11) con `@/lib/supabase/server` mockeado: `loadOnboardingStartContext` lee
  `patients` por `phone_e164` de forma **read-only** (`.maybeSingle()`) y
  devuelve `null` sin crear paciente cuando no existe; `historyExists` desde
  `patient_medical_history`; `missingEmail = email === null`;
  `hasFutureScheduledAppointment` cuenta `confirmed`/`pending` y **no**
  `requested`/`rescheduled`/`attended`.
  - Verificación:
    `npm run test -- src/lib/whatsapp/__tests__/onboarding-context.test.ts`
    → **falla** (módulo inexistente; casos RED).
  - **Traza:** ONB-R1.
- [ ] 1.21 **GREEN** — Implementar `src/lib/whatsapp/onboarding-context.ts`
  (I/O con `getSupabaseAdmin()`, `now: Date` inyectado) con
  `OnboardingStartContext`, `loadOnboardingStartContext` y
  `hasFutureScheduledAppointment` según D5.
  - Verificación:
    `npm run test -- src/lib/whatsapp/__tests__/onboarding-context.test.ts`
    → **pasa** los casos de 1.20.
  - **Traza:** ONB-R1.
- [ ] 1.22 **RED** — Escribir
  `src/lib/whatsapp/__tests__/orchestrator-onboarding.test.ts` (design.md D5,
  mapa D11) con los módulos de datos mockeados: con flag apagado ⇒
  `maybeStartOnboarding` retorna `null` y el routing actual se conserva; con flag
  encendido y paciente elegible ⇒ arranca y envía el primer prompt
  (`ask_allergies`) y persiste `flow_state`; con intent
  `book_appointment`/`check_availability`/`cancel_request`/`reschedule_request`/
  `support`/`handoff` ⇒ **no** arranca (`ONBOARDING_TRIGGER_INTENTS =
  {'inquiry','unknown'}`).
  - Verificación:
    `npm run test -- src/lib/whatsapp/__tests__/orchestrator-onboarding.test.ts`
    → **falla** (comportamiento inexistente; casos RED).
  - **Traza:** ONB-R1, ONB-R7, WIA-R1.
- [ ] 1.23 **GREEN** — Implementar `maybeStartOnboarding` en
  `src/lib/whatsapp/orchestrator.ts`, invocado desde `handleNewMessage` tras
  clasificar y **antes** de enrutar, con la guarda de flag como primera línea y
  `ONBOARDING_TRIGGER_INTENTS`.
  - Verificación:
    `npm run test -- src/lib/whatsapp/__tests__/orchestrator-onboarding.test.ts`
    → **pasa** los casos de 1.22.
  - **Traza:** ONB-R1, ONB-R7, WIA-R1.

### D6 — Control de tema sensible al flujo

- [ ] 1.24 **RED** — Extender `src/lib/flows/__tests__/flow-control.test.ts`
  (design.md D6, mapa D11): `detectTopicChange`/`analyzeFlowControl` aceptan
  `flowName` opcional (`'book_appointment'` por default, retrocompatible); con
  `flowName: 'onboarding'` un `inquiry` **no** es cambio de tema (continúa) y
  `book_appointment`/`check_availability`/`reschedule_request`/`cancel_request`/
  `handoff` sí lo son; `generateTopicChangeConfirmation` incluye
  `'onboarding': 'tu registro de datos médicos'`; booking sin cambios.
  - Verificación: `npm run test -- src/lib/flows/__tests__/flow-control.test.ts`
    → **falla** (casos RED de `flowName`).
  - **Traza:** FE-R3.
- [ ] 1.25 **GREEN** — Extender `src/lib/flows/flow-control.ts` con
  `FLOW_TOPIC_CHANGE_INTENTS` (`book_appointment`, `onboarding`), el parámetro
  `flowName` y la entrada en `flowNames`; `orchestrate` pasa
  `activeFlow.flowName` a `analyzeFlowControl`. La cancelación explícita sigue
  evaluándose antes del cambio de tema.
  - Verificación: `npm run test -- src/lib/flows/__tests__/flow-control.test.ts`
    → **pasa** los casos de 1.24.
  - **Traza:** FE-R3.

### D4 — Continuación, escritura atómica y manejo de error

- [ ] 1.26 **RED** — Extender
  `src/lib/whatsapp/__tests__/orchestrator-onboarding.test.ts` (design.md D2/D4,
  mapa D11): la continuación ramifica sí/no, omite el detalle ante `no`, aplica
  el gating de embarazo, muestra el resumen, `retry` re-pregunta el mismo paso y
  `restart` reinicia el draft y vuelve a `ask_allergies`; la respuesta no
  reconocida **no** avanza; el abandono dentro del timeout **no** ejecuta acción;
  el timeout (`FLOW_TIMEOUT_MINUTES = 30`) limpia el estado sin escribir.
  - Verificación:
    `npm run test -- src/lib/whatsapp/__tests__/orchestrator-onboarding.test.ts`
    → **falla** (casos RED de continuación).
  - **Traza:** ONB-R2, ONB-R3, ONB-R8.
- [ ] 1.27 **GREEN** — Implementar el caso
  `'evaluateOnboardingAnswer'` en `executeFlowAction`
  (`src/lib/whatsapp/orchestrator.ts`): lee el draft de
  `result.nextState.metadata`, normaliza `entities.onboardingAnswer`, delega en
  `evaluateOnboardingStep` y devuelve `transition`, `metadata.onboarding` y
  `entities.onboardingAnswer: undefined` en `retry`.
  - Verificación:
    `npm run test -- src/lib/whatsapp/__tests__/orchestrator-onboarding.test.ts`
    → **pasa** los casos de 1.26.
  - **Traza:** ONB-R2, ONB-R3, FE-R1.
- [ ] 1.28 **RED** — Extender
  `src/lib/whatsapp/__tests__/orchestrator-onboarding.test.ts` (design.md D4/D7,
  mapa D11): al confirmar el resumen se llama
  `upsertMedicalHistory` **una sola vez** con `source: 'patient_autoreport'` y
  nunca antes de la confirmación; si `draft.context.phone !== event.fromPhone`
  ⇒ **no** escribe y escala; si la escritura falla ⇒
  `{ success: false, error, escalate: true }` y `continueFlow` retorna
  `{ needsHuman: true, clearFlowState: true, responseText: error }` **sin**
  reintentar ni re-preguntar.
  - Verificación:
    `npm run test -- src/lib/whatsapp/__tests__/orchestrator-onboarding.test.ts`
    → **falla** (casos RED de escritura y error).
  - **Traza:** ONB-R4, ONB-R6, FE-R1.
- [ ] 1.29 **GREEN** — Implementar el caso `'saveOnboardingHistory'` en
  `executeFlowAction` (verificación de identidad por `event.fromPhone` + único
  `upsertMedicalHistory` con `source: 'patient_autoreport'` y transición
  `needs_contact`/`complete`) y extender el loop de `continueFlow`
  (`orchestrator.ts`) para que `escalate` retorne
  `{ needsHuman: true, clearFlowState: true, responseText: error }`, conservando
  el comportamiento actual de booking cuando `escalate` está ausente.
  - Verificación:
    `npm run test -- src/lib/whatsapp/__tests__/orchestrator-onboarding.test.ts`
    → **pasa** los casos de 1.28.
  - **Traza:** ONB-R4, ONB-R6, FE-R1.

### D7 — Pausa por urgencia y escalación real

- [ ] 1.30 **RED** — Escribir `src/lib/flows/__tests__/onboarding-urgency.test.ts`
  (design.md D7, mapa D11): `detectOnboardingUrgency` marca dolor
  fuerte/intenso/insoportable/severo, urgencia/emergencia, infección/inflamación,
  sangrado abundante, fiebre, alergia a anestesia y no puedo respirar/desmayo;
  **no** marca respuestas legítimas como «soy alérgico a la penicilina» o «tomo
  medicamento para la presión». Sin mocks.
  - Verificación:
    `npm run test -- src/lib/flows/__tests__/onboarding-urgency.test.ts`
    → **falla** (módulo inexistente; casos RED).
  - **Traza:** ONB-R5.
- [ ] 1.31 **GREEN** — Implementar `src/lib/flows/onboarding-urgency.ts` (puro)
  con `detectOnboardingUrgency` y la lista acotada de patrones de D7.
  - Verificación:
    `npm run test -- src/lib/flows/__tests__/onboarding-urgency.test.ts`
    → **pasa** los casos de 1.30.
  - **Traza:** ONB-R5.
- [ ] 1.32 **RED** — Escribir
  `src/lib/whatsapp/__tests__/inbound-service-onboarding.test.ts` (design.md D7,
  mapa D11) con `processWhatsAppInboundEvent(event, options)` y ports inyectados
  (`store`, `sendText`, `createEscalation`): una respuesta urgente durante
  onboarding ⇒ status `escalated`, `flow_state` limpiado a `null`,
  `createEscalation` llamado con el teléfono del canal y **sin** escritura de
  historia; los mensajes posteriores **no** continúan el onboarding ni escriben
  (D11 "No history written after escalation").
  - Verificación:
    `npm run test -- src/lib/whatsapp/__tests__/inbound-service-onboarding.test.ts`
    → **falla** (comportamiento inexistente; casos RED).
  - **Traza:** ONB-R5, WIA-R1, WIA-R2.
- [ ] 1.33 **GREEN** — Agregar `clearFlowState?: boolean` a
  `OrchestratorResult`, implementar en `orchestrate` la rama de urgencia cuando
  el flujo activo es `'onboarding'` (decision `needs_human`, `clearFlowState`,
  `responseText` al paciente) y manejar en `processWithFlowEngine`
  (`inbound-service.ts`) la escalación de onboarding: limpiar el `flow_state`
  (`store.updateConversationFlowState({ flowState: null })`), crear la fila vía
  el port inyectable `createEscalation?: typeof createEveWhatsAppEscalation`
  (default la función real), enviar la respuesta, marcar el mensaje como
  `escalated` y retornar `action: 'needs_human'`. El teléfono usado es
  `event.fromPhone`.
  - Verificación:
    `npm run test -- src/lib/whatsapp/__tests__/inbound-service-onboarding.test.ts`
    → **pasa** los casos de 1.32.
  - **Traza:** ONB-R5, WIA-R1, WIA-R2.

### Cierre de Fase 1

- [ ] 1.34 **TRIANGULATE/REFACTOR** — Cubrir negativos que protegen el contrato:
  el flag apagado mantiene el routing idéntico al actual; el teléfono distinto
  del contexto nunca escribe; «soy alérgico a la penicilina»/«tomo medicamento»
  **no** escalan; el abandono/timeout no escribe; el flujo de reserva no cambia
  (acciones, control de tema y registry intactos); una respuesta no reconocida
  re-pregunta sin avanzar. Limpiar nombres y constantes manteniendo la suite de
  Fase 1 en verde.
  - Verificación:
    `npm run test -- src/lib/flows/__tests__/onboarding-answers.test.ts src/lib/flows/__tests__/onboarding-flow.test.ts src/lib/flows/__tests__/onboarding-eligibility.test.ts src/lib/flows/__tests__/onboarding-urgency.test.ts src/lib/flows/__tests__/registry.test.ts src/lib/flows/__tests__/flow-engine.test.ts src/lib/flows/__tests__/flow-control.test.ts src/lib/whatsapp/__tests__/onboarding-flag.test.ts src/lib/whatsapp/__tests__/onboarding-context.test.ts src/lib/whatsapp/__tests__/orchestrator-onboarding.test.ts src/lib/whatsapp/__tests__/orchestrator-flow-session.test.ts src/lib/whatsapp/__tests__/inbound-service-onboarding.test.ts src/lib/admin/__tests__/medical-history.test.ts`
    → **pasa**.
  - **Traza:** ONB-R1..R8, FE-R1..R3, WIA-R1, WIA-R2, CR-R1, CR-R2.

**Commits (work units, Fase 1):** PR de 4–6 commits revisables — (a) migración
`source` + down, (b) provenance en `admin/` y `page.tsx` (1.1–1.4), (c) módulos
puros `flows/` + `registry` + control de tema (1.5–1.15, 1.24–1.25), (d)
disparador + flag (1.16–1.23), (e) acciones, escritura y urgencia (1.26–1.34).
Cada commit lleva sus tests; Conventional Commits en español acotado
(`feat(onboarding): …`, `test(onboarding): …`). Los `docs` tocados van en el
mismo commit que el código que documentan.

**Cobertura de spec (Fase 1):** ONB-R1..R8, FE-R1..R3, WIA-R1, WIA-R2, CR-R1,
CR-R2.

---

## 2. Fase 2 — Datos generales (PR 2)

**Objetivo:** completar los datos generales (email) dentro del mismo flujo,
escribiendo **solo** en `patients` y sin tocar la historia clínica. Archivos
modificados: `flows/definitions/onboarding.flow.ts`, `flows/types.ts`,
`flows/onboarding-answers.ts`, `flows/onboarding-eligibility.ts`,
`whatsapp/orchestrator.ts`, `admin/patients.ts` y sus tests. El estado
`'ask_email'` y la acción `'saveOnboardingContact'` se declaran aquí.

- [ ] 2.1 **RED** — Extender `src/lib/flows/__tests__/onboarding-answers.test.ts`
  (design.md D8): `evaluateOnboardingStep('ask_email', …)` usa
  `parseOptionalEmail` (`trim`, `toLowerCase`, `EMAIL_RE`); un email válido se
  guarda normalizado en `metadata.onboarding.email` y transiciona `next`; un
  email inválido transiciona `retry` y **no** guarda; `show_contact_summary`
  confirma → `confirm`, corrección → `restart`.
  - Verificación:
    `npm run test -- src/lib/flows/__tests__/onboarding-answers.test.ts`
    → **falla** (casos RED de email).
  - **Traza:** ST-R4.
- [ ] 2.2 **GREEN** — Extender `src/lib/flows/onboarding-answers.ts` con el
  manejo determinista del email (reutiliza `parseOptionalEmail` de
  `src/lib/booking/patient-contact.ts`); sin LLM.
  - Verificación:
    `npm run test -- src/lib/flows/__tests__/onboarding-answers.test.ts`
    → **pasa** los casos de 2.1.
  - **Traza:** ST-R4.
- [ ] 2.3 **GREEN** — Agregar `'saveOnboardingContact'` a los unions de
  `src/lib/flows/types.ts` (`FlowStateDefinition.action` y `FlowResult.action`);
  es la única acción nueva de esta fase (design.md D4, D8).
  - Verificación: `npx tsc --noEmit` → **sin errores** de unión.
  - **Traza:** ST-R4, FE-R1.
- [ ] 2.4 **RED** — Extender
  `src/lib/flows/__tests__/onboarding-flow.test.ts`: la definición incluye
  `ask_email` (`required` + `evaluateOnboardingAnswer`),
  `show_contact_summary` (`required` + acción) y `save_contact`
  (`action: 'saveOnboardingContact'`, sin `required`); transiciones
  `next → show_contact_summary`, `retry → ask_email`, `confirm → save_contact`,
  `restart → ask_email` y `save_contact complete → complete`; en el flujo de
  historia, `show_summary confirm → save_history` y
  `save_history needs_contact → ask_email`.
  - Verificación:
    `npm run test -- src/lib/flows/__tests__/onboarding-flow.test.ts`
    → **falla** (estados de Fase 2 ausentes; casos RED).
  - **Traza:** ST-R4, FE-R1.
- [ ] 2.5 **GREEN** — Agregar a
  `src/lib/flows/definitions/onboarding.flow.ts` los estados `ask_email`,
  `show_contact_summary` y `save_contact` con sus prompts es-MX y transiciones
  (tabla D2).
  - Verificación:
    `npm run test -- src/lib/flows/__tests__/onboarding-flow.test.ts`
    → **pasa** los casos de 2.4.
  - **Traza:** ST-R4.
- [ ] 2.6 **RED** — Extender `src/lib/admin/__tests__/patients.test.ts`
  (design.md D8, mapa D11): `updatePatientEmail(patientId, email)` hace
  `update({ email })` por `id` con `.select(SELECT_COLUMNS).single()` y **solo**
  toca `email`; `id` inválido lanza `ValidationError`; email inválido lanza
  `ValidationError('email', …)`; `error.code === '23505'` ⇒
  `ConflictError('Contact already registered', 'contact_conflict')`.
  - Verificación: `npm run test -- src/lib/admin/__tests__/patients.test.ts`
    → **falla** (`updatePatientEmail` no exportado; casos RED).
  - **Traza:** ST-R4.
- [ ] 2.7 **GREEN** — Implementar `updatePatientEmail` en
  `src/lib/admin/patients.ts` (targeted; jamás toca la historia clínica, a
  diferencia de `updatePatient` full-replace).
  - Verificación: `npm run test -- src/lib/admin/__tests__/patients.test.ts`
    → **pasa** los casos de 2.6.
  - **Traza:** ST-R4.
- [ ] 2.8 **RED** — Extender
  `src/lib/flows/__tests__/onboarding-eligibility.test.ts` y
  `src/lib/whatsapp/__tests__/orchestrator-onboarding.test.ts` (design.md D5,
  D8): `resolveOnboardingStartState` devuelve `'ask_email'` cuando
  `historyExists && missingEmail`; el arranque solo-contacto nunca ejecuta
  `saveOnboardingHistory` ni toca la historia clínica; `!historyExists` sigue
  arrancando en `'ask_allergies'`.
  - Verificación:
    `npm run test -- src/lib/flows/__tests__/onboarding-eligibility.test.ts src/lib/whatsapp/__tests__/orchestrator-onboarding.test.ts`
    → **falla** (casos RED de inicio solo-contacto).
  - **Traza:** ST-R4, ONB-R1.
- [ ] 2.9 **GREEN** — Extender `resolveOnboardingStartState` con `'ask_email'`
  y wirear el estado inicial en `maybeStartOnboarding`
  (`src/lib/whatsapp/orchestrator.ts`), tomando `missingEmail` de
  `loadOnboardingStartContext`.
  - Verificación:
    `npm run test -- src/lib/flows/__tests__/onboarding-eligibility.test.ts src/lib/whatsapp/__tests__/orchestrator-onboarding.test.ts`
    → **pasa** los casos de 2.8.
  - **Traza:** ST-R4, ONB-R1.
- [ ] 2.10 **RED** — Extender
  `src/lib/whatsapp/__tests__/orchestrator-onboarding.test.ts` (design.md D4,
  D8): con `missingEmail === true`, `save_history` transiciona a `ask_email`;
  `show_contact_summary` requiere confirmación explícita; solo el `confirm`
  llega a `save_contact`; `saveOnboardingContact` llama `updatePatientEmail` con
  el email normalizado y **no** llama `upsertMedicalHistory`; el flujo completo
  de historia + contacto escribe historia una vez y email una vez.
  - Verificación:
    `npm run test -- src/lib/whatsapp/__tests__/orchestrator-onboarding.test.ts`
    → **falla** (casos RED de datos generales).
  - **Traza:** ST-R4, ONB-R3.
- [ ] 2.11 **GREEN** — En `src/lib/whatsapp/orchestrator.ts` actualizar las
  transiciones de `show_summary`/`save_history` a `ask_email` cuando falta email
  e implementar el caso `'saveOnboardingContact'` que llama `updatePatientEmail`
  y transiciona a `complete`.
  - Verificación:
    `npm run test -- src/lib/whatsapp/__tests__/orchestrator-onboarding.test.ts`
    → **pasa** los casos de 2.10.
  - **Traza:** ST-R4, ONB-R3.
- [ ] 2.12 **TRIANGULATE/REFACTOR** — Cubrir negativos que protegen el contrato:
  un email inválido nunca llega a `updatePatientEmail`; `23505` escala sin
  escribir; el inicio solo-contacto jamás re-ejecuta `saveOnboardingHistory` ni
  pisa historia de staff; la cancelación/timeout del paso de email no escribe.
  Limpiar sin cambiar el contrato.
  - Verificación:
    `npm run test -- src/lib/flows/__tests__/onboarding-answers.test.ts src/lib/flows/__tests__/onboarding-flow.test.ts src/lib/flows/__tests__/onboarding-eligibility.test.ts src/lib/admin/__tests__/patients.test.ts src/lib/whatsapp/__tests__/orchestrator-onboarding.test.ts`
    → **pasa**.
  - **Traza:** ST-R4, ONB-R1, ONB-R3.

**Commits (work units, Fase 2):** PR de 3–4 commits — (a) parser y definición de
email (2.1–2.5), (b) `updatePatientEmail` + test (2.6–2.7), (c) orquestador e
inicio solo-contacto (2.8–2.12). Tests y docs en el mismo commit que el código.
Conventional Commits (`feat(onboarding): …`, `feat(admin): …`,
`test(onboarding): …`).

**Cobertura de spec (Fase 2):** ST-R4, ONB-R1, ONB-R3.

---

## 3. Fase 3 — Nudge y panel (PR 3)

**Objetivo:** enviar el nudge de onboarding pendiente como mensaje/plantilla
**separado** aguas abajo del recordatorio, y mostrar el badge de estado en el
expediente como superficie aditiva. Archivos nuevos: migración
`onboarding_nudges` + down, `admin/onboarding-status.ts`,
`citas/send-onboarding-nudge.ts` y
`components/admin/patient-record/OnboardingStatusBadge.tsx` (+ tests);
modificados: `whatsapp/onboarding-flag.ts`,
`app/api/cron/appointment-reminders/route.ts` (+ test) y
`PatientRecordTabs.tsx`.

### D10 — Derivación del estado (base del nudge y del badge)

- [ ] 3.1 **RED** — Escribir
  `src/lib/admin/__tests__/onboarding-status.test.ts` (design.md D10, mapa D11):
  `deriveOnboardingStatus({ historyExists: false, source: null })` ⇒
  `'pendiente'`; `{ historyExists: true, source: 'patient_autoreport' }` ⇒
  `'completo'`; `{ historyExists: true, source: 'staff' }` ⇒ `'completo'`
  (historia validada por el consultorio, **no** se nudgea); `source` no cambia el
  resultado binario. Sin mocks.
  - Verificación:
    `npm run test -- src/lib/admin/__tests__/onboarding-status.test.ts`
    → **falla** (módulo inexistente; casos RED).
  - **Traza:** ST-R1.
- [ ] 3.2 **GREEN** — Implementar `src/lib/admin/onboarding-status.ts` (puro)
  con `OnboardingStatus` y `deriveOnboardingStatus` según D10.
  - Verificación:
    `npm run test -- src/lib/admin/__tests__/onboarding-status.test.ts`
    → **pasa** los casos de 3.1.
  - **Traza:** ST-R1.

### D9 — Migración y envío del nudge

- [ ] 3.3 **Migración `onboarding_nudges` + down** — Crear
  `supabase/migrations/YYYYMMDDHHMMSS_onboarding_nudges.sql` (design.md D9,
  D12): enum idempotente `onboarding_nudge_status ('scheduled','sent','failed')`
  en bloque `DO $$` con guarda `pg_type`; tabla `onboarding_nudges` con `id`,
  `patient_id` (FK), `appointment_id` (FK `ON DELETE CASCADE`),
  `reminder_key text NOT NULL UNIQUE`, `status … DEFAULT 'scheduled'`,
  `template_name text NOT NULL DEFAULT 'onboarding_pendiente'`,
  `dry_run boolean NOT NULL DEFAULT true`, `provider_message_id`, `sent_at
  timestamptz`, `error`, `created_at`/`updated_at timestamptz`; trigger
  `set_updated_at`; y **RLS patrón 0018** (`ENABLE` + `FORCE ROW LEVEL
  SECURITY`, `REVOKE ALL` de `anon`/`authenticated`, `GRANT` a
  `authenticated`, policy `onboarding_nudges_admin_all`). Crear el down
  `supabase/migrations/down/YYYYMMDDHHMMSS_onboarding_nudges.down.sql` en orden
  índices → tabla → enum.
  - Verificación: relectura del up (idempotente, `UNIQUE (reminder_key)`) y del
    down (orden inverso con `IF EXISTS`).
  - **Traza:** ST-R2.
- [ ] 3.4 **RED** — Escribir
  `src/lib/citas/__tests__/send-onboarding-nudge.test.ts` (design.md D9, mapa
  D11) con Supabase/cliente mockeados: onboarding `pendiente` ⇒ envía
  **únicamente** por `sendWhatsAppTemplateMessage` con
  `ONBOARDING_NUDGE_TEMPLATE_NAME = 'onboarding_pendiente'`; `completo` ⇒
  `{ sent: false, skipped: true }`; `opt_in_status === 'opted_out'` ⇒ `skipped`;
  `reminder_key = onboarding:${patientId}:${isoWeekKey}` ya existente
  (`23505`) ⇒ duplicado idempotente `skipped`; flag
  `WHATSAPP_ONBOARDING_NUDGE_ENABLED` apagado ⇒ `skipped`; `dryRun` fail-closed;
  fallo del transporte ⇒ `failed` con `error` persistido y **jamás** texto libre
  (`sendWhatsAppTextMessage` no se llama nunca).
  - Verificación:
    `npm run test -- src/lib/citas/__tests__/send-onboarding-nudge.test.ts`
    → **falla** (módulo inexistente; casos RED).
  - **Traza:** ST-R2.
- [ ] 3.5 **GREEN** — Implementar `src/lib/citas/send-onboarding-nudge.ts`
  (server-only, espejo de `sendAppointmentReminder`) con
  `ONBOARDING_NUDGE_TEMPLATE_NAME`, `SendOnboardingNudgeInput/Result`,
  `sendOnboardingNudge`, la query mínima de opt-out a `whatsapp_contacts`, la
  dedup por `reminder_key`, el transporte **solo plantilla** y el manejo
  `failed`; agregar `isOnboardingNudgeEnabled` si no quedó en 1.17. No se
  modifica `send-appointment-reminder.ts`.
  - Verificación:
    `npm run test -- src/lib/citas/__tests__/send-onboarding-nudge.test.ts`
    → **pasa** los casos de 3.4.
  - **Traza:** ST-R2.
- [ ] 3.6 **RED** — Extender
  `app/api/cron/appointment-reminders/route.test.ts` (design.md D9, mapa D11):
  el nudge se llama **solo** después de que `sendAppointmentReminder` devuelve
  `sent === true`; no se llama cuando el recordatorio no se envió; con el flag
  `WHATSAPP_ONBOARDING_NUDGE_ENABLED` apagado el nudge queda `skipped`; el
  contrato y las llamadas de `recordatorio_cita` no cambian.
  - Verificación:
    `npm run test -- app/api/cron/appointment-reminders/route.test.ts`
    → **falla** (hook inexistente; casos RED).
  - **Traza:** ST-R2.
- [ ] 3.7 **GREEN** — Enganchar `sendOnboardingNudge(...)` en
  `app/api/cron/appointment-reminders/route.ts` dentro del loop de candidatos y
  después de `sent === true`; sin tocar
  `src/lib/citas/send-appointment-reminder.ts`.
  - Verificación:
    `npm run test -- app/api/cron/appointment-reminders/route.test.ts`
    → **pasa** los casos de 3.6.
  - **Traza:** ST-R2.

### D10 — Badge en el expediente

- [ ] 3.8 **RED** — Escribir
  `src/components/admin/patient-record/__tests__/OnboardingStatusBadge.test.tsx`
  (design.md D10, mapa D11, patrón `page.test.tsx`): renderiza pill ámbar
  «Onboarding pendiente» con `hasMedicalHistory: false` y pill verde «Onboarding
  completo» con `true`; `role="status"`; `aria-label` incluye «Historia de
  autoreporte del paciente» cuando `source === 'patient_autoreport'`; sin estado
  ni fetch.
  - Verificación:
    `npm run test -- src/components/admin/patient-record/__tests__/OnboardingStatusBadge.test.tsx`
    → **falla** (componente inexistente; casos RED).
  - **Traza:** ST-R3.
- [ ] 3.9 **GREEN** — Implementar
  `src/components/admin/patient-record/OnboardingStatusBadge.tsx` (hermano de
  `MedicalHistoryBadge.tsx`, sin estado) con la derivación vía
  `deriveOnboardingStatus`, `role="status"` y el `aria-label` accesible.
  - Verificación:
    `npm run test -- src/components/admin/patient-record/__tests__/OnboardingStatusBadge.test.tsx`
    → **pasa** los casos de 3.8.
  - **Traza:** ST-R3.
- [ ] 3.10 **RED** — Extender el test del expediente
  (`app/(admin)/patients/[id]/page.test.tsx` o el de `PatientRecordTabs`):
  `PatientRecordTabs` renderiza `OnboardingStatusBadge` con
  `hasMedicalHistory = medicalHistory.source !== null` y `source`; el
  `MedicalHistoryBadge` de advertencia clínica **sigue renderizándose igual** con
  alergias/condiciones; no hay fetch nuevo.
  - Verificación:
    `npm run test -- "app/(admin)/patients/[id]/page.test.tsx"`
    → **falla** (inserción inexistente; casos RED).
  - **Traza:** ST-R3, CR-R1.
- [ ] 3.11 **GREEN** — Insertar `<OnboardingStatusBadge hasMedicalHistory=
  {medicalHistory.source !== null} source={medicalHistory.source} />` junto a
  `<MedicalHistoryBadge />` en
  `src/components/admin/patient-record/PatientRecordTabs.tsx` (superficie
  aditiva; sin tocar el badge clínico ni el resto de tabs).
  - Verificación:
    `npm run test -- "app/(admin)/patients/[id]/page.test.tsx"`
    → **pasa** los casos de 3.10.
  - **Traza:** ST-R3, CR-R1.
- [ ] 3.12 **TRIANGULATE/REFACTOR** — Cubrir negativos que protegen el contrato:
  la plantilla `recordatorio_cita` y su orden de parámetros no cambian; el nudge
  nunca sale por texto libre; `anon` no accede a `onboarding_nudges` (revisión de
  RLS de 3.3); un paciente `completo` o `opted_out` nunca recibe nudge; un
  `reminder_key` repetido no duplica fila; el badge clínico no cambia. Limpiar
  sin cambiar el contrato.
  - Verificación:
    `npm run test -- src/lib/admin/__tests__/onboarding-status.test.ts src/lib/citas/__tests__/send-onboarding-nudge.test.ts app/api/cron/appointment-reminders/route.test.ts src/components/admin/patient-record/__tests__/OnboardingStatusBadge.test.tsx "app/(admin)/patients/[id]/page.test.tsx"`
    → **pasa**.
  - **Traza:** ST-R1, ST-R2, ST-R3, CR-R1.

**Commits (work units, Fase 3):** PR de 3–4 commits — (a) derivación de estado +
test (3.1–3.2), (b) migración `onboarding_nudges` + down (3.3), (c) módulo de
nudge + hook en cron + tests (3.4–3.7), (d) badge + inserción en tabs + tests
(3.8–3.12). Tests y docs en el mismo commit que el código. Conventional Commits
(`feat(onboarding): …`, `feat(admin): …`, `feat(expediente): …`).

**Cobertura de spec (Fase 3):** ST-R1, ST-R2, ST-R3, CR-R1.

---

## 4. Verify — verificación global

- [ ] V.1 Ejecutar la suite completa: `npm run test` → **en verde**. Si falla un
  caso ajeno a este cambio, registrarlo como limitación del entorno, no como
  completado.
  - **Traza:** todos los requirements.
- [ ] V.2 Ejecutar el typecheck: `npx tsc --noEmit` → **sin errores**.
- [ ] V.3 Ejecutar el lint: `npm run lint` → **sin errores**. **Nota
  verificada:** `package.json` de esta rama **no** define el script `lint`
  (`openspec/config.yaml` sí lo declara); si sigue ausente, registrar la brecha
  ambiental en el reporte y **no** inventar runner.
- [ ] V.4 Ejecutar el build: `npm run build` → **éxito** (compila el flujo de
  onboarding, la ruta del cron ampliada y el expediente con el badge nuevo).
- [ ] V.5 **Migraciones aplicadas y probadas en Supabase local antes del merge**
  (design.md D12) — Aplicar
  `YYYYMMDDHHMMSS_patient_medical_history_source.sql` y
  `YYYYMMDDHHMMSS_onboarding_nudges.sql` en el Supabase local, verificar el
  esquema resultante (columna `source` con `NOT NULL DEFAULT 'staff'` y su
  `CHECK`; tabla `onboarding_nudges` con `UNIQUE (reminder_key)`, RLS `ENABLE` +
  `FORCE` y **sin** policy `TO anon`) y probar los `down` correspondientes.
  Confirmar que el timestamp UTC quedó fijo al crear el archivo y **no** se
  renombró. Registrar la evidencia y el `schema_migrations` en el reporte.
  - Verificación: relectura de las cuatro migraciones (`up`/`down`) y evidencia
    de la aplicación local.
  - **Traza:** CR-R1, CR-R2, ST-R2.
- [ ] V.6 **Prerrequisito operativo (no bloquea el código)** — Registrar que la
  plantilla HSM `onboarding_pendiente` debe registrarse y aprobarse en Meta
  **antes del release de la Fase 3** (envío proactivo fuera de la ventana de
  24 h). No es un cambio de código: mientras no esté aprobada, el nudge se
  persiste como `failed` con `error_message` visible y **nunca** degrada a texto
  libre. Sin comando ejecutable asociado.

---

## 5. Archive — cierre del change

- [ ] A.1 Escribir `openspec/changes/whatsapp-pre-appointment-onboarding/verify-report.md`
  con el resultado de V.1–V.6, las brechas ambientales (lint ausente, si aplica),
  los prerrequisitos operativos y cualquier desviación registrada.
- [ ] A.2 Materializar las specs: crear/actualizar
  `openspec/specs/whatsapp-onboarding/spec.md` y
  `openspec/specs/patient-onboarding-status/spec.md` (nuevas) y aplicar los
  deltas a `openspec/specs/flow-engine/spec.md`,
  `openspec/specs/whatsapp-inbound-automation/spec.md` y
  `openspec/specs/clinical-record/spec.md`, siguiendo la convención vigente de
  `.opencode/skill/_shared/openspec-convention.md`.
- [ ] A.3 Mover la carpeta del change a
  `openspec/changes/archive/YYYY-MM-DD-whatsapp-pre-appointment-onboarding/`
  (fecha de archivo; `git mv` para preservar el historial).
- [ ] A.4 Escribir
  `openspec/changes/archive/YYYY-MM-DD-whatsapp-pre-appointment-onboarding/archive-report.md`
  con el resumen del ciclo (proposal → spec → design → tasks → apply → verify →
  archive), el mapa de PRs apilados y el estado final de `Decision needed before
  apply: No`.

---

## Matriz de trazabilidad (requirement → tareas)

| # | Requirement (capability) | Tareas |
|---|---|---|
| ONB-R1 | `whatsapp-onboarding` · Disparador determinista | 1.18, 1.19, 1.20, 1.21, 1.22, 1.23, 1.34, 2.8, 2.9, 2.12 |
| ONB-R2 | `whatsapp-onboarding` · Preguntas cerradas en orden determinista | 1.5, 1.6, 1.8, 1.9, 1.26, 1.27, 1.34 |
| ONB-R3 | `whatsapp-onboarding` · Resumen fiel y confirmación explícita | 1.5, 1.6, 1.12, 1.13, 1.26, 1.27, 2.10, 2.11, 2.12, 1.34 |
| ONB-R4 | `whatsapp-onboarding` · Escritura única, atómica y con provenance | 1.1, 1.2, 1.3, 1.26, 1.27, 1.28, 1.29, 1.34, 2.10, 2.11, V.5 |
| ONB-R5 | `whatsapp-onboarding` · Escalación por urgencia con pausa | 1.30, 1.31, 1.32, 1.33, 1.34 |
| ONB-R6 | `whatsapp-onboarding` · Teléfono confiable del paciente | 1.28, 1.29, 1.34 |
| ONB-R7 | `whatsapp-onboarding` · Activación por feature flag | 1.16, 1.17, 1.22, 1.23, 1.34 |
| ONB-R8 | `whatsapp-onboarding` · Continuidad y expiración del estado | 1.26, 1.27, 1.34 |
| FE-R1 | `flow-engine` · Action Execution (modificado) | 1.7, 1.8, 1.9, 1.10, 1.11, 1.26, 1.27, 1.28, 1.29, 2.3, 2.4, 2.5, 1.34 |
| FE-R2 | `flow-engine` · Flow Registry (modificado) | 1.8, 1.14, 1.15, 1.34 |
| FE-R3 | `flow-engine` · Control de tema reconoce onboarding | 1.24, 1.25, 1.34 |
| WIA-R1 | `whatsapp-inbound-automation` · Flow Engine integration (modificado) | 1.22, 1.23, 1.26, 1.27, 1.32, 1.33 |
| WIA-R2 | `whatsapp-inbound-automation` · Eve escalation persistence (modificado) | 1.32, 1.33 |
| CR-R1 | `clinical-record` · 1:1 retrieval/replacement (modificado) | 1.1, 1.2, 1.3, 3.10, 3.11, 3.12, V.5 |
| CR-R2 | `clinical-record` · Provenance de la historia clínica | 1.1, 1.2, 1.3, 1.4, 1.28, 1.29, V.5 |
| ST-R1 | `patient-onboarding-status` · Derivación determinista del estado | 3.1, 3.2, 3.12 |
| ST-R2 | `patient-onboarding-status` · Nudge como mensaje separado | 3.3, 3.4, 3.5, 3.6, 3.7, 3.12, V.5 |
| ST-R3 | `patient-onboarding-status` · Badge de onboarding en el expediente | 3.8, 3.9, 3.10, 3.11, 3.12 |
| ST-R4 | `patient-onboarding-status` · Vinculación de Fase 2 (datos generales) | 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12 |

**Cobertura:** 18/18 requirements con al menos una tarea RED y su GREEN, más las
verificaciones transversales de `Verify`.

---

## Conteo de tareas

| Fase | PR | Tareas |
|---|---|---|
| Fase 1 — Historia clínica básica | PR 1 | 34 (1.1–1.34) |
| Fase 2 — Datos generales | PR 2 | 12 (2.1–2.12) |
| Fase 3 — Nudge y panel | PR 3 | 12 (3.1–3.12) |
| Verify — verificación global | — | 6 (V.1–V.6) |
| Archive — cierre del change | — | 4 (A.1–A.4) |
| **Total** | 3 PRs apilados | **68** |

**Decision needed before apply: No.**
