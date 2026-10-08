# Verify Report: fase-2-mora-agente-raiz-discord

**Fecha**: 2026-12 · **Issue**: #159 · **Rama**: `eliumontoya/fase-2-promover-mora-agente-raiz-discord`

## Resultado: PASS WITH WARNINGS

## Comandos de verificación (ejecutados por el orquestador)

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errores |
| `npm run test` (unit, excl. e2e) | ✅ 142 archivos / 1356 tests (tras rebase sobre `origin/main`) |
| `supabase start` + `supabase db reset` + `npm run test:local` | ✅ 163 archivos / 1555 tests |
| `eve build` (agents/mora y agents/eva, `EVE_PUBLIC_ROUTE_PREFIX` correspondiente) | ✅ ambos; la salida de mora registra `eve/v1/discord` |
| `npx eve info --agent mora` / `--agent eva` | ✅ 2 agentes raíz (eva: 21 tools, 3 skills, 0 subagentes; mora: 15 tools, 1 skill, 0 diagnósticos) |
| `npm run build` (Next) | ✅ |
| Migración `20261201000000_payment_intent_source_discord.sql` aplicada | ✅ `enum_range(payment_intent_source) = {whatsapp,manual,discord}` |
| `npx knip` | ✅ sin hallazgos (sin exclusión temporal necesaria) |
| `npx eslint agents/mora tests/agent/mora` | ✅ 0 errores (lint general del repo no es parte de la verificación, épico §9) |

## Verificación independiente (agente read-only `gentle-ai-verify`)

- Artefactos presentes y consistentes: `agents/mora/agent/` completo (4 tools,
  canal Discord, skill, `access.ts`), `subagents/` y hook de delegación
  eliminados, servicio `eve-mora` + rewrites en `vercel.json`,
  `docs/mora-discord-setup.md`, migración idempotente. **PASS**.
- Guardrails: `resolveDoctorAccess` fail-closed (allowlist ausente/vacía,
  principal no-Discord, id fuera de lista); las 4 tools llaman
  `authorizeAndResolvePatient` primero; `register-payment-intent` escribe
  `source: 'discord'` y escala con el teléfono del paciente. **PASS**.
- Eva: sin mención de delegación a Mora; intenciones de cobranza →
  `escalate-to-human`. **PASS**.
- `travelhub-app` sin cambios; canal WhatsApp de Eva sin cambios en esta rama.
  **PASS**.
- Delta spec vs implementación: consistente en lo verificable estáticamente.
  **PASS**.

## Warnings (no bloqueantes)

1. **E2E Discord real pendiente (manual, post-deploy)**: requiere crear la app
   de Discord, registrar el slash command y configurar credenciales en Vercel
   (`docs/mora-discord-setup.md`). El issue lo lista como tarea 6; es fuera del
   alcance del repo.
2. **Deuda anotada para Fase 3 (#160)**: `src/lib/agent/delegation-bindings.ts`
   + tabla `agent_delegation_bindings` quedan sin consumidores (knip no los
   marca porque sus tests los referencian).
3. **Rebase sobre `origin/main`** (PR #185–#189 se fusionaron durante el
   desarrollo); suites re-ejecutadas en verde tras el rebase.
