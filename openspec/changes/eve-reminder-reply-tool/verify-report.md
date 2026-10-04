# Verify Report: eve-reminder-reply-tool

Fecha: 2026-12-19 · Branch: `eliumontoya/follow-up-detecci-n-estructurada-de-respuestas-a`
Commit: `c733d97`

## Decisión documentada (criterio de aceptación #114)

**Opción A** — reintegrar los módulos huérfanos de reminder-reply en Eve como
tool dedicada. Rationale completo en `proposal.md` y `design.md` (D1–D6) y en
`odd/tasks/eve-reminder-reply.md`. En síntesis: el servicio ya fue diseñado para
Eve (usa `eve-escalation`, no envía WhatsApps), los guardrails de dominio ya
viven de forma determinista, y la spec activa ya describe este comportamiento.

## Resultados de verificación (verificador independiente, read-only)

| Check | Resultado |
| --- | --- |
| `npm run typecheck` (`tsc --noEmit`) | PASS, exit 0 |
| ESLint sobre archivos nuevos | PASS, 0 errores |
| `vitest run` — 5 suites legacy de reminder-reply + tool nuevo + escalate-to-human | 7 archivos, **90/90 tests** PASS |
| Superficie: `src/`, `agent/agent.ts`, `agent/channels/` sin cambios | PASS (`git status` vacío) |
| Wording de `agent/instructions.md` vs spec delta (precedencia) | PASS, requisito por requisito |

## TDD

- RED: `vitest run tests/agent/tools/handle-reminder-reply.test.ts` falló por
  archivo inexistente antes de la implementación.
- GREEN: 7 tests en verde tras implementar.
- Triangulación: caso de ambigüedad con `needsHuman: true` y teléfono passthrough.

## Cobertura de los criterios de aceptación del issue #114

- [x] Decisión documentada (A) con rationale.
- [x] Herramienta Eve con tests (`tests/agent/tools/handle-reminder-reply.test.ts`).
- [x] Spec delta en `appointment-reminder-reply`
  (`openspec/changes/eve-reminder-reply-tool/specs/…`): MODIFIED
  "Control por feature flag" y "Precedencia…" (flow engine → Eve), ADDED
  "Herramienta Eve de respuesta a recordatorio".

## Pendiente / fuera de alcance

- `WHATSAPP_REMINDER_REPLY_ENABLED` sigue default off: rollout explícito.
- Suite completa `npm run test:local` (Supabase local) e integración del path
  con flag encendido contra BD: verificación funcional pendiente antes de merge.
- Archivado del change OpenSpec (fase verify del ciclo SDD) al cerrar el issue.
