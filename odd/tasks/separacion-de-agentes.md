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
2. **SDD proposal** — `openspec/changes/<cambio>/proposal.md`. Estado: pendiente.
3. **SDD design** — topología resuelta con evidencia del spike. Estado: pendiente.
4. **SDD spec delta + tasks** — mora-agent actualizada. Estado: pendiente.
5. **Implementar Fase 1** — extraer Mora (TDD). Estado: pendiente.
6. **Verificación** — `npm run test:local`, `npx tsc --noEmit`, `npm run build`. Estado: pendiente.
7. **Cierre** — commits por unidad, task file actualizado. Estado: pendiente.

## Evidencia

(se llena por fase: commits, reviews, resultados de verificación)
