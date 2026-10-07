# Separación de agentes: Eva, Mora, Clara y Nora (issue #140)

Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/140
Rama: `eliumontoya/separaci-n-de-agentes-eva-mora-clara-y-nora-topo`
Alcance acordado con el usuario: **Fase 0 (spike) + Fase 1 (extraer Mora)**. Fases 2–4 (Clara, Nora, panel) quedan para sesiones posteriores.

## Contexto

- Eva es el único agente ligado a WhatsApp (`agent/`, eve@^0.52.2, shim `agent/eve-shim.d.ts` sin API de subagentes).
- Mora hoy vive como 3 tools + skill `payment-collection.md` dentro de Eva (decisión del #67, Approach 1). Este issue revierte parcialmente esa decisión.
- Clara = lib determinista + panel (#89). Nora = base de métricas (#88). Ambas fuera de alcance aquí.
- Restricción dura: un solo binding de WhatsApp; los demás agentes por delegación/saliente/job/admin.
- Guardrails de cobranza innegociables: saldo solo desde BD, solo del propio paciente verificado, sin mover dinero, sin links de pago, sin negociar.

## Decisiones

### D1 — Topología (pendiente del spike)

A resolver en Fase 0 validando contra `node_modules/eve` (0.52.2):
- (A) mismo agente + tools (estado actual)
- (B) subagentes de Eva (`agent/subagents/`, `ctx.agent`)
- (C) agentes raíz en workspace (`agents/<name>/agent/`)
- (D) despliegues separados

Hipótesis por defecto del issue: Eva raíz + Mora subagente; outbound server-side (cron) nunca como tool del paciente.

## Tareas

1. **Spike eve@0.52.2** — validar subagentes, `ctx.agent`, `defineDynamic`, workspace multi-agente, shim y `moduleResolution`. Estado: **hecho 2026-10-06**.
   - `agent/subagents/<id>/agent.ts` confirmado: compilado y reportado por `eve info` ("Subagents 1 subagent", 0 diagnostics) con sonda `defineDynamic` + `session.started`.
   - Delegación real: NO es `ctx.agent(...)` como decía el issue; eve lowerea cada subagente a un tool del modelo con schema `{ message, agentId?, outputSchema? }`. El built-in `agent` es root-only; los subagentes no reciben canales ni schedules (root-only). Estado del hijo: fresh; park/resume por `agentId`.
   - `moduleResolution` ya es `bundler` (el issue decía "node" — desactualizado). Los tipos reales de `eve`, `eve/tools`, `eve/channels/chat-sdk`, `@chat-adapter/*` y `chat` resuelven sin shim.
   - El shim `agent/eve-shim.d.ts` sombra los tipos reales: es la causa del `@ts-expect-error` en `agent/agent.ts`. Sin shim, `tsc --noEmit` del repo pasa completo (única corrección: quitar el directive obsoleto).
   - `eve build` verde baseline; con sonda de subagente también verde.
   - Multi-agente raíz (`agents/<name>/agent/`): NO validado y NO necesario para la topología elegida (B).
   - **Decisión D1: Opción B** — Eva agente raíz ligado a WhatsApp; Mora subagente declarado en `agent/subagents/mora/`.
2. **SDD proposal** — `openspec/changes/separate-mora-agent/proposal.md`. Estado: **hecho** (commit efc68eb).
3. **SDD design** — topología B resuelta con evidencia del spike; identidad de delegación vía binding server-side. Estado: **hecho** (commit efc68eb).
4. **SDD spec delta + tasks** — `specs/mora-agent/spec.md` (2 ADDED, 2 MODIFIED) + tasks.md. Estado: **hecho** (commit efc68eb).
5. **Implementar Fase 1** — extraer Mora (TDD, delegado a gentle-ai-worker). Estado: **hecho** (implementación en working tree; verificación en curso).
   - Shim eliminado; `agent/model.ts` compartido; subagente `agent/subagents/mora/` (agent.ts + instructions + 3 tools movidas + skill movida).
   - Binding de identidad: migración `20261006080000_agent_delegation_bindings.sql` (RLS forzado, service-role only), `src/lib/agent/delegation-bindings.ts` (TTL 1h, resultados discriminados), hook raíz `agent/hooks/delegation-identity.ts` (subagent.called → binding; degradación segura).
   - `register-payment-intent` perdió inputs model-visible de teléfono (cierre de vía de identidad mediada por modelo).
   - Forma del evento `subagent.called` validada contra el runtime (`createSubagentCalledEvent` emite `name`/`toolName`/`childSessionId`).
6. **Verificación** — hecha en dos capas: worker (tsc, test, build, eve build/info) + gentle-ai-verify independiente (test:local secuencial 151 archivos / 1403 tests en verde, build, eve info `Subagents 1 subagent` 0 diagnostics, partición del manifiesto: raíz sin tools de cobranza, mora con exactamente 3 tools + skill y sin tools de agenda; RLS sin políticas públicas). Estado: **hecho**.
7. **Cierre** — commits por unidad de trabajo: `86b001d` (shim), `b272a8d` (binding identidad), `7d1f36f` (extracción Mora), docs de topología en commit posterior. Estado: **hecho** (pendiente push/PR: decisión del usuario).

## Notas de cierre
- Review nativo RDD completado en dos linajes por un commit de docs posterior al primero: (1) `review-4aee5be8a7b3eaaf` — approved, 3 hallazgos informativos (R3-001 WARNING `src/lib/agent/delegation-bindings.ts:72-90`; R3-002/R3-003 SUGGESTION en `agent/hooks/delegation-identity.ts:94-95` y `agent/subagents/mora/identity.ts:71-79`); (2) `review-eb703b7474556f44` — approved, 2 hallazgos informativos (R3-001 WARNING `src/lib/agent/delegation-bindings.ts:42-46`; R3-002 SUGGESTION `src/lib/agent/delegation-bindings.ts:78-94`). Ambos con authority quemada (`gentle-ai.review-acknowledged/v1`, revisiones `da542608…` y `fda850a3…`). Tratar los hallazgos como trabajo posterior, nunca reabrir estos reviews.
- `npm run test:local` en modo paralelo tiene fragilidad preexistente (lock de BD con hookTimeout 10s bajo carga del host); la forma secuencial (`--no-file-parallelism`) es la de referencia.
- Suposición runtime validada contra el código de eve 0.52.2: `createSubagentCalledEvent` emite `name`/`toolName`/`childSessionId` (coincide con el narrowing del hook).
- Pendiente fuera de alcance de Fase 0+1: validación end-to-end en vivo de una delegación real (requiere credenciales del modelo en `eve dev` o producción); Fases 2–4 del issue #140 (Clara, Nora, panel de agentes).

## Evidencia

(se llena por fase: commits, reviews, resultados de verificación)
