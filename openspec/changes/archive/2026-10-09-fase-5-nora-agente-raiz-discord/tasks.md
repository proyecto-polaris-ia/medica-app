# Tasks: fase-5-nora-agente-raiz-discord (issue #162)

**Forecast**: ~14 archivos nuevos + 2 edits; workload medio-alto pero
convencional (patrón mora/clara replicado). Decision needed before apply: **No**
(todas las decisiones de mapeo están resueltas en proposal/design).

## Fase 1 — Estructura del agente

- [x] 1.1 Crear `agents/nora/agent/agent.ts`, `model.ts` (copiar patrón mora/clara) y `instructions.md` (personalidad analista de métricas + guardrails: solo lectura, no diagnóstico, no escritura, datos solo de BD, escalar urgencias).
- [x] 1.2 Crear `agents/nora/agent/access.ts` con `resolveDoctorAccess`/`requireDoctor` (allowlist `NORA_DISCORD_DOCTOR_IDS`, fail-closed) + `tests/agent/nora/access.test.ts` (RED→GREEN).
- [x] 1.3 Crear `agents/nora/agent/channels/discord.ts` (slash `/nora`, unconfigured si faltan creds) + `tests/agent/nora/channels/discord.test.ts` (RED→GREEN).

## Fase 2 — Tools (verificar firma real de `getDashboardMetrics` antes de escribir)

- [x] 2.1 `tools/get-dashboard-summary.ts` + suite de tests (autorización primero, degradación vacía).
- [x] 2.2 `tools/get-provider-metrics.ts` + suite (aislamiento por proveedor, error de proveedor inexistente).
- [x] 2.3 `tools/get-occupancy.ts` + suite (consistencia con el motor).
- [x] 2.4 `tools/get-no-shows.ts` + suite (tasa y conteo del motor).
- [x] 2.5 `tools/get-appointment-stats.ts` + suite (conteos por status, suma = total).
- [x] 2.6 `tests/agent/nora/structure.test.ts` (espejo clara: instrucciones, skills, guardrails presentes).

## Fase 3 — Skills

- [x] 3.1 `skills/metrics-reporting.md` (formato de reporte, rangos, comparación con periodo anterior, nunca inventar datos).
- [x] 3.2 `skills/data-interpretation.md` (contexto de métricas, umbrales de alerta, sin diagnóstico ni consejo clínico).

## Fase 4 — Despliegue y docs

- [x] 4.1 `vercel.json`: servicio `eve-nora` + rewrites `/nora/eve/v1/(.*)`.
- [x] 4.2 `docs/nora-discord-setup.md` (app Discord, env vars, slash command, Interactions Endpoint) + actualizar `architecture.md`/`docs/eve-runbook.md` a 4 agentes.

## Fase 5 — Verificación

- [x] 5.1 `npx tsc --noEmit` + `npm run build` en verde.
- [x] 5.2 `npm test` (suite completa) + `npm run test:local` (Supabase local).
- [x] 5.3 `npx eve build` + `npx eve info` reportan 4 agentes raíz (eva, mora, clara, nora).
