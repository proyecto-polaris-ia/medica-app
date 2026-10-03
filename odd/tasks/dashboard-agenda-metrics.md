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
5. [x] Apply Fase 1 — migración 0019 (con down) + estampado atómico + lib `src/lib/admin/metrics/` + 99 tests (RED→GREEN). Commits 69e01a4, 1c56a82
6. [x] Apply Fase 2 — panel en dashboard (loader sin N+1, selector, cards, desglose, loading/empty) + 23 tests. Commit 8aa71e5
7. [x] Apply Fase 3 — trend.ts (previousRangeOf/bucketRange/computeTrend) + loader ext + serie accesible + 117 tests. Commit a0eb6ad
8. [x] Verify — PASS WITH WARNINGS: 1076 tests, build OK, tsc OK, migración/N+1/TZ/clamp correctos. Pendiente: openspec validate (CLI no instalada) y verificación manual con BD (16.3/21.4)
9. [x] Archive — openspec/changes/archive/2026-10-03-dashboard-agenda-metrics/ + spec materializada en openspec/specs/dashboard-metrics/spec.md
10. [x] PRs apilados por fase — #100 (1-lib, base main) → #101 (2-panel, base #100) → #102 (3-tendencia, base #101, Closes #88)

## Evidence
- Explore report: 2026-10-03, hallazgos clave en Engram.
