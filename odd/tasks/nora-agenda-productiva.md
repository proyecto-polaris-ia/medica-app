# ODD Task Doc — nora-agenda-productiva (issue #149)

## Meta
- Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/149
- Épico: #140 (Fase 3 — Nora, agenda productiva)
- Rama/worktree: `feat-nora-agenda-productiva-indicadores-y-sugere`
- Alcance decidido por el usuario: **ambas fases, PRs apilados** (como #88)
  - Fase 1: indicadores de agenda productiva (reutiliza métricas de #88 / spec `dashboard-metrics`)
  - Fase 2: sugerencias de reacomodo deterministas con confirmación humana
- Convención SDD: `.agents/skills/_shared/openspec-convention.md`
- Change OpenSpec: `openspec/changes/nora-agenda-productiva/`

## Guardrails innegociables
- No diagnostica, no receta, no cotiza.
- Toda disponibilidad sale de la BD (nunca inventada por LLM ni por código).
- Ninguna reprogramación sin confirmación humana explícita en el panel.
- Fuera de alcance: reprogramación automática, WhatsApp de sugerencias, cambios a disponibilidad publicada.

## Tasks

### Fase 0 — Exploración
- [x] T0.1 Explorar `src/lib/citas/`, lib de métricas (`computeMetrics`), loader `src/lib/admin/metrics/`, panel dashboard. (subagente gentle-ai-explore, evidencia path:line en sesión)
- [x] T0.2 Leer specs `dashboard-metrics`, propuesta archive `confirm-appointment-from-reminder`, patrón subagente Mora (Fase 1 de #140) para la decisión de diseño.

### Fase 1 — Artefactos SDD
- [x] T1.1 proposal.md
- [x] T1.2 specs delta (capacidad nora-agent / indicadores / sugerencias) — 8 requisitos, 41 escenarios
- [x] T1.3 design.md — decisión: capacidad determinista con UI, NO agente LLM
- [x] T1.4 tasks.md del change
- [x] T1.5 Commit de artefactos SDD (work unit)

### Fase 2 — Indicadores (PR apilado 1)
- [x] T2.1 Tests primero (RED) para superficie de indicadores Nora (gaps 12 tests, loader 12, page +7)
- [x] T2.2 Implementación (GREEN) reutilizando la lib de métricas existente, sin duplicar (gaps.ts, loader.ts)
- [x] T2.3 Sección en panel con lecturas accionables (huecos, tasas por proveedor/día) (NoraSection.tsx, page.tsx)
- [ ] T2.4 verify: `supabase start` + `db reset` + `npm run test:local`, tsc, build (verificador muyghi7b-7-4kdo en curso; unit suite ya verde: 1213 tests, tsc limpio)
- [x] T2.5 Commits por unidad: 884cff3 (gap core), 149c06f (loader), a575934 (panel), 0ef9093 (odd doc). Push/PR: decisión del usuario al cerrar fase.

### Fase 3 — Sugerencias de reacomodo (PR apilado 2)
- [ ] T3.1 Tests primero (RED) para generador determinista de candidatas contra disponibilidad real
- [ ] T3.2 Implementación (GREEN) capa de sugerencias determinista
- [ ] T3.3 Flujo de confirmación humana en panel (aceptar/rechazar propuesta)
- [ ] T3.4 Aplicar reprogramación SOLO tras confirmación explícita
- [ ] T3.5 verify completo + PR 2 apilado sobre PR 1

### Fase 4 — Cierre
- [ ] T4.1 verify-report.md + archive del change
- [ ] T4.2 Reporte final: checks fallidos/pendientes, siguiente paso

## Registro de decisiones
- Review nativo RDD: el envelope de consentimiento expira sin presentarse (defecto conocido del relay, 2 intentos START, lineage_created false, sin mutación). Decisión del usuario: APLAZAR el review al cierre de Fase 1 — START fresco sobre el candidato normalizado tras los commits.
- Alcance: ambas fases, PRs apilados (usuario, hoy).
- Design: Nora = capacidad determinista con UI (lib + loader + panel), NO agente LLM. Justificaciones: #89 (Clara determinista), Mora = tools deterministas de solo lectura, el LLM nunca decide disponibilidad ni escribe en Supabase, futura Nora conversacional sería capa de presentación sobre este núcleo.
- Migración nueva con nomenclatura timestamp (`architecture.md §4`), no secuencial 0012-style.
- Loader Fase 2 persiste sugerencias nuevas como `proposed` de forma idempotente.
- Capability `nora-agent` (continuidad con #140; el diseño declara que NO es agente).

## Evidencia de commits
- SDD artifacts: `docs(nora): add nora-agenda-productiva SDD change artifacts (issue #149)` c1e0e78
- Fase 1: 884cff3 feat(nora) gap core · 149c06f feat(nora) loader · a575934 feat(nora) panel · 0ef9093 chore(odd) task doc
- Review nativo: omitido — RDD switch off en este clone (clone-local: off; global: on); registro `disabled/unmanaged`; entrega por política ordinaria.
