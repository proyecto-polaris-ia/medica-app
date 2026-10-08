# Exploración — `fase-4-clara-agente-raiz-discord`

Fuente: agente de exploración (gentle-ai-explore), issue #161. Evidencia con `path:line`.

## 1. Lógica existente de follow-up y su exposición como tools

| Módulo | Contenido | Decisión sugerida |
|---|---|---|
| `src/lib/admin/follow-up/config.ts:8-23` | Constantes: `NO_SHOW_WINDOW_DAYS=90`, `STALLED_TREATMENT_DAYS=45`, `INACTIVE_PATIENT_DAYS=180`, `UNANSWERED_QUOTE_DAYS=21`, prioridades de razón | Interno (sin I/O) |
| `src/lib/admin/follow-up/rules.ts` | Puro: `daysBetween:59`, `isRecoverableNoShow:69`, `isStalledTreatmentPlan:96`, `isInactivePatient:125`, `isUnansweredQuote:161`, `pickReasonForPatient:224`, `buildFollowUpList:299` | Interno |
| `src/lib/admin/follow-up/follow-up.ts` | Server-only con `getSupabaseAdmin()`: `currentRoundDate:179`, `listDailyFollowUpCases:190`, `loadFollowUpContactsForRound:267`, `markFollowUpContact:290` (escribe `follow_up_contacts`) | `listDailyFollowUpCases` → tool de lectura; `markFollowUpContact` → tool determinista de escritura con auth |
| `src/lib/admin/follow-up/types.ts:37-61` | `FollowUpContact`, `FollowUpCase`, `FollowUpDraftStatus` (`draft\|approved\|rejected\|sent\|sent_failed`), `FollowUpDraft` | Tipos |
| `src/lib/admin/follow-up/draft.ts` | Puro: `validateFollowUpDraftText:101` (patrones prohibidos precio/clínico/presión :29-56), `buildFollowUpDraft:130`, `MAX_DRAFT_LENGTH=600` | Interno (guardrail de validación reutilizable) |
| `src/lib/admin/follow-up/drafts.ts` | Escrituras en `follow_up_message_drafts`: `createFollowUpDraft:126` (idempotente por `dedup_key`), `transitionFollowUpDraft:170`, `updateFollowUpDraftBody:220`, `claimFollowUpDraftForSend:258`, `markFollowUpDraftSent:277`, `markFollowUpDraftSentFailed:307` | `createFollowUpDraft`/`transitionFollowUpDraft` → tool determinista; `claim/markSent*` nunca expuestos (el envío no es de Clara) |
| `src/lib/admin/follow-up/draft-llm.ts` | `generateFollowUpDraftText:172` (LLM, timeout 8s, fallback a plantilla), `buildFollowUpDraftPrompt:108`, `createDraftProviderFromEnv:131` | Tool de redacción que reutiliza `buildFollowUpDraft` (validación guardrail) |
| `src/lib/admin/follow-up/drafting-flag.ts:18` | `isClaraDraftingEnabled()` lee `CLARA_DRAFTING_ENABLED` (default off, kill switch) | Interno |
| `src/lib/follow-up/send-follow-up-draft.ts` | Envío server-only vía `sendWhatsAppTemplateMessage`; idempotente; escribe en `whatsapp_contacts/conversations/messages` | **Nunca tool** — el envío requiere aprobación humana (ciclo draft→approved) |
| `src/lib/wcc-follow-up-drafts.ts:117` | `getWccFollowUpDrafts` (lectura tab WCC, degrada a cola vacía) | No necesario |
| `src/lib/wcc-contacts.ts` | `getWccContactsList`, `getWccContactDetail` | No necesario |

## 2. Patrón de agente existente (eva / mora)

- `defineAgent({ model: createDynamicModel(), limits: { sessionTimeoutMs: 1800000 } })` — `agents/eva/agent/agent.ts:7`, `agents/mora/agent/agent.ts:9`.
- `createDynamicModel` — `agents/mora/agent/model.ts`: `defineDynamic({ events: { "step.started": … } })`; resuelve por step desde env `WHATSAPP_AGENT_LLM_MODEL` (default `deepseek-v4-flash`), `WHATSAPP_AGENT_LLM_API_KEY`, `WHATSAPP_AGENT_LLM_BASE_URL`; provider OpenAI-compatible con header `x-opencode-session`.
- `discordChannel({ credentials: { applicationId, botToken, publicKey }, onCommand })` — `agents/mora/agent/channels/discord.ts:53`; credenciales `DISCORD_APPLICATION_ID`, `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`; placeholder `"unconfigured"` si faltan (:16-23) para que la ruta se registre igual. `onCommand` (discord.ts:35) aplica allowlist `MORA_DISCORD_DOCTOR_IDS` dos veces (canal + tools vía `access.ts`), falla cerrado.
- Rutas: `POST /mora/eve/v1/discord` (`docs/eve-runbook.md:14`); eve deriva el path del prefijo público. `vercel.json:20,37`: servicios Vercel `eve-eva` (prefijo `/eva`) y `eve-mora` (prefijo `/mora`) con `node_modules/eve/bin/eve.js build` y `EVE_PUBLIC_ROUTE_PREFIX`. `npx eve info --agent <name>` para diagnóstico. Discord apunta directo su Interactions Endpoint URL (no hay route.ts propio en app/).
- Tool: `agents/mora/agent/tools/find-patient.ts` — `defineTool({ description, inputSchema (zod), async execute(input, ctx) })`; devuelve `{ success, resolved?, candidates?, message }`; auth dentro de la tool vía `authorizeAndResolvePatient` (`../access`).
- Skills: `agents/*/agent/skills/*.md` — eve escanea `agent/skills/` y las expone vía tool `load_skill` (node_modules/eve/docs/skills.mdx:6-10).
- Diferencia: eva = canal WhatsApp (pacientes) + trusted-contact-context + 10 tools; mora = canal Discord (doctores) + `access.ts` + 4 tools. Clara se modela como mora.

## 3. Framework eve

- `package.json:35` — `eve ^0.52.2`. Docs: `node_modules/eve/docs/` (`channels/discord.mdx`, `agent-config.md`, `reference/cli.md`).
- `channels/discord.mdx:40,53` — ruta default `POST /eve/v1/discord` (con prefijo: `/clara/eve/v1/discord`); credenciales por objeto `credentials` o env `DISCORD_*`; ACK inmediato + trabajo en background (deadline 3s).
- `eve build` compila a output Vercel; falla si un canal no tiene rutas. Requerirá servicio Vercel nuevo (`eve-clara`, prefijo `/clara`) en `vercel.json`.

## 4. Guardrails de dominio para `instructions.md` (AGENTS.md / project.md / draft-llm.ts:63-79 / draft.ts:29-56)

- No diagnosticar; no recetar ni mencionar medicamentos/recetas/antibióticos/dolor intenso.
- No inventar horarios/disponibilidad; Clara de follow-up ni siquiera agenda.
- No precios/costos/descuentos definitivos; invitar a valoración.
- Escalar a humano: dolor fuerte, urgencia, infección, alergia, solicitud de medicamento/receta, intención ambigua.
- Clara redacta, no envía; el envío requiere aprobación humana (ciclo drafts existente).
- Tono: español de México, un párrafo, 240–360 caracteres (límite 600), sin presión comercial.

## 5. Riesgos / decisiones abiertas para proposal

1. **Server vs agent**: módulos follow-up son server-only (`getSupabaseAdmin`); las tools de Clara corren en el servicio Vercel `eve-clara` — verificar que puedan importar la capa de datos o qué acceso Supabase necesita el servicio nuevo.
2. **Alcance de herramientas**: Clara lista/redacta/marca contactado/descarta; el envío sigue siendo humano (WCC/orquestador).
3. **Allowlist**: `CLARA_DISCORD_*_IDS` para staff/admin, falla cerrada como Mora.
4. **Env vars**: repetir `WHATSAPP_AGENT_LLM_*` + `CLARA_DRAFTING_ENABLED` en el servicio nuevo; el kill switch existente cubre solo la redacción LLM.
5. **Conflicto de identidad**: `docs/eve-runbook.md:28` dice "Clara y Nora NO son agentes de WhatsApp" — actualizar el runbook.
6. **Idempotencia**: reutilizar `buildDraftDedupKey` (drafts.ts:44) y el ciclo `draft→approved` existente; no crear un path paralelo.
