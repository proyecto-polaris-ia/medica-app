# Design: eve-reminder-reply-tool

## Contexto

Stage 7 (#37) eliminó `src/lib/whatsapp/inbound-service.ts`, único llamador del
pipeline de respuestas a recordatorios (#87). Los módulos quedaron huérfanos
pero sanos (compilan, tests en verde). El issue #114 decide su destino: Opción
A, reintegrarlos como tool de Eve.

## Decisiones

### D1. Tool, no hook de canal

La detección vive en `agent/tools/handle-reminder-reply.ts` como `defineTool`
default-export (Eve auto-descubre el directorio; patrón de
`escalate-to-human.ts`). No se agrega un pre-check en
`agent/channels/whatsapp.ts`: el canal solo construye el payload de contacto
confiable y la sesión es de Eve. Un hook de canal recrearía el pipeline legacy
que Stage 7 eliminó a propósito.

### D2. Precedencia por instrucciones, no por sesión

El spec previo condicionaba el manejo a "no haber sesión de flow engine
activa". Flow engine ya no existe. La precedencia equivalente se expresa en
`agent/instructions.md`: ante una posible respuesta a recordatorio, Eve llama
`handle-reminder-reply` primero; con `handled: true` transmite `responseText`
tal cual (el texto es determinista, con fecha real de la cita) y no aplica
otras herramientas de escritura al mismo mensaje. El LLM decide el disparo
(semántico), el backend decide el efecto (determinista) — principio
arquitectónico del repo intacto.

### D3. Identidad por teléfono confiable

El tool toma el teléfono de `ctx.session.auth.current.attributes`
(`trustedContactSource: 'whatsapp'`, `trustedPatientPhone`), igual que
`list-my-appointments` / `escalate-to-human`. Un teléfono declarado en el texto
del paciente nunca es identidad. Sin contacto confiable → `success: false`
(mismo patrón de refusal que los tools existentes).

### D4. Flag conservado, enforcement en el tool

`WHATSAPP_REMINDER_REPLY_ENABLED` (default off) se conserva como kill switch de
rollout. `handleReminderReply` ya no lo leía (el lector era el hook borrado);
el tool consulta `isReminderReplyEnabled()` antes de ejecutar y con flag apagado
retorna `handled: false` sin tocar datos. `.env.local.example` no cambia.

### D5. Contrato del tool

```
input:  { message: string (texto del paciente, requerido),
          providerMessageId?: string }
output: { success: true; handled: boolean; outcome; responseText; needsHuman }
        | { success: false; error: string }
```

El teléfono NUNCA es parámetro: viene del canal (`ctx`, contacto confiable);
dejarlo al LLM introduciría un vector de inyección (el paciente podría
"confirmar" otra cita enviando un teléfono ajeno). El texto del mensaje sí lo
transmite el LLM (los tools de Eve no reciben el mensaje crudo; patrón de
`escalate-to-human.ts` con `patientMessage`). Eve no conoce el
`providerMessageId` de Meta: el tool lo sintetiza de forma estable
(`sha256(phone + message)`) para que la idempotencia de escalaciones deduplique
respuestas idénticas repetidas. El tool invoca `handleReminderReply({ phone,
message, providerMessageId })` tal cual.

### D6. Reutilización estricta

`reminder-reply.ts`, `reminder-reply-service.ts`, `reminder-reply-messages.ts`
y `appointment-status.ts` no se modifican. La única lógica nueva es el boundary
del tool (auth, flag, mapeo de resultado, manejo de errores) y las
instrucciones.

## Riesgos

- **Doble procesamiento**: si Eve llama el tool dos veces por el mismo mensaje,
  la idempotencia por `providerMessageId` del servicio acota el efecto; el
  acuse "ya confirmada" (`outcome: already`) es la respuesta segura.
- **Falsos positivos del disparo LLM**: un "sí" a una pregunta ajena podría
  disparar el tool. El servicio responde `out_of_window`/`none` sin tocar citas
  fuera de la ventana; el peor caso es un acuse de ventana agotada con
  escalación (comportamiento ya especificado).
- **Instrucciones ignoradas**: mitigable en verificación con la suite del tool
  y revisión del texto de instrucciones; queda fuera de este cambio un check
  determinista a nivel canal.
