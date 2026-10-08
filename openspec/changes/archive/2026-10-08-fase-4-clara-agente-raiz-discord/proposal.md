# Proposal: Crear a Clara como agente raíz independiente con canal Discord (issue #161, Fase 4)

**Issue**: [#161 — Fase 4: Crear Clara como agente raíz + canal Discord](https://github.com/proyecto-polaris-ia/medica-app/issues/161)
**Épico**: [#140 — Separación de agentes](https://github.com/proyecto-polaris-ia/medica-app/issues/140)
**Fases previas**: #158 (Fase 1 — workspace reestructurado, cerrada) ·
#159 (Fase 2 — Mora raíz + Discord, fusionada) · #160 (Fase 3 — eliminación de la
delegación Eva→Mora, cerrada) · **Bloquea**: nada

## Why

Hoy Clara es una **capacidad server-side** interna: la lógica de seguimiento vive
en `src/lib/admin/follow-up/` (reglas, deduplicación, lista diaria, borradores) y
la redacción con LLM en `src/lib/admin/follow-up/draft-llm.ts`, pero la única
forma de operarla es el panel admin
(`app/(admin)/follow-up/`) y la pestaña de borradores del
whatsapp-command-center. La secretaria depende de abrir el panel para cada paso.

El épico #140 define una topología multi-agente donde cada superficie operativa
tiene su propio agente raíz. Las Fases 1–3 dejaron ese patrón probado: Eva es el
agente raíz de WhatsApp, Mora es el agente raíz de cobranza con canal Discord
propio (`agents/mora/agent/`), y el sistema de delegación Eva→Mora ya se retiró.
Clara es la pieza que falta para que los **doctores y el staff** revisen el
seguimiento de pacientes conversando, sin abrir el panel.

Este cambio convierte a Clara en un **agente raíz independiente con canal Discord
propio** que **expone la lógica existente como tools conversacionales**, en lugar
de reimplementarla. Es la Fase 4 del épico y la continuidad directa del trabajo
de Fase 2 (`2026-10-08-fase-2-mora-agente-raiz-discord`), que ya estableció el
patrón de agente raíz, canal Discord, allowlist fail-closed y servicio Vercel
dedicado.

**Decisión de arquitectura clave (del issue, no negociable en este proposal):**
la lógica server-side de `src/lib/admin/follow-up/` **NO se mueve**; Clara la
importa. El agente agrega una superficie conversacional sobre código ya probado,
no un segundo camino de datos.

## What Changes

### 1. Clara como agente raíz (`agents/clara/agent/`)

- Crear `agents/clara/agent/agent.ts` con `defineAgent({ model:
  createDynamicModel(), limits: { sessionTimeoutMs: 1800000 } })`, el mismo
  patrón de `agents/eva/agent/agent.ts` y `agents/mora/agent/agent.ts`.
- Crear `agents/clara/agent/model.ts` con `createDynamicModel()` (provider
  OpenAI-compatible, env `WHATSAPP_AGENT_LLM_MODEL` / `WHATSAPP_AGENT_LLM_API_KEY`
  / `WHATSAPP_AGENT_LLM_BASE_URL`, header `x-opencode-session`).
- Crear `agents/clara/agent/instructions.md` con personalidad, tono (español de
  México) y los guardrails de dominio: no diagnosticar, no recetar, no precios
  definitivos, no disponibilidad inventada, escalar a humano ante dolor fuerte,
  urgencia, infección, alergia o solicitud de medicamento. Clara redacta y
  prepara, **no envía**.
- Sin `package.json`: Eve nombra al agente raíz por su directorio
  (`agents/mora` tampoco lo tiene).

### 2. Tools de Clara que envuelven la lógica existente

Las tools se definen en `agents/clara/agent/tools/` con `defineTool` (schema zod
+ `execute`), siguiendo `agents/mora/agent/tools/find-patient.ts`. **No mueven ni
duplican** los módulos de `src/lib/admin/follow-up/`; los importan. Mapeo
preliminar (a confirmar en spec/design — ver "Decisiones pendientes"):

- `list-follow-up-cases` → envuelve `listDailyFollowUpCases`
  (`src/lib/admin/follow-up/follow-up.ts:190`). Solo lectura.
- `get-follow-up-rules` → expone las constantes y reglas de segmentación
  (`src/lib/admin/follow-up/config.ts:8-23`, `rules.ts`). Solo lectura; explica
  por qué un paciente está en la lista.
- `draft-follow-up-message` → envuelve `generateFollowUpDraftText`
  (`draft-llm.ts:172`) y persiste con `createFollowUpDraft`
  (`drafts.ts:126`), conservando `validateFollowUpDraftText` (`draft.ts:101`)
  como guardrail y la plantilla determinista como fallback.
- `mark-contact-attempted` → acción determinista de escritura; persiste el estado
  de contacto del caso (el issue la asocia a `drafts.ts`; en el código el estado
  de contacto vive en `markFollowUpContact`, `follow-up.ts:290`, sobre
  `follow_up_contacts`). Requiere autorización.
- `dismiss-follow-up` → descarta el caso de seguimiento (estado descartado de la
  ronda), acción determinista de escritura con autorización.

**Nunca se expone como tool** `claimFollowUpDraftForSend`,
`markFollowUpDraftSent`, `markFollowUpDraftSentFailed` ni
`src/lib/follow-up/send-follow-up-draft.ts`: el envío sigue siendo humano por el
transporte de WhatsApp existente (WCC).

### 3. Skills de Clara (`agents/clara/agent/skills/`)

- `follow-up-workflow.md` — flujo paso a paso de revisión de la lista diaria.
- `drafting-guidelines.md` — tono, estructura, longitud (240–360 caracteres,
  límite 600) y restricciones de los borradores.

Eve escanea `agent/skills/` y las expone vía la tool `load_skill`.

### 4. Canal Discord propio de Clara

- Crear `agents/clara/agent/channels/discord.ts` con `discordChannel({ credentials
  })`, credenciales por env (`DISCORD_APPLICATION_ID`, `DISCORD_BOT_TOKEN`,
  `DISCORD_PUBLIC_KEY`) con degradación graceful (placeholder `"unconfigured"`
  cuando faltan, para que la ruta se registre igual y `eve build` no falle).
- `onCommand` valida el Discord user ID contra una allowlist por variable de
  entorno (`CLARA_DISCORD_*_IDS`) y entrega el principal `authenticator:
  "discord"`; usuarios no autorizados no abren sesión. La misma autorización se
  re-verifica dentro de cada tool (defensa en profundidad, patrón
  `agents/mora/agent/access.ts`). **Falla cerrado** sin allowlist.
- Ruta del canal: `POST /clara/eve/v1/discord` (prefijo del workspace + path
  default de Eve).
- La app de Discord es **propia de Clara** (aplicación, bot, token, public key y
  slash command `/clara` independientes de Mora); se instala en el servidor del
  consultorio. El setup es manual y se documenta en
  `docs/clara-discord-setup.md` (patrón de `docs/mora-discord-setup.md`).

### 5. Despliegue

- Servicio Vercel `eve-clara` en `vercel.json`, con el patrón exacto de
  `eve-eva` / `eve-mora`: `root: ".eve/vercel-services/eve-clara"`,
  `buildCommand` con `node_modules/eve/bin/eve.js build`,
  `EVE_PUBLIC_ROUTE_PREFIX='/clara'`, route `^/clara/eve/v1/(.*)$` y rewrite
  `/clara/eve/v1/(.*)` → `eve-clara` **antes** del catch-all `web`.
- Variables de entorno del servicio nuevo: repetir `WHATSAPP_AGENT_LLM_*` y
  `CLARA_DRAFTING_ENABLED`; agregar las credenciales `DISCORD_*` de la app de
  Clara y `CLARA_DISCORD_*_IDS` (ver decisiones pendientes).

### 6. Reconciliación de documentación

- `docs/eve-runbook.md:28` afirma "Clara y Nora NO son agentes de WhatsApp: son
  capacidades admin/jobs". Tras este cambio, Clara **tampoco** es un agente de
  WhatsApp, pero **sí** es un agente raíz con canal Discord: la frase debe
  corregirse para distinguir "no es agente de WhatsApp" de "no es agente".
- `architecture.md` §3.2 ("Agentes raíz") lista hoy a Eva y Mora; debe agregar a
  Clara con su ruta `/clara/eve/v1/discord` y su servicio `eve-clara`.

## Capabilities

### NEW Capability: `clara-agent`

Agente raíz independiente de Clara (issue #161): `agents/clara/agent/` con
`agent.ts`, `model.ts`, `instructions.md`, `skills/` y canal Discord propio con
allowlist de staff/doctores fail-closed. Es la superficie conversacional del
seguimiento de pacientes; no atiende WhatsApp y no envía mensajes. Spec nueva en
`openspec/changes/fase-4-clara-agente-raiz-discord/specs/clara-agent/spec.md`.

### NEW Capability: `clara-discord-channel`

Canal `discordChannel()` de Clara (ruta `POST /clara/eve/v1/discord`, slash
command `/clara`, credenciales `DISCORD_*` con degradación graceful,
autorización por `CLARA_DISCORD_*_IDS` aplicada en `onCommand` y re-verificada en
cada tool). Puede consolidarse como requirement dentro de `clara-agent` en la
fase spec; se lista aparte por simetría con el issue #161.

### NEW Capability: `clara-follow-up-tools`

Conjunto de tools conversacionales que envuelven la lógica existente de
`src/lib/admin/follow-up/` (lista, reglas, borrador, marcar contactado,
descartar) como acciones deterministas con autorización. Las reglas,
deduplicación y prioridad **no** se reimplementan: se importan. Las tools de
envío (`claimFollowUpDraftForSend`, `markFollowUpDraftSent`,
`send-follow-up-draft.ts`) quedan explícitamente fuera.

### MODIFIED Capability: `clara-drafting`

Pasa de capacidad **interna/admin sin canal** a capacidad operada
conversacionalmente por el agente raíz. Se conservan todos los invariantes
(redacción bajo demanda por paciente, fallback determinista obligatorio,
guardrails, `draft → approved/rejected → sent/sent_failed`, aprobación humana
explícita, kill switch `CLARA_DRAFTING_ENABLED`, **nunca envía**). Delta
esperado: el requirement `Sin canal propio ni capacidad de envío` debe precisar
que la prohibición es de **canal de WhatsApp y de capacidad de envío**, no de
superficie conversacional; el canal Discord de staff es una superficie de
consulta/redacción, no un canal paciente-facing. El resto de requirements
(`Redacción de borrador bajo demanda`, `Fallback determinista`,
`Aislamiento de las reglas`, `Texto asesor sin alterar el orden`,
`Edición humana con auditoría`, `Degradación por kill switch`) se conserva.

### UNCHANGED Capability: `follow-up`

Las reglas de segmentación, la deduplicación por paciente, la prioridad de
motivos, el orden canónico y los umbrales **no cambian**. Posible delta menor a
confirmar en spec: la definición de "usuario autorizado" para marcar
contactado/descartar se amplía al principal de Discord autorizado además de la
sesión admin (hoy los requirements hablan de "usuario autenticado" del panel).

### UNCHANGED Capability: `eve-framework`

Sin cambio de comportamiento; un tercer servicio Vercel (`eve-clara`) es
configuración de despliegue.

## Impact

| Área | Impacto | Descripción |
|---|---|---|
| `agents/clara/agent/` | New | `agent.ts`, `model.ts`, `instructions.md`, `tools/`, `skills/`, `channels/discord.ts`, `access.ts`. |
| `vercel.json` | Modified | Servicio `eve-clara` (prefijo `/clara`) + rewrite antes del catch-all. Configuración aditiva. |
| `docs/eve-runbook.md` | Modified | Corregir `:28` ("Clara y Nora NO son agentes de WhatsApp" → Clara es agente raíz con canal Discord); agregar ruta/ping de Clara a la topología. |
| `architecture.md` | Modified | §3.2 "Agentes raíz": agregar a Clara con `/clara/eve/v1/discord` y servicio `eve-clara`. |
| `docs/clara-discord-setup.md` | New | Setup manual de la app de Discord de Clara (patrón de `docs/mora-discord-setup.md`). |
| `src/lib/admin/follow-up/*` | Reused (invariante) | `config.ts`, `rules.ts`, `follow-up.ts`, `types.ts`, `draft.ts`, `drafts.ts`, `draft-llm.ts`, `drafting-flag.ts` se importan tal cual. **No se mueven ni se duplican.** |
| `src/lib/follow-up/send-follow-up-draft.ts` | Untouched (invariante) | Nunca expuesto como tool; el envío sigue siendo humano por WCC. |
| `agents/eva/agent/` | Sin cambios | Eva sigue siendo el único agente de WhatsApp. Sin cambios funcionales. |
| `agents/mora/agent/` | Sin cambios | Mora sigue igual. Sin cambios funcionales. |
| `openspec/specs/clara-agent/spec.md` | New | Spec del agente raíz + canal + tools. |
| `openspec/specs/clara-drafting/spec.md` | Modified (delta) | Reconciliación de "sin canal propio" y de la superficie conversacional. |
| `openspec/specs/follow-up/spec.md` | Posible delta | Confirmar en spec si cambia la definición del actor autorizado. Reglas y segmentos invariantes. |
| Discord Developer Portal | Manual | Nueva aplicación/bot para Clara (no código). |
| `travelhub-app` | Sin cambios | Regla crítica del repo: copiar + adaptar, nunca editar. |

### Riesgos

- **Doble autorización inconsistente.** Mitigación: allowlist aplicada en
  `onCommand` y re-verificada en cada tool, fail-closed, igual que Mora.
- **Tools de escritura ejecutadas sin intención humana clara.** Mitigación: las
  acciones de escritura son deterministas y requieren principal autorizado;
  nunca se exponen las de envío.
- **El agente como canal de envío encubierto.** Mitigación: `send-follow-up-draft`
  queda fuera del set de tools y el ciclo `draft → approved` no se relaja.
- **Acceso a Supabase del servicio nuevo.** Los módulos de follow-up son
  server-only (`getSupabaseAdmin()`); el servicio `eve-clara` debe correr con
  service role como `eve-eva`/`eve-mora`. Verificar en design.
- **Deriva de alcance hacia reglas.** Mitigación: consumo de solo lectura; las
  reglas quedan cubiertas por sus pruebas actuales.
- **Deriva de prompt.** El LLM no decide la lista, no marca casos y no envía;
  solo interpreta y redacta sobre la salida determinista.

## Rollback Plan

El cambio es **aditivo** y sin migraciones de base de datos:

1. **Reversión por configuración (minutos).** Remover el servicio `eve-clara` de
   `vercel.json` y el rewrite `/clara/eve/v1/(.*)` restaura el estado previo. Sin
   tráfico en `eve-clara`, `eve-eva` (WhatsApp), `eve-mora` y el catch-all `web`
   no se afectan.
2. **Reversión por git.** Revertir el PR elimina `agents/clara/` y las entradas de
   `vercel.json`. La capacidad server-side de Clara (`src/lib/admin/follow-up/`,
   `src/lib/follow-up/`) queda intacta porque **nunca se movió**: el panel admin
   y WCC siguen operando exactamente igual.
3. **Kill switch.** `CLARA_DRAFTING_ENABLED` (ya existente,
   `drafting-flag.ts:18`) desactiva el camino LLM y fuerza la plantilla
   determinista. Apagarlo no modifica ningún dato existente. Si hiciera falta
   desactivar toda la superficie conversacional, basta dejar la allowlist
   `CLARA_DISCORD_*_IDS` vacía (falla cerrado) o desinstalar el bot.
4. **Sin migraciones nuevas que revertir.** Este cambio no agrega tablas,
   columnas ni enums; no hay datos que restaurar.

## Decisiones explícitas pendientes de diseño

Estas decisiones **NO** se resuelven en el proposal; quedan marcadas para
spec/design (tarea 6 del issue: "el mapeo exacto de tools se define durante la
investigación").

1. **Allowlist `CLARA_DISCORD_*_IDS`.** Nombre exacto de la variable
   (`CLARA_DISCORD_*_IDS` como placeholder) y audiencia: ¿staff administrativo,
   doctores, o ambos? ¿Una sola allowlist o separada por tipo de acción?
   Confirmar que falla cerrado sin variable (patrón `MORA_DISCORD_DOCTOR_IDS`).
2. **Tools de escritura como acciones deterministas con auth fail-closed.**
   Confirmar cuáles tools exponen escritura (`mark-contact-attempted`,
   `dismiss-follow-up`, `draft-follow-up-message`) y que la autorización se
   re-verifica dentro de cada tool, nunca desde texto del modelo. Confirmar que
   `claimFollowUpDraftForSend`, `markFollowUpDraftSent` y
   `markFollowUpDraftSentFailed` **no** se exponen.
3. **Mapeo exacto del set de tools.** `get-follow-up-rules` como tool separada o
   como conocimiento de `skills/`; si `list-follow-up-cases` incluye los
   borradores existentes de la ronda o requiere una tool de lectura adicional.
4. **Resolución del desajuste de nombres del issue.** El issue asocia
   `mark-contact-attempted.ts` a `drafts.ts`, pero el estado de contacto vive en
   `markFollowUpContact` (`follow-up.ts:290`, tabla `follow_up_contacts`), no en
   `drafts.ts` (`follow_up_message_drafts`). Definir la fuente correcta en spec.
5. **Env vars del servicio nuevo.** Lista definitiva y alcance de cada una:
   repetición de `WHATSAPP_AGENT_LLM_*`, `CLARA_DRAFTING_ENABLED`, credenciales
   `DISCORD_*` de Clara y `CLARA_DISCORD_*_IDS`. Decidir si el kill switch cubre
   solo la redacción LLM (como hoy) o también la superficie conversacional.
6. **Acceso a Supabase del servicio `eve-clara`.** Confirmar que el servicio
   puede importar los módulos server-only de follow-up y con qué credenciales
   (service role), replicando `eve-eva`/`eve-mora`.
7. **App de Discord de Clara.** Confirmar que es una aplicación nueva e
   independiente de la de Mora (bot/token/public key propios) y documentar el
   setup manual.
8. **Definición del actor autorizado en `follow-up`.** Decidir si la spec
   `follow-up` necesita un delta para reconocer el principal de Discord
   autorizado como actor válido de marcar contactado/descartar, o si eso queda
   contenido en `clara-agent`.

## Non-goals

- **Clara NO envía WhatsApps.** El envío sigue siendo humano vía el
  whatsapp-command-center y el transporte existente
  (`src/lib/follow-up/send-follow-up-draft.ts`), solo tras aprobación explícita.
  Ninguna tool de Clara expone el envío.
- **Clara NO diagnostica ni receta.** Sin consejo clínico, sin medicamentos, sin
  términos clínicos en los textos.
- **Clara NO agenda citas.** No reemplaza al motor de reserva ni al wizard
  `/appointments/new`. A lo sumo puede enlazar/derivar como lo hace el panel.
- **NO se crea cron de lista diaria todavía.** El issue lo deja explícito ("Los
  crons para generar lista diaria se agregan cuando se defina la
  funcionalidad"). La lista sigue bajo demanda.
- **NO se cambian las reglas de segmentación, deduplicación, prioridad ni
  umbrales** de `src/lib/admin/follow-up/`.
- **NO hay cambios funcionales en Eva ni en Mora.** Eva sigue siendo el único
  agente de WhatsApp; Mora conserva su canal Discord y sus tools.
- **NO se crea una tabla de staff autorizado en Supabase ni UI de gestión**
  (fase posterior); la autorización es por variable de entorno.
- **NO se toca `travelhub-app`** (regla crítica del repo).
- **NO se crean pasarelas de pago, links de pago ni cobros** (permanente, ya
  fuera de alcance desde Fase 2).

## Criterios de aceptación (issue #161)

- [ ] `agents/clara/agent/` existe con `agent.ts`, `instructions.md`, `tools/` y
      `skills/`.
- [ ] `eve info` reporta **3 agentes raíz** (eva, mora, clara).
- [ ] Clara tiene canal Discord funcional (`POST /clara/eve/v1/discord`).
- [ ] Un doctor puede usar `/clara` en Discord y obtener respuesta.
- [ ] Clara puede listar casos de seguimiento.
- [ ] Clara puede redactar un borrador de mensaje.
- [ ] Eva y Mora siguen funcionando sin cambios.

### Criterios de éxito adicionales (derivados de la exploración)

- [ ] `eve build` pasa con los 3 agentes raíz.
- [ ] La lógica de `src/lib/admin/follow-up/` no se movió ni se duplicó; Clara la
      importa.
- [ ] Toda tool de escritura se autoriza fail-closed y ninguna tool expone el
      envío de WhatsApp.
- [ ] Sin allowlist configurada, el canal de Clara falla cerrado.
- [ ] `npm run test`, `npx tsc --noEmit` y `npm run build` en verde.
