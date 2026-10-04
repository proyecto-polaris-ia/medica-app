# Change: Reintegrar detección estructurada de respuestas a recordatorios en Eve

## Summary

Decide el destino de los módulos huérfanos de reminder-reply (issue #114) como
**Opción A**: exponerlos a Eve como la herramienta dedicada
`handle-reminder-reply`, para que la detección de `CONFIRMO` / `CANCELO` /
ambigüedad sobre recordatorios enviados sea determinista y no dependa de la
interpretación libre del LLM.

## Problem

Al eliminar el pipeline legacy de WhatsApp (Stage 7, #37) quedó huérfano el
pipeline de respuestas a recordatorios (#87): `classifyReminderReply`,
`reminder-reply-service` y su feature flag compilan y pasan tests, pero nada los
invoca. Eve responde esos mensajes conversacionalmente, sin detección
estructurada: puede "confirmar" una cita sin verificar la ventana de 36 horas ni
el estado elegible, y pierde la transición de estado acotada con rastro
auditable.

## Goals

- Exponer la detección determinista existente a Eve como tool
  `handle-reminder-reply`, sin reescribir la lógica de clasificación.
- Reinterpretar la precedencia del spec (antes "sesión de flow engine activa",
  eliminada en Stage 7) como una regla de instrucciones de Eve: el tool tiene la
  primera oportunidad sobre la respuesta conversacional.
- Conservar `WHATSAPP_REMINDER_REPLY_ENABLED` como kill switch de rollout, con
  su punto de enforcement movido al tool.

## Non-goals

- Reintroducir un pipeline paralelo fuera de Eve o tocar el webhook.
- Modificar `flow-control.ts`, `eve-escalation.ts` o la lógica de
  `reminder-reply.ts` / `reminder-reply-service.ts` (solo se reutilizan).
- Enviar WhatsApps desde el tool: la redacción y el envío siguen siendo de Eve.

## Rollback Plan

Revertir el commit de la rama: Eve deja de exponer `handle-reminder-reply` y las
instrucciones vuelven al texto previo. Los módulos reutilizados quedan como
estaban (compilan y pasan tests sin el tool).
