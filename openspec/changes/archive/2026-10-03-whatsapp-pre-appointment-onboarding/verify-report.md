# Verify Report — whatsapp-pre-appointment-onboarding

Fecha: 2026-10-03 · Verificador: gentle-ai-verify · Rama: `eliumontoya/feat-whatsapp-onboarding-pre-cita-datos-generale`
Issue: [#90](https://github.com/proyecto-polaris-ia/medica-app/issues/90) · HEAD verificado: `44f420e`
Entrega: 3 PRs apilados por fase (Fase 1 `010f84d`, Fase 2 `5df9f8b`, Fase 3 `44f420e`).

## Veredicto: PASS WITH WARNINGS

## Comandos

| Verificación | Resultado |
|---|---|
| `npm run test` | PASS — 154 archivos / 1447 tests |
| `npx tsc --noEmit` | PASS — exit 0 |
| `npm run build` | PASS — compila el flujo de onboarding, la ruta del cron ampliada y el expediente con el badge nuevo |
| `npm run lint` | N/A — script inexistente en `package.json` (brecha ambiental preexistente del repo; no se inventa runner) |
| Revisión de migraciones | PASS (estructural) — up idempotentes y down en orden inverso; **no aplicadas a una BD Supabase viva** |
| Flag de onboarding | PASS — `WHATSAPP_ONBOARDING_ENABLED` / `WHATSAPP_ONBOARDING_NUDGE_ENABLED` default **off** (`go`/`true`/`1`/`yes` encienden) |

## Estructura

- **Flow engine puro** (`src/lib/flows/`): `registry.ts` neutral con `book_appointment` + `onboarding`; `definitions/onboarding.flow.ts` con la máquina de estados determinista; `onboarding-answers.ts`, `onboarding-eligibility.ts` y `onboarding-urgency.ts` puros (sin I/O ni reloj implícito). `flow-engine.ts` corrige la simetría de `required` en `advance`.
- **Orquestador e ingesta** (`src/lib/whatsapp/`): `maybeStartOnboarding` tras clasificar y antes de enrutar (`orchestrator.ts:227`); acciones `evaluateOnboardingAnswer` (`:821`), `saveOnboardingHistory` (`:845`) y `saveOnboardingContact` (`:882`); pausa por urgencia con limpieza de `flow_state` y escalación real por port (`inbound-service.ts:407,439,442`).
- **Capa clínica** (`src/lib/admin/`): `source` (provenance) en `medical-history.ts`/`types.ts`; `onboarding-status.ts` puro; `updatePatientEmail` targeted en `patients.ts` (nunca toca la historia clínica).
- **Nudge y panel**: `send-onboarding-nudge.ts` (solo `sendWhatsAppTemplateMessage`, jamás texto libre), hook en `app/api/cron/appointment-reminders/route.ts` tras `sent === true`, `OnboardingStatusBadge.tsx` aditivo en `PatientRecordTabs.tsx`.
- **Migraciones** (`supabase/migrations/`): `20261003155627_patient_medical_history_source.sql` (+ down) y `20261003174659_onboarding_nudges.sql` (+ down). Up idempotentes (`ADD COLUMN IF NOT EXISTS`, enum con guarda `pg_type`, `CREATE TABLE IF NOT EXISTS`), RLS patrón 0018 (`ENABLE` + `FORCE`, `REVOKE` de `anon`/`authenticated`, `GRANT` a `authenticated`, policy admin) y `UNIQUE (reminder_key)`.

## Criterios de aceptación (#90)

Los cuatro criterios del issue, más el guardrail transversal de provenance/identidad verificado como criterio (e).

- **(a) Tests del flujo: caminos completos, abandono a medio flow, reanudación, resumen y confirmación — PASS.**
  `src/lib/flows/__tests__/onboarding-flow.test.ts` (estados/transiciones y terminal), `src/lib/flows/__tests__/onboarding-answers.test.ts:104` (ramificación sí/no) y `:278` (resumen/reinicio), `src/lib/whatsapp/__tests__/orchestrator-onboarding.test.ts:127` (arranque/reanudación), `:207` (continuación, ramificación y `retry`) y `:298` (abandono/timeout limpia sin escribir).
- **(b) Test de escalación ante respuesta de urgencia — PASS.**
  `src/lib/flows/__tests__/onboarding-urgency.test.ts:9` (patrones de urgencia y no-urgencia clínica legítima), `src/lib/whatsapp/__tests__/inbound-service-onboarding.test.ts:116` (status `escalated`, `flow_state` a `null`, `createEscalation` por el canal, sin escritura) y `:147` (mensajes posteriores no continúan ni escriben); fuente `src/lib/flows/onboarding-urgency.ts:25` y `src/lib/whatsapp/orchestrator.ts:368,496`.
- **(c) Escritura final atómica (o todo el resumen confirmado o nada) — PASS.**
  `src/lib/whatsapp/__tests__/orchestrator-onboarding.test.ts:318` (una sola llamada `upsertMedicalHistory` con `source: 'patient_autoreport'`), `:348` (nada antes de la confirmación) y `:359` (fallo ⇒ escala sin reintentar); fuente `src/lib/whatsapp/orchestrator.ts:845,861,863` (upsert único) y `supabase/migrations/20261003155627_patient_medical_history_source.sql:7-14`.
- **(d) OpenSpec para el cambio — PASS.**
  `openspec/changes/whatsapp-pre-appointment-onboarding/proposal.md`, deltas en `specs/{whatsapp-onboarding,patient-onboarding-status,flow-engine,whatsapp-inbound-automation,clinical-record}/spec.md` (19 requirements / 51 escenarios), `design.md` (D1–D12) y `tasks.md` (68 tareas con trazabilidad 18/18).
- **(e) Guardrails del issue: no diagnóstico (registro literal), provenance de autoreporte y escritura solo con teléfono confiable del propio paciente — PASS.**
  `src/lib/flows/onboarding-answers.test.ts:125` guarda el detalle literal sin normalización clínica (fuente `onboarding-answers.ts:91`); provenance forzada en backend en `src/lib/whatsapp/orchestrator.ts:863`; identidad verificada en `src/lib/whatsapp/orchestrator.ts:852` y su negativo en `orchestrator-onboarding.test.ts:378`.

## Planes de fase (verificación transversal)

- **Flag apagado = comportamiento actual**: `src/lib/whatsapp/onboarding-flag.ts:23,27` (default off) y `orchestrator-onboarding.test.ts:132` (routing intacto con flag apagado).
- **Contrato de recordatorios intacto**: `send-appointment-reminder.ts` no se modifica; el nudge es plantilla separada (`src/lib/citas/send-onboarding-nudge.ts:36`) y solo se engancha tras `sent === true`.
- **Fase 2 no toca la historia**: `orchestrator-onboarding.test.ts:565` (flujo solo-contacto sin `saveOnboardingHistory`) y `:510` (historia una vez + email una vez).

## Warnings (no bloqueantes)

1. **`npm run lint` no existe en `package.json`** — brecha ambiental preexistente del repo (`openspec/config.yaml` sí declara el comando). Registrada en V.3; no se inventó runner.
2. **Migraciones verificadas de forma estructural, no aplicadas a una BD Supabase viva.** La revisión es estática sobre los archivos SQL (`IF NOT EXISTS`, orden del down, RLS 0018, `UNIQUE (reminder_key)`). Falta aplicarlas y probar los `down` en Supabase local/entorno antes del merge (V.5).
3. **Prerrequisito operativo (gate de release, no de código):** la plantilla HSM `onboarding_pendiente` debe registrarse y aprobarse en Meta Business antes del release de la Fase 3. Mientras no esté aprobada, el nudge se persiste como `failed` con `error_message` y **nunca** degrada a texto libre.

## Hallazgos informativos (backlog, fuera del alcance archivado)

Acumulados por las tres reviews RDD (no bloqueantes):

- Fase 1 (`review-4c62be58c351c2de`): `R3-clearanswer-contract`, `R3-escalation-port-unhandled`, `R3-missing-draft-error-loop`, `R3-source-unvalidated-cast`, `R3-summary-restart-data-loss`.
- Fase 2 (`review-f102564e27a9dbcb`) y Fase 3 (`review-c949f9c249ac566c`): hallazgos informativos registrados en los respectivos linajes RDD; ninguno CRITICAL/MAJOR.

## Prerrequisitos de despliegue

Al merge: aplicar `20261003155627_patient_medical_history_source.sql` y `20261003174659_onboarding_nudges.sql` en el entorno Supabase del proyecto y validar las policies en vivo. Mantener `WHATSAPP_ONBOARDING_ENABLED` y `WHATSAPP_ONBOARDING_NUDGE_ENABLED` sin definir (default off) hasta confirmar la plantilla HSM `onboarding_pendiente` como `Approved` en Meta.
