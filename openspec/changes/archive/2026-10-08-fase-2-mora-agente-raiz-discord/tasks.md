# Tasks: fase-2-mora-agente-raiz-discord

Fases agrupadas por verificación. Cada tarea es completable en una sesión.

## 1. Estructura de agente raíz Mora

- [x] 1.1 `git mv` de `agents/eva/agent/subagents/mora/{agent.ts,instructions.md,tools/,skills/}` a `agents/mora/agent/`; eliminar `identity.ts`; copiar patrón `model.ts` de Eva a `agents/mora/agent/model.ts`.
- [x] 1.2 Adaptar `agents/mora/agent/agent.ts`: quitar `description` de delegación, mantener `defineAgent` + modelo dinámico + límites; corregir imports relativos (`../../model` → `./model`).
- [x] 1.3 Migración `payment_intent_source` + valor `discord` (idempotente).

## 2. Herramientas orientadas a doctor (test-first)

- [x] 2.1 RED: tests de `access.ts` — doctor autorizado, no autorizado, allowlist vacía/ausente, principal no-Discord.
- [x] 2.2 GREEN: `agents/mora/agent/access.ts` (`resolveDoctorAccess`, `resolvePatient` con E.164/nombre/ambigüedad/sin match).
- [x] 2.3 Nueva tool `find-patient` + tests (match único, ambiguo, sin match, no revela financieros). `tests/agent/mora/tools/find-patient.test.ts` (4 tests).
- [x] 2.4 Adaptar `get-patient-balance`, `list-overdue-balances`, `register-payment-intent`: input `patientPhone`/`patientName`, primer paso doctor+paciente, negativas reescritas, `source: 'discord'`, escalación con teléfono del paciente. Tests actualizados en GREEN.
- [x] 2.5 Reescribir `instructions.md` y `skills/payment-collection.md`: Mora independiente, habla con doctores por Discord, guardrails de cobranza intactos, flujo find-patient → tool.

## 3. Canal Discord

- [x] 3.1 `agents/mora/agent/channels/discord.ts`: `discordChannel()` con credenciales env + placeholders, `onCommand` con allowlist (fail-closed), events por default. Test unitario de `onCommand` (autorizado/no autorizado/sin allowlist).

## 4. Limpieza de Eva

- [x] 4.1 Quitar de `agents/eva/agent/instructions.md` la sección "Delegación a Mora" y routing a subagente; añadir regla transicional de escalación en intención de cobranza.
- [x] 4.2 Eliminar `agents/eva/agent/hooks/delegation-identity.ts` + su test; revisar si quedan hooks; ajustar `structure.test.ts` de Eva y tests de Mora a las nuevas rutas.
- [x] 4.3 knip: exclusión temporal de `src/lib/agent/delegation-bindings.ts` (comentario Fase 3 #160). *Nota: no hizo falta — `knip.json` sin cambios, knip no marca la lib porque sus tests propios la referencian; se elimina en Fase 3 (#160).*

## 5. Despliegue y docs

- [x] 5.1 `vercel.json`: servicio `eve-mora` (build `agents/mora`, prefix `/mora`) + routes/rewrite antes del catch-all.
- [x] 5.2 Docs: setup manual de Discord (app, bot, slash command, Interactions Endpoint `/mora/eve/v1/discord`, allowlist `MORA_DISCORD_DOCTOR_IDS`, envs de Vercel) + actualización de `docs/eve-runbook.md` y `architecture.md` §3.2.

## 6. Verificación

- [x] 6.1 `supabase start && supabase db reset` + `npm run test:local` en verde (incluye suites nuevas).
- [x] 6.2 `npx eve build` para eva y mora; `npx eve info` reporta 2 agentes raíz.
- [x] 6.3 `npx tsc --noEmit` y `npm run build` en verde.
- [x] 6.4 `verify-report.md`, archive del cambio SDD, push y PR (Closes #159).

## Pendiente manual post-deploy (fuera del repo)

- Crear app/bot en Discord Developer Portal; registrar slash command; configurar Interactions Endpoint URL; instalar bot en el servidor; configurar envs en Vercel; prueba E2E con un doctor real.
