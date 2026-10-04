# Tasks: eve-reminder-reply-tool

## 1. Tool

- [x] 1.1 Crear `agent/tools/handle-reminder-reply.ts`: `defineTool` con zod,
  refusal de contacto no confiable, flag `isReminderReplyEnabled()`, llamada a
  `handleReminderReply`, mapeo a `{ success, handled, outcome, responseText,
  needsHuman }`, errores como `success: false`.
- [x] 1.2 Registrar el tool en `agent/instructions.md` con la regla de
  precedencia (llamar primero ante posible respuesta a recordatorio; transmitir
  `responseText` verbatim; no duplicar escrituras del mismo mensaje).

## 2. Tests

- [x] 2.1 `tests/agent/tools/handle-reminder-reply.test.ts`: mock de
  `reminder-reply-service` y `reminder-reply-flag`; cubrir teléfono no
  confiable, flag apagado, `handled: true` con outcome y `responseText`,
  `handled: false`, error de I/O.
- [ ] 2.2 Suites existentes de reminder-reply siguen en verde
  (`npm run test:local` con Supabase local si aplica).

## 3. Verify

- [ ] 3.1 `tsc --noEmit` y lint limpios.
- [ ] 3.2 `verify-report.md` del change con evidencia de tests.
