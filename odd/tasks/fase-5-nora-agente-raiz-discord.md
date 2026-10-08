# Feature: fase-5-nora-agente-raiz-discord (issue #162)

## Goal

Crear a Nora como agente raíz independiente (`agents/nora/agent/`) con canal
Discord propio, exponiendo la lógica existente de métricas (`src/lib/`) como
tools conversacionales para doctores.

## Tasks

1. [x] Explorar lógica existente y patrón de agentes raíz (sdd-explore) — Ready for Proposal: yes
2. [x] SDD: proposal + spec (nora-agent, nora-discord-channel, nora-metrics-tools) + design + tasks
3. [ ] Aplicar: estructura `agents/nora/agent/` (agent.ts, model.ts, instructions.md, channels/discord.ts)
4. [ ] Aplicar: tools de Nora (dashboard-summary, provider-metrics, occupancy, no-shows, appointment-stats)
5. [ ] Aplicar: skills e instructions con guardrails de dominio
6. [ ] Aplicar: tests RED→GREEN + despliegue (vercel.json, docs)
7. [ ] Verificar suites (tsc, next build, test, test:local, eve build/info 4 agentes)
8. [ ] Archivar SDD + PR

## Evidence

- (registro de commits por tarea)

## Decisions

- (pendientes)
