# Design: fase-5-nora-agente-raiz-discord (issue #162)

## Decisiones y racional

### D1 — Fuente de datos: `getDashboardMetrics`, no `wcc-dashboard.ts`

`src/lib/wcc-dashboard.ts` es el dashboard de WhatsApp (escalaciones,
conversaciones, knowledge base). El motor real de métricas de consultorio es
`src/lib/admin/metrics/` (#88, construido para Nora):
`loader.ts:getDashboardMetrics` resuelve rango + TZ de clínica + joins
(`appointments`, `providers`, `business_hours`) + degradación tipada.
`computeMetrics` ya produce `occupancyPct`, `noShowRatePct`, `noShowCount`,
`attendedCount`, `totalAppointments`, `StatusCounts` por proveedor.

**Consecuencia**: las 5 tools son proyecciones del mismo `DashboardMetricsView`;
no hay segunda aritmética (invariante `dashboard-metrics` y `nora-agent`).
`wcc-dashboard.ts` y `provider-snapshot.ts` quedan intactos.

### D2 — Autorización: allowlist env fail-closed (patrón mora/clara)

`agents/nora/agent/access.ts` replica `agents/mora/agent/access.ts`:
`resolveDoctorAccess(ctx)` contra `NORA_DISCORD_DOCTOR_IDS` (split por coma,
trim, comparación exacta), fail-closed si ausente/vacía. El canal entrega
`auth: { principalId, authenticator: "discord", attributes: { doctor_discord_id,
channel_id, guild_id } }`; cada tool llama `requireDoctor(ctx)` y devuelve
refusal sin consultar BD si falla. Tabla de staff en Supabase: fuera de alcance.

### D3 — Canal siempre construido

`agents/nora/agent/channels/discord.ts` copia el patrón de mora/clara:
`discordChannel({ credentials, onCommand })` con placeholder "unconfigured" si
faltan env vars. `eve build` no se rompe sin credenciales. Slash command
`/nora`; endpoint `POST /nora/eve/v1/discord`.

### D4 — Sin migraciones ni cambios en `src/lib/`

Todo el agregado vive en TS; el loader ya existe y está probado
(`src/lib/admin/metrics/__tests__/loader.test.ts`). Nora importa; no mueve nada.

## Estructura de archivos

```
agents/nora/
└── agent/
    ├── agent.ts                    # defineAgent({ model: createDynamicModel(), limits })
    ├── model.ts                    # createDynamicModel() (copia de mora/clara)
    ├── instructions.md             # personalidad analista + guardrails
    ├── access.ts                   # resolveDoctorAccess + requireDoctor (NORA_DISCORD_DOCTOR_IDS)
    ├── channels/
    │   └── discord.ts              # discordChannel(), onCommand → handleNoraDiscordCommand
    ├── tools/
    │   ├── get-dashboard-summary.ts
    │   ├── get-provider-metrics.ts
    │   ├── get-occupancy.ts
    │   ├── get-no-shows.ts
    │   └── get-appointment-stats.ts
    └── skills/
        ├── metrics-reporting.md
        └── data-interpretation.md

tests/agent/nora/
├── structure.test.ts               # espejo de tests/agent/clara/structure.test.ts
├── access.test.ts                  # allowlist fail-closed
├── channels/discord.test.ts        # onCommand: allow/deny/attributes
└── tools/*.test.ts                 # 5 suites, una por tool
```

Edits existentes (mínimos): `vercel.json` (servicio `eve-nora` + rewrites
`/nora/eve/v1/(.*)`), `docs/nora-discord-setup.md` (nuevo),
`architecture.md`/`docs/eve-runbook.md` (4 agentes).

## Contrato de tool

```ts
defineTool({
  description: "...",                       // español
  inputSchema: z.object({                   // zod v3, .describe() en español
    preset: z.enum(["week", "month"]).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    providerId: z.string().optional(),      // solo get-provider-metrics
  }),
  async execute(input, ctx) {
    const auth = requireDoctor(ctx);        // refusal si no autorizado
    const view = await getDashboardMetrics({ preset, from, to });
    // proyección del view → { success: true, ...proyección, message }
    // nunca throw; error → { success: false, error: message en español }
  },
})
```

Mapeo rango: cada tool acepta `preset` (`week`|`month`) o `from`/`to` ISO; sin
argumentos usa `week`. El mapeo exacto al input de `resolveRange`/`getDashboardMetrics`
se verifica al leer `loader.ts:135` durante el apply (el explorador reportó la
firma; se ajusta si difiere).

## Flujo de interacción

```
Doctor (Discord) ──/nora──▶ POST /nora/eve/v1/discord
  │                              │
  │                    discordChannel → handleNoraDiscordCommand
  │                              │ allowlist NORA_DISCORD_DOCTOR_IDS (fail-closed)
  │                              ▼
  │                        sesión Eve (model: createDynamicModel)
  │                              │ LLM elige tool
  │                              ▼
  │                     tool: requireDoctor(ctx) → getDashboardMetrics(...)
  │                              ▼
  └── respuesta en español ◀── proyección del DashboardMetricsView
```

## Riesgos y mitigaciones

- **RLS**: lectura vía `getSupabaseAdmin()` dentro del loader existente (mismo
  camino que el panel); sin políticas nuevas.
- **Fuga de datos**: allowlist fail-closed + revalidación por tool + refusal en
  español (tests RED→GREEN lo fijan).
- **Deriva del loader**: firma de `getDashboardMetrics` verificada en apply antes
  de escribir tools.

## Plan de prueba

- RED→GREEN (vitest, node env, mocks del query-builder): structure, access,
  channel, y las 5 tools (autorización primero, datos solo del motor, degradación).
- Suites existentes intactas: `npm test`, `npm run test:local` (Supabase local).
- `npx tsc --noEmit`, `npm run build`, `npx eve build`, `npx eve info` (4 agentes).
