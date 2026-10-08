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

- [x] SDD: proposal → spec delta → design → tasks (`openspec/changes/fase-2-mora-agente-raiz-discord/`, hoy en archive `2026-10-08-*`).
- [x] `agents/mora/agent/` (agent.ts, model.ts, instructions.md, tools/, skills/).
- [x] Adaptación de tools a modelo doctor-paciente (find-patient + parámetros).
- [x] Canal Discord (`channels/discord.ts`) con onCommand/auth y events.
- [x] Limpieza de Eva: quitar delegación, eliminar `subagents/`.
- [x] Despliegue: servicio Vercel `eve-mora`, rewrites `/mora/eve/v1/*`.
- [x] Tests RED→GREEN de los guardrails nuevos.
- [x] Verificación: `eve build`/`eve info` (2 agentes), `tsc`, `build`, `test:local`.
- [x] Docs: setup manual de Discord + runbook.
- [x] verify → archive → PR (Closes #159).

## Pendiente (manual, post-deploy)

- [ ] Crear app de Discord en Developer Portal (task 6 del issue), registrar
  slash command, Interactions Endpoint URL `https://<domain>/mora/eve/v1/discord`,
  instalar el bot en el servidor del consultorio.
- [ ] Configurar `MORA_DISCORD_DOCTOR_IDS` y credenciales de Discord en Vercel.
- [ ] Prueba end-to-end con un doctor real.

## Commits

- `68e0f03` docs(openspec): specify fase-2 mora root agent with discord channel
- `4dff93d` feat(mora): promote Mora to root agent with doctor-facing collections tools
- `70f7f6f` refactor(eva): drop Mora delegation; WhatsApp collections intents escalate
- `8e6d00c` feat(deploy): expose Mora as eve-mora Vercel service and document Discord setup
- `1907eb5` chore(mora): remove dead locals flagged by lint
- `c3970b0` test(mora): cover find-patient; close fase-2 SDD cycle (verify report)

(Rama rebaseada sobre `origin/main` el 2026-10-08 tras fusionarse los PR #185–#189.)

## Revisión nativa (RDD)

El diff acumulado (45 rutas) excedió el presupuesto de contexto de los lentes
(`lens_context_budget_exceeded`, terminal); con decisión del usuario se revisó
por rebanadas (commit por commit):

1. **Rebanada 1 — commit `4dff93d` (mora core, 30 archivos, riesgo alto)**:
   linaje `review-17b345005ed852ca`, 4 lentes (risk, resilience, readability,
   reliability). Veredicto: `correction_required` con 1 hallazgo CRÍTICO
   determinístico (`R2-discord-test-import-depth`: import de 5 niveles `../` en
   `tests/agent/mora/channels/discord.test.ts`, irresoluble). El plan de
   corrección se sometió (2 líneas de diff) pero el flujo terminó en stop
   `corrected_candidate_unavailable`: la corrección ya existía en un commit
   posterior de la rama, no como candidato enmiendable. **Corrección verificada
   en la punta de la rama** (import a 4 niveles, tests en verde).
2. **Rebanada 2 — commit `70f7f6f` (limpieza de Eva, 9 archivos, riesgo medio)**:
   linaje `review-f998745a12a17508`, lente reliability. **Aprobada**, autoridad
   quemada (acknowledge-approved). 4 hallazgos informativos (R3-001..004),
   ninguno bloqueante: deuda de delegation-bindings (Fase 3), suggestion en el
   canal Discord y en tests.
3. **Rebanadas 3 (`8e6d00c` deploy/docs) y 4 (`1907eb5`+`c3970b0` lint/tests)**:
   el usuario declinó la revisión nativa en el prompt de consentimiento
   (decline por candidato). Quedan para revisión humana en el PR.

## Lecciones

- El presupuesto de contexto de los lentes nativos es pequeño: los candidatos
  deben ser work-unit commits desde el inicio, nunca el diff acumulado de la
  feature.
- Los prompts de consentimiento del host caducan a los 10 minutos; conviene
  responderlos de inmediato o el START se pierde.
