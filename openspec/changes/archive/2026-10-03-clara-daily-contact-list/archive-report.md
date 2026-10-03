# Archive Report: clara-daily-contact-list

**Change**: clara-daily-contact-list (Lista diaria de pacientes a contactar — Clara ligera, Issue [#89](https://github.com/proyecto-polaris-ia/medica-app/issues/89))
**Archived**: 2026-10-03
**Capability**: nueva `follow-up` — spec base materializada en `openspec/specs/follow-up/spec.md` (16 requirements, 48 escenarios)
**Prior phase artifacts**: proposal.md, specs/follow-up/spec.md, design.md, tasks.md, verify-report.md

## Final State (authoritative — at close)

The change is **COMPLETE and archived**. Verification outcome: **PASS WITH WARNINGS**.

| Fact | Value |
|------|-------|
| Verdict | PASS WITH WARNINGS — 0 CRITICAL, 0 MAJOR (CRITICAL `R3-race-double-send` corregido en `007d806` y validado) |
| Tests | 1101/1101 pass (127 archivos) |
| Typecheck | `npx tsc --noEmit` exit 0 |
| Build | `npm run build` exit 0 — rutas `/follow-up` y `/whatsapp-command-center/follow-up-drafts` |
| Lint | Omitido — sin script en `package.json` (limitación preexistente) |
| Guardrail | Sin cron: `vercel.json` sin cambios; ninguna ruta cron invoca el envío |
| Requisitos | 16 requisitos / 48 escenarios (capability `follow-up`) |
| Tareas | 49/49 completadas |
| Entrega | 3 PRs apilados por fase (decisión del usuario 2026-10-03, patrón del issue #87) |

## Ciclo recorrido

`explore → propose → spec → design → tasks → apply (3 fases, TDD estricto) → verify → archive`

- **Explore**: mapeo de datos, RLS y rutas; confirmado que no existe tabla de estado de contacto ni de borradores; patrón RLS de `0018`; migración nueva `0019`.
- **Propose**: `proposal.md` — capability nueva `follow-up`, sin capacidades modificadas; cambio aditivo.
- **Spec**: 16 requirements, 48 escenarios (RFC 2119 + Given/When/Then).
- **Design**: `design.md` — 11 decisiones; migraciones `0019`/`0020`; superficies de UI y API.
- **Tasks**: `tasks.md` — 49 tareas (F1: 17, F2: 11, F3: 15, F4: 6), 16/16 requirements trazados.
- **Apply**: TDD por fase (RED → GREEN → TRIANGULATE → REFACTOR) con desviaciones documentadas en `tasks.md`.
- **Verify**: PASS WITH WARNINGS, evidencia en `verify-report.md`.
- **Archive**: spec materializada y change movido a `archive/2026-10-03-clara-daily-contact-list/`.

## Commits principales

- `a9140fb` docs(openspec): ciclo SDD del change (proposal, spec, design, tasks)
- `7536996` feat(follow-up): reglas de segmentación y capa de datos (fase 1)
- `856af04` feat(follow-up): lista diaria del panel con acciones manuales (fase 2)
- `d2bea90` feat(follow-up): borradores de mensaje con aprobación humana en WCC (fase 3)
- `007d806` fix(follow-up): claim atómico approved→sending contra doble envío concurrente (R3-race-double-send)
- `5cb1d20` docs(openspec): cierre de verificación fase 4 (PASS WITH WARNINGS)

## Reviews RDD (receipt-driven development)

| Linaje | Alcance | Resultado |
|---|---|---|
| `review-35ad35ead838a7c3` | Fase 1 | APROBADO — acknowledgement quemado |
| `review-c89df4978889e20b` | Fase 2 (delta vs `7329035`; candidato acumulado recortado por `lens_context_budget_exceeded`) | APROBADO — acknowledgement quemado |
| `review-385006c7ce061f94` | Fase 3 (delta vs `4030f58`) | `correction_required` (R3-race-double-send CRITICAL) → corrección `007d806` → validador dirigido APROBADO — acknowledgement quemado |

## Hallazgos informativos acumulados como follow-ups

Las tres reviews RDD arrojaron hallazgos informativos, no bloqueantes, que quedan
como follow-ups (fuera del alcance archivado):

- Fase 1: `R3-failure-paths-untested`, `R3-lexicographic-time`, `R3-redundant-round-filter`, `R3-tasks-completion-contradiction`, `R3-unbounded-appointments-read`, `R3-upsert-overwrite`.
- Fase 2: `R3-catch-all-patient-preselect`, `R3-no-submit-inflight-guard`, `R3-note-unbounded`, `R3-silent-contact-post-failure`.
- Fase 3: `R3-draft-actions-error-blind`, `R3-name-param-guardrail-gap`, `R3-send-mark-gap`, `R3-submit-draft-silent-failure`, `R3-wcc-catch-all-degradation`.

Follow-ups adicionales de verificación (detalle en `verify-report.md`):

1. `FollowUpDraftStatus` (types.ts) sin `'sending'` (casteo en `mapFollowUpDraftRow`).
2. Comentario de cabecera de `0020` sin mencionar `sending`.
3. `CREATE POLICY` sin `DROP POLICY IF EXISTS` (precedente `0018`).
4. Limitación de `GET ?status=sending` (cae a sin filtro).
5. Carrera residual de doble POST si dos peticiones pasan el claim simultáneo (Meta no deduplica en su lado).
6. Verificación de migraciones en Supabase live pendiente de deploy.
7. `npm run lint` inexistente en `package.json`.

## Pendientes posteriores al merge (fuera de este cambio)

1. Plantilla HSM `seguimiento_paciente`: registrar y aprobar en Meta Business antes del release de la Fase 3.
2. Aplicar `0019` y `0020` en el entorno Supabase del proyecto y validar las policies en vivo.
3. Crear los 3 PRs apilados por fase (el último con `Closes #89`).
