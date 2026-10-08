# Tasks: fase-2-mora-agente-raiz-discord

Fases agrupadas por verificación. Cada tarea es completable en una sesión.

## 1. Estructura de agente raíz Mora

- [ ] 1.1 `git mv` de `agents/eva/agent/subagents/mora/{agent.ts,instructions.md,tools/,skills/}` a `agents/mora/agent/`; eliminar `identity.ts`; copiar patrón `model.ts` de Eva a `agents/mora/agent/model.ts`.
- [ ] 1.2 Adaptar `agents/mora/agent/agent.ts`: quitar `description` de delegación, mantener `defineAgent` + modelo dinámico + límites; corregir imports relativos (`../../model` → `./model`).
- [ ] 1.3 Migración `payment_intent_source` + valor `discord` (idempotente).

## 2. Herramientas orientadas a doctor (test-first)

- [ ] 2.1 RED: tests de `access.ts` — doctor autorizado, no autorizado, allowlist vacía/ausente, principal no-Discord.
- [ ] 2.2 GREEN: `agents/mora/agent/access.ts` (`resolveDoctorAccess`, `resolvePatient` con E.164/nombre/ambigüedad/sin match).
- [ ] 2.3 Nueva tool `find-patient` + tests (match único, ambiguo, sin match, no revela financieros).
- [ ] 2.4 Adaptar `get-patient-balance`, `list-overdue-balances`, `register-payment-intent`: input `patientPhone`/`patientName`, primer paso doctor+paciente, negativas reescritas, `source: 'discord'`, escalación con teléfono del paciente. Tests actualizados en GREEN.
- [ ] 2.5 Reescribir `instructions.md` y `skills/payment-collection.md`: Mora independiente, habla con doctores por Discord, guardrails de cobranza intactos, flujo find-patient → tool.

## 3. Canal Discord

- [ ] 3.1 `agents/mora/agent/channels/discord.ts`: `discordChannel()` con credenciales env + placeholders, `onCommand` con allowlist (fail-closed), events por default. Test unitario de `onCommand` (autorizado/no autorizado/sin allowlist).

## 4. Limpieza de Eva

- [ ] 4.1 Quitar de `agents/eva/agent/instructions.md` la sección "Delegación a Mora" y routing a subagente; añadir regla transicional de escalación en intención de cobranza.
- [ ] 4.2 Eliminar `agents/eva/agent/hooks/delegation-identity.ts` + su test; revisar si quedan hooks; ajustar `structure.test.ts` de Eva y tests de Mora a las nuevas rutas.
- [ ] 4.3 knip: exclusión temporal de `src/lib/agent/delegation-bindings.ts` (comentario Fase 3 #160).

## 5. Despliegue y docs

- [ ] 5.1 `vercel.json`: servicio `eve-mora` (build `agents/mora`, prefix `/mora`) + routes/rewrite antes del catch-all.
- [ ] 5.2 Docs: setup manual de Discord (app, bot, slash command, Interactions Endpoint `/mora/eve/v1/discord`, allowlist `MORA_DISCORD_DOCTOR_IDS`, envs de Vercel) + actualización de `docs/eve-runbook.md` y `architecture.md` §3.2.

## 6. Verificación

- [ ] 6.1 `supabase start && supabase db reset` + `npm run test:local` en verde (incluye suites nuevas).
- [ ] 6.2 `npx eve build` para eva y mora; `npx eve info` reporta 2 agentes raíz.
- [ ] 6.3 `npx tsc --noEmit` y `npm run build` en verde.
- [ ] 6.4 `verify-report.md`, archive del cambio SDD, push y PR (Closes #159).

## Pendiente manual post-deploy (fuera del repo)

- Crear app/bot en Discord Developer Portal; registrar slash command; configurar Interactions Endpoint URL; instalar bot en el servidor; configurar envs en Vercel; prueba E2E con un doctor real.
