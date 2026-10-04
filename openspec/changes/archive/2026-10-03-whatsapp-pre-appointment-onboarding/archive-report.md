# Archive Report: whatsapp-pre-appointment-onboarding

**Change**: whatsapp-pre-appointment-onboarding (Onboarding pre-cita por WhatsApp — historia clínica básica y datos generales, Issue [#90](https://github.com/proyecto-polaris-ia/medica-app/issues/90))
**Archived**: 2026-10-03
**Capabilities**: nuevas `whatsapp-onboarding` y `patient-onboarding-status` — specs base materializadas en `openspec/specs/whatsapp-onboarding/spec.md` (8 requirements, 18 escenarios) y `openspec/specs/patient-onboarding-status/spec.md` (4 requirements, 11 escenarios); modificadas `flow-engine`, `whatsapp-inbound-automation` y `clinical-record` (deltas MODIFIED/ADDED fusionados en las specs publicadas).
**Prior phase artifacts**: proposal.md, specs/, design.md, tasks.md, verify-report.md

## Final State (authoritative — at close)

The change is **COMPLETE and archived**. Verification outcome: **PASS WITH WARNINGS**.

| Fact | Value |
|------|-------|
| Verdict | PASS WITH WARNINGS — 0 CRITICAL, 0 MAJOR (los hallazgos informativos quedan como backlog) |
| Tests | 1447/1447 pass (154 archivos) |
| Typecheck | `npx tsc --noEmit` exit 0 |
| Build | `npm run build` exit 0 — flujo de onboarding, cron ampliado y badge del expediente |
| Lint | Omitido — `package.json` sin script `lint` (brecha ambiental preexistente) |
| Migraciones | Revisión estructural PASS; aplicación a Supabase live pendiente |
| Requisitos | 19 requirements / 51 escenarios (nuevas: 12 req / 29 esc; modificadas + añadidas: 7 req / 22 esc) |
| Tareas | 68 (Fase 1: 34, Fase 2: 12, Fase 3: 12, Verify: 6, Archive: 4) |
| Entrega | 3 PRs apilados por fase (patrón de los issues #88/#89/#91) |
| Feature flags | `WHATSAPP_ONBOARDING_ENABLED` y `WHATSAPP_ONBOARDING_NUDGE_ENABLED` default **off** |
| Decision needed before apply | No (D1–D12 cerradas en `design.md`) |

## Ciclo recorrido

`propose → spec → design → tasks → apply (3 fases, TDD estricto) → verify → archive`

| Fase | Artefacto / entrega | Commit |
|---|---|---|
| Proposal | `proposal.md` (capabilities, guardrails, rollback) | `f525bab` |
| Spec | deltas de las 5 capabilities (19 req / 51 esc, RFC 2119 + Given/When/Then) | `90760d9` |
| Design | `design.md` (D1–D12, planes por fase, mapa de pruebas D11) | `bad47c8` |
| Tasks | `tasks.md` (68 tareas, 18/18 requirements trazados) | `97f1d54` |
| Apply Fase 1 | provenance `source` + migración, flujo de onboarding, disparador/flag, acciones y pausa por urgencia (D1–D7, D11, D12) | `010f84d` |
| Apply Fase 2 | datos generales: `ask_email`/`show_contact_summary`/`save_contact`, `updatePatientEmail` (D4, D8) | `5df9f8b` |
| Apply Fase 3 | nudge (`onboarding_nudges`, `send-onboarding-nudge.ts`, hook en cron) y badge del expediente (D9, D10) | `44f420e` |
| Test fix | corrección preexistente de la ruta de migración `0020 → 0021` que desbloqueó V.1 | `0c2e7ff` |
| Verify | `verify-report.md` — PASS WITH WARNINGS (1447 tests / 154 archivos, tsc 0, build OK) | — |
| Archive | specs materializadas + change movido a `archive/2026-10-03-whatsapp-pre-appointment-onboarding/` | (este commit) |

## Specs materializadas

- **Nuevas** (patrón ADDED → `## Requirements` + `## Purpose`, sin framing de delta):
  - `openspec/specs/whatsapp-onboarding/spec.md` — disparador determinista, preguntas cerradas en orden determinista, resumen y confirmación explícita, escritura única/atómica con provenance de autoreporte, escalación por urgencia con pausa, teléfono confiable, feature flag y continuidad/timeout.
  - `openspec/specs/patient-onboarding-status/spec.md` — derivación determinista del estado, nudge separado, badge del expediente y vinculación de Fase 2 (datos generales).
- **Modificadas** (deltas MODIFIED fusionados y ADDED añadidos):
  - `openspec/specs/flow-engine/spec.md` — `Action Execution` y `Flow Registry` actualizados; añadido `Reconocimiento del flujo de onboarding en el control de tema`.
  - `openspec/specs/whatsapp-inbound-automation/spec.md` — `Flow Engine integration` y `Eve escalation persistence` actualizados (inicio/continuación del onboarding y limpieza del `flow_state` al escalar).
  - `openspec/specs/clinical-record/spec.md` — `Medical history 1:1 retrieval and replacement` actualizado; añadido `Provenance de la historia clínica`.

## Reviews RDD (receipt-driven development)

| Linaje | Alcance | Resultado |
|---|---|---|
| `review-4c62be58c351c2de` | Fase 1 (lente review-reliability; snapshot code-only del squash `010f84d`) | APROBADO — acknowledgement quemado |
| `review-f102564e27a9dbcb` | Fase 2 (delta antes del PR 2) | APROBADO — acknowledgement quemado |
| `review-c949f9c249ac566c` | Fase 3 (delta antes del PR 3) | APROBADO — acknowledgement quemado |

## Hallazgos informativos acumulados como follow-ups

Las tres reviews RDD arrojaron hallazgos informativos, no bloqueantes, que quedan
como backlog (fuera del alcance archivado):

- Fase 1: `R3-clearanswer-contract`, `R3-escalation-port-unhandled`, `R3-missing-draft-error-loop`, `R3-source-unvalidated-cast`, `R3-summary-restart-data-loss`.
- Fase 2 y Fase 3: hallazgos informativos registrados en sus respectivos linajes; ninguno CRITICAL/MAJOR.

## Riesgos abiertos registrados en el diseño (fieles al spec)

- Citas en estado `requested` (default de `0001`) no disparan el onboarding hasta ser confirmadas; decisión consciente del spec (`confirmed`/`pending`).
- Una fila `source = 'staff'` se deriva como `'completo'` (historia ya validada por el consultorio) y no recibe nudge; una tercera etiqueta de UI queda como decisión futura sin migración.
- El path de escalación del flow engine crea fila en `whatsapp_escalations` solo para onboarding; unificar ese path queda fuera de alcance.

## Pendientes posteriores al merge (fuera de este cambio)

1. **Aplicar las migraciones en Supabase live**: `20261003155627_patient_medical_history_source.sql` y `20261003174659_onboarding_nudges.sql`, y probar los `down` correspondientes (`supabase/migrations/down/`).
2. **Aprobar la plantilla HSM `onboarding_pendiente` en Meta Business** antes del release de la Fase 3; mientras no esté aprobada, el nudge queda `failed` con `error_message` y nunca degrada a texto libre.
3. **Brecha ambiental de lint**: `package.json` no define el script `lint` que `openspec/config.yaml` declara; registrar/decidir aparte, sin inventar runner.
4. Crear los 3 PRs apilados por fase (el último con `Closes #90`) manteniendo los feature flags apagados por default.
