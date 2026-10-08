# Runbook del agente Eve — Monitoreo y rollback

Guía operativa del agente Eve de WhatsApp, que es el **único** path de WhatsApp
desde la Etapa 7 (issue #37). No hay flag de routing ni agente legacy en
paralelo.

## Topología multiagente (issue #140)

Eva es el agente raíz de WhatsApp y el único ligado a ese canal (un solo
binding). Cada agente raíz vive en `agents/<name>/agent/` con su propio canal.

- **Mora** (`agents/mora/agent/`): agente raíz independiente de cobranza con
  canal Discord propio (issue #159). Los doctores autorizados le hablan directo
  por el slash command; la ruta del canal es `/mora/eve/v1/discord` (servicio
  Vercel `eve-mora`). Verifícalo tras cada deploy: `npx eve info --agent mora`
  debe reportar `Diagnostics 0 errors, 0 warnings`.
- La autorización del doctor es una allowlist por variable de entorno
  (`MORA_DISCORD_DOCTOR_IDS`, user IDs de Discord separados por coma). Se
  aplica dos veces: en `onCommand` del canal (usuarios no autorizados no
  abren sesión) y dentro de cada tool (`agents/mora/agent/access.ts`). Sin
  allowlist configurada, el canal falla cerrado.
- Las tools de Mora ya no derivan identidad de un WhatsApp verificado: el
  doctor nombra al paciente (teléfono registrado o nombre) y la tool lo
  resuelve contra `patients`. El sistema de delegación
  (`src/lib/agent/delegation-bindings.ts` + tabla `agent_delegation_bindings`)
  quedó sin consumidores y se elimina en Fase 3 (issue #160).
- En WhatsApp, Eva ya no delega: ante intención de cobranza escala a un humano
  con `escalate-to-human` (transicional hasta que exista una superficie
  paciente-facing de cobranza).
- Clara y Nora NO son agentes de WhatsApp: son capacidades admin/jobs (specs
  `follow-up` y `dashboard-metrics`).

Setup del canal de Discord de Mora: `docs/mora-discord-setup.md`.

## Modelo de reenvío (Eve-only)

`app/api/whatsapp/webhook/route.ts`:

1. `GET` — verificación de Meta (`hub.mode`, `hub.verify_token`, `hub.challenge`).
2. `POST` — verifica la firma `x-hub-signature-256`, parsea el payload, emite el
   indicador de "escribiendo" y un registro de observabilidad, y **siempre**
   reenvía el cuerpo crudo a `/eva/eve/v1/whatsapp` (propagando la cabecera de firma
   de Meta); la respuesta de Eve se refleja al cliente.
3. Si el reenvío falla, responde `502` y registra `webhook.failed`. No hay
   fallback: Meta reintenta la entrega.

La URL del webhook en Meta **no cambia**: sigue apuntando a
`/api/whatsapp/webhook`.

## Limpieza del operador (una sola vez)

El código ya no lee `WHATSAPP_EVE_ENABLED`; la variable quedó en Vercel como
residuo de la Etapa 6. Se puede eliminar cuando convenga:

```bash
vercel env rm WHATSAPP_EVE_ENABLED production
```

No requiere redeploy ni cambio en Meta. Habría que restaurarla solo si se
volviera al código de la Etapa 6 que aún la leía (ver Rollback).

## Rollback

El rollback es de código, no de flag:

```bash
git revert <merge-commit-de-la-etapa-7>
git push origin main
vercel --prod
```

- No hay que tocar la URL del webhook de Meta ni la configuración de verificación.
- Si se revierte a código de la Etapa 6, hay que recrear
  `WHATSAPP_EVE_ENABLED=true` en Vercel para que el routing vuelva a Eve.
- Tiempo estimado: ~2 minutos (redeploy).

## Monitoreo

### Registros de routing del webhook

Cada mensaje verificado deja un registro estructurado `whatsapp_ai_observability`
en los logs de Vercel (`https://vercel.com/<team>/<project>/logs`):

- `webhook.accepted` — reenvío exitoso a Eve
  (`identifiers.forwardingTarget: 'eve'`).
- `webhook.failed` — falló el reenvío (`diagnostics.reason: 'eve_forward_failed'`).
- `webhook.rejected` — firma inválida o secreto sin configurar.
- `webhook.received` — mensaje recibido, antes de verificar la firma.

Todos incluyen `correlationId` y, cuando está disponible, el id del mensaje
entrante. Filtrar por `whatsapp_ai_observability` (o por `webhook.`) para ver el
routing; buscar `[Eve] forwarding error` / `[Eve] forwarding failed` para los
errores de reenvío.

### Vercel Agent Runs

- URL: `https://vercel.com/<team>/<project>/observability/agent-runs`
- Muestra cada sesión de Eve: tool calls y resultados, razonamiento del modelo,
  uso de tokens, tiempos y errores.

### Métricas objetivo

| Métrica | Objetivo |
| --- | --- |
| Tasa de error | < 5% |
| Tiempo de respuesta | < 3 s |
| Tasa de éxito | > 95% |

## Alertas (sugeridas en Vercel)

- Tasa de error > 5%.
- Percentil 95 de tiempo de respuesta > 5 s.
- Picos de `webhook.failed` (fallas de reenvío a Eve).

## Problemas comunes

### Eve no responde

1. Buscar en los logs `[Eve] forwarding error` o `[Eve] forwarding failed`.
2. Confirmar que están presentes las credenciales `WHATSAPP_*` y las del modelo
   (`WHATSAPP_AGENT_LLM_API_KEY|MODEL|BASE_URL`).
3. Revisar Vercel Agent Runs en busca de errores de sesión.
4. Si persiste, evaluar rollback (sección Rollback).

### Tasa de error alta

1. Revisar Vercel Agent Runs en busca de tool calls fallidos.
2. Verificar conectividad con Supabase.
3. Verificar el estado de la Graph API de Meta.
4. Si no se resuelve, evaluar rollback.

### Respuestas lentas

1. Revisar Vercel Agent Runs en busca de tool calls lentos.
2. Revisar la latencia de las consultas a Supabase.
3. Evaluar escalar las funciones de Vercel.

## Checklist de rollback

- [ ] `git revert <merge-commit-de-la-etapa-7>` y push.
- [ ] Redeploy a producción (`vercel --prod`).
- [ ] Confirmar que el webhook de Meta sigue apuntando a `/api/whatsapp/webhook`.
- [ ] Si se revirtió a código de la Etapa 6, recrear `WHATSAPP_EVE_ENABLED=true`.
- [ ] Confirmar que el agente responde.
- [ ] Revisar los logs en busca de errores.
- [ ] Notificar al equipo.
- [ ] Investigar la causa, corregir y volver a probar antes de reintentar.

## Referencias

- Arquitectura: [`../architecture.md`](../architecture.md) (secciones 3 y 5).
- Plan de migración: [`eve/eve-migration-plan.md`](eve/eve-migration-plan.md).
- Instrucciones del agente: [`../agents/eva/agent/instructions.md`](../agents/eva/agent/instructions.md).
