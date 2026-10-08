# Proposal: Promote Mora to Independent Root Agent with Discord Channel (issue #159, Fase 2)

**Issue**: [#159 — Fase 2: Promover Mora a agente raíz independiente + canal Discord](https://github.com/proyecto-polaris-ia/medica-app/issues/159)
**Épico**: [#140 — Separación de agentes](https://github.com/proyecto-polaris-ia/medica-app/issues/140) · **Fase anterior**: #158 (fusionada, PR #166) · **Bloquea**: #160 (Fase 3)

## Why

Mora vive hoy como subagente de Eva (`agents/eva/agent/subagents/mora/`). Los
subagentes de Eve no pueden declarar canales propios, así que la única forma
de alcanzar a Mora es que un paciente pregunte saldos por WhatsApp y Eva
delegue. Los **doctores** necesitan hablar directamente con Mora para temas de
cobranza sin pasar por Eva ni por el teléfono del paciente.

Eve soporta agentes raíz independientes en un workspace (`agents/<name>/agent/`)
y cada uno puede declarar su propio canal. Promover a Mora a agente raíz con
canal Discord propio separa la superficie operativa de cobranza (doctores, por
Discord) de la conversacional de citas (pacientes, por WhatsApp).

### Decisión de producto (2026-12, con el usuario)

1. **Identidad del paciente**: el doctor nombra al paciente (nombre o teléfono)
   y Mora lo resuelve contra la tabla `patients`. Las 3 tools dejan de derivar
   identidad del WhatsApp verificado del remitente.
2. **Autorización del doctor**: allowlist por variable de entorno
   (`MORA_DISCORD_DOCTOR_IDS`, Discord user IDs). Una tabla de staff en
   Supabase gestionable desde el panel queda **fuera de alcance** para una
   fase posterior.

Con esto, el guardrail "solo datos del propio paciente verificado por
WhatsApp" se transforma en "solo doctores autorizados"; el resto de guardrails
de cobranza (montos solo de BD, no negociar montos, no links de pago, no mover
dinero, no precios nuevos) se conservan intactos.

## What Changes

### 1. Mora como agente raíz (`agents/mora/agent/`)

- Mover con `git mv` el contenido de `agents/eva/agent/subagents/mora/` a
  `agents/mora/agent/`: `agent.ts`, `instructions.md`, `tools/` (3 tools),
  `skills/payment-collection.md`.
- Crear `agents/mora/agent/model.ts` (mismo patrón `createDynamicModel()` de
  Eva). Sin `package.json`: Eve nombra al agente raíz por su directorio
  (`agents/eva` no tiene uno).
- `agent.ts` pierde `description` de delegación; conserva `defineAgent` con
  modelo dinámico y `limits.sessionTimeoutMs`.
- Eliminar `identity.ts` (el binding de delegación ya no aplica; la sesión
  raíz conserva el auth del canal).

### 2. Herramientas de cobranza orientadas a doctor

- Nueva tool `find-patient`: búsqueda de pacientes por nombre o teléfono para
  desambiguar antes de operar.
- `get-patient-balance`, `list-overdue-balances` y `register-payment-intent`
  aceptan identificación del paciente (`patientPhone` o `patientName`) y
  requieren doctor autorizado en `ctx.session.auth` (principal Discord).
- `register-payment-intent` escribe `intent_source: 'discord'`; migración
  idempotente que extiende el enum `payment_intent_source` con `discord`.
- La escalación usa el teléfono del **paciente** resuelto, no el del remitente.

### 3. Canal Discord propio de Mora

- `agents/mora/agent/channels/discord.ts` con `discordChannel()` de
  `eve/channels/discord`, credenciales por env (`DISCORD_APPLICATION_ID`,
  `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`) con degradación graceful igual que
  el canal de WhatsApp (placeholders en builds sin credenciales).
- `onCommand` valida el Discord user ID contra `MORA_DISCORD_DOCTOR_IDS` y
  entrega el principal `authenticator: "discord"`; usuarios no autorizados no
  despachan sesión.
- Ruta: `POST /mora/eve/v1/discord`.

### 4. Limpieza de Eva

- Quitar la sección "Delegación a Mora" y las referencias de routing a
  `subagents/` de `agents/eva/agent/instructions.md`. Ante intención de
  cobranza de un paciente por WhatsApp, Eva (transicional, hasta Fase 3) lo
  canaliza con `escalate-to-human`: ya no tiene tools de saldo ni delegación.
- Eliminar `agents/eva/agent/hooks/delegation-identity.ts` y su test (muertos
  con el subagente). `src/lib/agent/delegation-bindings.ts` y su tabla
  `agent_delegation_bindings` **se conservan** (limpieza del sistema de
  delegación pertenece a Fase 3, issue #160) con exclusión temporal en knip.

### 5. Despliegue

- Servicio Vercel `eve-mora` en `vercel.json` (patrón de `eve-eva`):
  `EVE_PUBLIC_ROUTE_PREFIX='/mora'`, routes `^/mora/eve/v1/(.*)$` y rewrite
  `/mora/eve/v1/(.*)` → `eve-mora` antes del catch-all.
- Docs de setup manual de Discord (app, bot, slash command, Interactions
  Endpoint URL, instalación en el servidor del consultorio) y actualización de
  runbook.

## Capabilities Affected

- `mora-agent` — MODIFIED: identidad (doctor autorizado en Discord nombra al
  paciente), superficie (agente raíz + canal Discord), routing de intención de
  pago por WhatsApp retirado de Eva (transicional a escalación humana).
- `eve-framework` — unaffected behaviorally; segundo servicio Vercel es
  configuración.

## Out of Scope

- Tabla de staff autorizado en Supabase y su UI (fase posterior).
- Crons de cobranza de Mora (`send-payment-reminder` como schedule del agente).
- Limpieza del sistema de delegación (hooks restantes, bindings, tabla):
  Fase 3, issue #160.
- Clara y Nora como agentes.
- Envío automático o bulk; pasarelas de pago; links de pago (permanente).

## Rollback Plan

Cambio reversible por git: revert del PR elimina `agents/mora/`, restaura el
subagente de Eva y el rewrite `/mora/*`. La migración del enum agrega un valor
(`discord`) que es aditivo y seguro de conservar tras un revert. El servicio
`eve-mora` sin tráfico no afecta a `eve-eva` ni al catch-all `web`.

## Reconciliación con la spec vigente

`openspec/specs/mora-agent/spec.md` se actualiza por delta: el requisito
`Verified Contact Before Balance Disclosure` se sustituye por autorización de
doctor + resolución de paciente nombrado; los escenarios de `Balance Inquiry`
dejan de depender de remitente WhatsApp; `Collections Intent Routing` (delegación
desde Eva) se retira y se reemplaza por el comportamiento transicional de Eva.
