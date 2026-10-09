# Feature: fase-5-nora-agente-raiz-discord (issue #162)

## Goal

Crear a Nora como agente raíz independiente (`agents/nora/agent/`) con canal
Discord propio, exponiendo la lógica existente de métricas (`src/lib/`) como
tools conversacionales para doctores.

## Tasks

1. [x] Explorar lógica existente y patrón de agentes raíz (sdd-explore) — Ready for Proposal: yes
2. [x] SDD: proposal + spec (nora-agent, nora-discord-channel, nora-metrics-tools) + design + tasks
3. [x] Aplicar: estructura `agents/nora/agent/` (agent.ts, model.ts, instructions.md, access.ts, channels/discord.ts) — 23 tests en verde; commits 92c1bad (docs) + cd5edba (feat)
4. [x] Aplicar: tools de Nora (5 tools, 31 tests, proyecciones del motor) — commit 32a761a
5. [x] Aplicar: skills e instructions — metrics-reporting.md, data-interpretation.md — commit fadc527
6. [x] Aplicar: despliegue (vercel.json eve-nora, docs/nora-discord-setup.md, architecture, runbook) — commit 714bdce
7. [x] Verificar suites — tsc OK (fix c6986f4), test 1697, test:local 1968, eve info 4 agentes, builds OK
8. [x] Archivar SDD — archive/2026-10-09-fase-5-nora-agente-raiz-discord + deltas promovidos (nora-agent, nora-discord-channel, nora-metrics-tools)

## Evidence

- 92c1bad docs(openspec): artifacts SDD del change
- cd5edba feat(nora): esqueleto del agente raíz (agent, model, instructions, access, canal)
- 32a761a feat(nora): 5 tools de métricas sobre el motor getDashboardMetrics
- fadc527 docs(nora): skills metrics-reporting + data-interpretation
- 714bdce chore(deploy): servicio eve-nora, rewrites, docs de setup Discord
- c6986f4 fix(nora): import de MetricsTrend desde trend (ciclo de fix de verificación)
- d6925d5 docs(openspec): archive del change + deltas promovidos
- PR: https://github.com/proyecto-polaris-ia/medica-app/pull/208 (Closes #162)

## Decisions

- (pendientes)
