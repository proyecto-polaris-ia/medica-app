# Feature: dashboard-agenda-metrics (issue #88)

## Context
- Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/88
- Worktree: `.worktrees/medica-app/feat-dashboard-m-tricas-de-ocupaci-n-de-agenda-y`
- Branch: `eliumontoya/feat-dashboard-m-tricas-de-ocupaci-n-de-agenda-y`
- Scope decidido: Fases 1+2+3 completas, PRs apilados por fase.
- SDD: `openspec/changes/dashboard-agenda-metrics/`

## Decisions
- Numerador de ocupación: minutos de citas con status `confirmed | attended | pending | requested`.
- No-show rate: `no_show / (no_show + attended)`; canceladas fuera del denominador.
- Denominador de ocupación: minutos de `business_hours` por proveedor (no existe tabla de exclusiones; 0002 es la constraint EXCLUDE de solapamiento).
- Migración: columnas de transición `confirmed_at`, `cancelled_at`, `no_show_at` (timestamptz) en `appointments`, escritas en la misma transacción que el cambio de status (decisión en issue #88).
- TZ: `America/Mexico_City` vía `src/lib/admin/clinic-time.ts` / `timezone.ts`.

## Tasks
1. [x] Propose — proposal.md del change (203 líneas, capability nueva `dashboard-metrics`; migración de transiciones como ADDED en `dashboard-metrics`)
2. [x] Spec — deltas RFC 2119 por capability (6 requisitos / 29 escenarios en specs/dashboard-metrics/spec.md)
3. [x] Design — design.md con rutas y decisiones (692 líneas, sin open questions)
4. [x] Tasks — tasks.md con forecast (68 tareas; Fase 1: 33, Fase 2: 18, Fase 3: 17; Decision needed: No)
5. [ ] Apply Fase 1 — migración de transiciones + lib `src/lib/admin/metrics/` + tests (RED→GREEN)
6. [ ] Apply Fase 2 — panel de métricas en dashboard (selector de rango, cards, desglose por proveedor)
7. [ ] Apply Fase 3 — tendencia vs periodo anterior
8. [ ] Verify — tsc + vitest + build
9. [ ] Archive — materializar specs
10. [ ] PRs apilados por fase (Fase 1 base main → Fase 2 → Fase 3, Closes #88)

## Evidence
- Explore report: 2026-10-03, hallazgos clave en Engram.
