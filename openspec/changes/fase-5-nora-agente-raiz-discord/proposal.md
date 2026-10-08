# Proposal: Nora como agente raíz independiente + canal Discord (issue #162, Fase 5)

**Issue**: [#162 — Fase 5: Crear Nora como agente raíz + canal Discord](https://github.com/proyecto-polaris-ia/medica-app/issues/162)
**Épico**: [#140 — Separación de agentes](https://github.com/proyecto-polaris-ia/medica-app/issues/140) · **Fase anterior**: #161 (fusionada, PR #204-206) · **Depende de**: #158

## Why

Nora existe hoy como (1) capacidad server-side del panel (`src/lib/admin/metrics/`,
spec `nora-agent` del issue #149: huecos improductivos y reacomodos) y (2) el motor
de métricas `dashboard-metrics` (`computeMetrics`, `computeOccupancy`, `computeNoShow`,
`getDashboardMetrics`). Los **doctores** no tienen una superficie conversacional para
consultar métricas del consultorio (ocupación, no-shows, citas atendidas/canceladas):
deben abrir el panel y navegar secciones.

Eve soporta agentes raíz independientes (`agents/<name>/agent/`), cada uno con canal
propio. Promover a Nora a agente raíz con canal Discord propio le da a los doctores
una interfaz de preguntas en lenguaje natural sobre métricas, reutilizando el motor
existente sin duplicar aritmética (invariante de la spec `dashboard-metrics`).

## Decisiones de mapeo (tarea 6 del issue — resueltas con la exploración)

1. **`get-dashboard-summary` NO envuelve `wcc-dashboard.ts`**. Ese módulo es
   específico de WhatsApp (escalaciones, conversaciones, knowledge base,
   observabilidad). El issue ya anticipaba esto en "Notas técnicas". En su lugar,
   la tool envuelve `getDashboardMetrics` (`src/lib/admin/metrics/loader.ts`),
   el adaptador Supabase del motor de métricas construido para Nora (#88), con
   resolución de rango (`preset`/`from`/`to`), zona horaria de la clínica y
   degradación tipada.
2. **El motor de métricas es la única fuente de aritmética**. Las 5 tools son
   proyecciones del mismo `DashboardMetricsView` ( ocupación, no-show, conteos por
   status, por proveedor). Cero duplicación de cálculos.
3. **Autorización**: allowlist fail-closed por variable de entorno
   `NORA_DISCORD_DOCTOR_IDS` (patrón mora/clara). Defensa en profundidad: el canal
   valida y cada tool revalida.
4. **Sin migraciones SQL nuevas**: todo el agregado vive en TS; no hay vistas
   materializadas que tocar. `wcc-dashboard.ts`, `provider-snapshot.ts` y el resto
   de `src/lib/` NO se mueven ni se modifican (excepto exportaciones públicas si
   hiciera falta).
5. **Crons para reportes periódicos**: fuera de alcance (el issue lo pospone).

## What Changes

### 1. Nora como agente raíz (`agents/nora/agent/`)

- `agent.ts` — `defineAgent({ model: createDynamicModel(), limits })` (patrón mora/clara).
- `model.ts` — copia de `createDynamicModel()` (resolución por env, default `deepseek-v4-flash`).
- `instructions.md` — personalidad de analista de métricas + guardrails de dominio.
- `access.ts` — `resolveDoctorAccess` con allowlist `NORA_DISCORD_DOCTOR_IDS`, fail-closed.
- `channels/discord.ts` — `discordChannel()` con slash `/nora`, ruta `POST /nora/eve/v1/discord`.

### 2. Tools de Nora (`agents/nora/agent/tools/`)

| Tool | Fuente | Contenido |
| --- | --- | --- |
| `get-dashboard-summary.ts` | `getDashboardMetrics` | Resumen general del rango: ocupación, no-show, conteos por status, por proveedor |
| `get-provider-metrics.ts` | `getDashboardMetrics` (filtro) | Métricas de un proveedor: ocupación, no-show, atendidos, huecos del rango |
| `get-occupancy.ts` | motor de ocupación | Ocupación por proveedor y total del rango |
| `get-no-shows.ts` | motor de no-show | Tasa y conteo de no-shows por período, por proveedor y total |
| `get-appointment-stats.ts` | `StatusCounts` | Agendadas/confirmadas/atendidas/canceladas/no-show/rescheduled/requested del rango |

### 3. Skills (`agents/nora/agent/skills/`)

- `metrics-reporting.md` — cómo presentar reportes (formato, rangos, comparación contra periodo anterior).
- `data-interpretation.md` — cómo interpretar métricas y dar contexto sin inventar datos.

### 4. Despliegue

- `vercel.json`: servicio `eve-nora` + rewrites `/nora/eve/v1/(.*)`.
- Docs: `docs/nora-discord-setup.md` (app de Discord, bot token, public key, env vars, slash command).

## Capabilities afectadas (deltas)

- `nora-agent` (ADDED): superficie conversacional del agente raíz.
- `nora-discord-channel` (nueva): canal Discord con allowlist de doctores.
- `nora-metrics-tools` (nueva): contracto de las 5 tools sobre el motor de métricas.

## Out of scope

- Crons de reportes periódicos.
- Refactor de `wcc-dashboard.ts` (queda intacto, orientado a WhatsApp).
- Mover o modificar lógica de `src/lib/`.
- Tabla de staff en Supabase para autorización (se mantiene allowlist por env).
- Sugerencias de reacomodo conversacionales (la spec #149 las mantiene en el panel;
  la conversación de Discord es de solo lectura de métricas en esta fase).

## Risks

- RLS: las tools leen `appointments`, `providers`, `business_hours` vía
  `getSupabaseAdmin()` (service role, igual que el panel); sin políticas nuevas.
- Fuga de métricas: mitigada por allowlist fail-closed + revalidación por tool.
- Presupuesto de revisión: change acotada (~10 archivos nuevos + 2 edits), sin
  modificaciones a agentes existentes.

## Rollback

- Eliminar `agents/nora/agent/`, el servicio `eve-nora` y las rewrites de
  `vercel.json`; revocar el bot de Discord. Ningún dato persistido nuevo.
