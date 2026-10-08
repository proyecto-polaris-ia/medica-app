# Feature: fase-2-promover-mora-agente-raiz-discord (issue #159)

**Issue:** https://github.com/proyecto-polaris-ia/medica-app/issues/159
**Branch:** `eliumontoya/fase-2-promover-mora-agente-raiz-discord`
**Creado:** 2026-12

## Contexto

Migración a topología multi-agente (épico #140). Mora deja de ser subagente de
Eva y se convierte en agente raíz independiente (`agents/mora/agent/`) con
canal Discord propio: los doctores hablan directo con Mora para temas de
cobranza, sin que Eva medie.

**Decisiones de producto tomadas con el usuario (2026-12):**

1. **Identidad del paciente:** el doctor nombra al paciente (nombre o
   teléfono) y Mora lo resuelve contra la tabla `patients`. Las 3 tools
   actuales dejan de derivar identidad del WhatsApp verificado.
2. **Autorización del doctor:** allowlist por variable de entorno
   (`MORA_DISCORD_DOCTOR_IDS`, Discord user IDs). La tabla de staff en
   Supabase queda anotada para una fase posterior.

El guardrail "solo del propio paciente verificado" se transforma en "solo
doctores autorizados"; el resto de guardrails de cobranza (montos solo de BD,
no negociar, no links de pago, no mover dinero) se conservan intactos.

Cambie SDD: `openspec/changes/fase-2-mora-agente-raiz-discord/`.

## Tareas

- [ ] SDD: proposal → spec delta → design → tasks.
- [ ] `agents/mora/agent/` (agent.ts, model.ts, instructions.md, tools/, skills/).
- [ ] Adaptación de tools a modelo doctor-paciente (find-patient + parámetros).
- [ ] Canal Discord (`channels/discord.ts`) con onCommand/auth y events.
- [ ] Limpieza de Eva: quitar delegación, eliminar `subagents/`.
- [ ] Despliegue: servicio Vercel `eve-mora`, rewrites `/mora/eve/v1/*`.
- [ ] Tests RED→GREEN de los guardrails nuevos.
- [ ] Verificación: `eve build`/`eve info` (2 agentes), `tsc`, `build`, `test:local`.
- [ ] Docs: setup manual de Discord + runbook.
- [ ] verify → archive → PR (Closes #159).

## Pendiente (manual, post-deploy)

- [ ] Crear app de Discord en Developer Portal (task 6 del issue), registrar
  slash command, Interactions Endpoint URL `https://<domain>/mora/eve/v1/discord`,
  instalar el bot en el servidor del consultorio.
- [ ] Configurar `MORA_DISCORD_DOCTOR_IDS` y credenciales de Discord en Vercel.
- [ ] Prueba end-to-end con un doctor real.

## Commits

(registrar aquí cada work-unit commit)
