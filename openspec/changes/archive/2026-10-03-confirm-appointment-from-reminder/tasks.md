# Tasks: Confirmación de cita en un toque desde el recordatorio

**Cambio:** `confirm-appointment-from-reminder` (issue #87, fases 1–3).
**TDD:** `strict_tdd: true` → RED → GREEN → TRIANGULATE → REFACTOR. Cada tarea de
implementación va precedida por su tarea de prueba en rojo, y la observación RED
queda anotada en la verificación de esa tarea. Runner autorizado: `npm run test`
(Vitest). Comandos de verificación global: `npx tsc --noEmit`, `npm run build`
(`npm run lint` no existe en `package.json`; se registra la limitación).

**Alcance del Apply:** path flow-engine/legacy. El path Eve
(`WHATSAPP_EVE_ENABLED`) queda fuera de alcance. Sin migraciones: se reutiliza
`appointments.notes` y el enum `appointment_status`.

**Superficies de edición (Apply):**

- Nuevos: `src/lib/citas/reminder-reply.ts`,
  `src/lib/citas/reminder-reply-messages.ts`,
  `src/lib/citas/reminder-reply-service.ts`,
  `src/lib/citas/reminder-reply-flag.ts`,
  `src/lib/citas/appointment-status.ts`.
- Modificados: `src/lib/whatsapp/inbound-service.ts` (gancho en
  `processWhatsAppInboundEvent`), `src/lib/whatsapp/orchestrator.ts` (exportar
  `isFlowSessionActive`, `isFlowExpired`, `FLOW_TIMEOUT_MINUTES`),
  `.env.local.example`.
- Pruebas nuevas: `src/lib/citas/__tests__/reminder-reply.test.ts`,
  `src/lib/citas/__tests__/reminder-reply-messages.test.ts`,
  `src/lib/citas/__tests__/reminder-reply-flag.test.ts`,
  `src/lib/citas/__tests__/appointment-status.test.ts`,
  `src/lib/citas/__tests__/reminder-reply-service.test.ts`,
  `src/lib/whatsapp/__tests__/orchestrator-flow-session.test.ts`,
  `src/lib/whatsapp/__tests__/inbound-service-reminder-reply.test.ts`.

---

## Fase 1 — Clasificación pura de intención y mensajes deterministas

Archivos de implementación: `src/lib/citas/reminder-reply.ts` (parte pura de
clasificación), `src/lib/citas/reminder-reply-messages.ts`.
Archivos de prueba: `src/lib/citas/__tests__/reminder-reply.test.ts`,
`src/lib/citas/__tests__/reminder-reply-messages.test.ts`.

- [x] 1.1 **RED** — Escribir `src/lib/citas/__tests__/reminder-reply.test.ts`
  con la clasificación de intención (`design.md` §5): afirmativos `1`, `sí`, `si`,
  `confirmo`, `va`, `ok` y tolerancia a mayúsculas/acentos (`Sí`, `SI`, `OK`);
  no afirmativos (`no`, texto libre) → `none`; cancelaciones
  (`no puedo`, `no podré`, `cancelo`, `no alcanzo`) → `cancellation`;
  ambigüedad clínica (`"sí, me duele mucho"`, `"no puedo, tengo una infección"`,
  `"ok, pero recuérdame qué medicina tomo"`) → `ambiguous`; y orden de
  precedencia ambigüedad → cancelación → confirmación. Importar
  `classifyReminderReply`, `isReminderReplyConfirmation`,
  `isReminderReplyCancellation`, `hasClinicalAmbiguity`.
  - Verificación: `npm run test -- src/lib/citas/__tests__/reminder-reply.test.ts`
    → **falla** (módulo `@/lib/citas/reminder-reply` inexistente; casos RED).
- [x] 1.2 **GREEN** — Implementar en `src/lib/citas/reminder-reply.ts`:
  `ReminderReplyIntent`, `REPLY_AFFIRMATIVE` (extensión local de
  `detectConfirmation` para `1`/`va`), `REPLY_CANCELLATION` (extensión local de
  `detectCancellation` para `no puedo`), `CLINICAL_AMBIGUITY` (extensión de los
  patrones clínicos de `eve-escalation.ts`, incluyendo `duele|dolor` genérico),
  `isReminderReplyConfirmation`, `isReminderReplyCancellation`,
  `hasClinicalAmbiguity` y `classifyReminderReply` con el orden exigido. Reutilizar
  `detectConfirmation`/`detectCancellation` de `src/lib/flows/flow-control.ts` sin
  modificarlos.
  - Verificación: `npm run test -- src/lib/citas/__tests__/reminder-reply.test.ts`
    → **pasa**.
- [x] 1.3 **RED** — Escribir
  `src/lib/citas/__tests__/reminder-reply-messages.test.ts` para los cinco
  constructores (`buildReminderConfirmationAck`, `buildReminderCancellationAck`,
  `buildReminderAmbiguityReply`, `buildReminderOutOfWindowReply`,
  `buildReminderAlreadyConfirmedReply`): el acuse de confirmación/cancelación
  incluye la fecha y hora **reales** de la cita (leídas con `formatClinicDateLabel`
  y `clinicTimeLabel`, no inventadas) y la cancelación ofrece reagendar.
  - Verificación:
    `npm run test -- src/lib/citas/__tests__/reminder-reply-messages.test.ts`
    → **falla** (módulo inexistente; casos RED).
- [x] 1.4 **GREEN** — Implementar `src/lib/citas/reminder-reply-messages.ts` con
  las plantillas deterministas es-MX del `design.md` §6, leyendo fecha y hora
  reales con `formatClinicDateLabel` de
  `src/lib/citas/send-appointment-reminder.ts` y `clinicTimeLabel` de
  `src/lib/admin/timezone.ts`. Sin LLM ni texto inventado.
  - Verificación:
    `npm run test -- src/lib/citas/__tests__/reminder-reply-messages.test.ts`
    → **pasa**.
- [x] 1.5 **TRIANGULATE/REFACTOR** — Cubrir negativos que protegen el contrato:
  clínico **sin** confirmación ni cancelación → `none` (el pipeline general escala
  por sí mismo); texto vacío/espacios → `none`; acento/mayúscula mixtos; mensaje
  de confirmación sin `patientName` no rompe la plantilla. Limpiar nombres y
  constantes manteniendo la prueba en verde.
  - Verificación:
    `npm run test -- src/lib/citas/__tests__/reminder-reply.test.ts src/lib/citas/__tests__/reminder-reply-messages.test.ts`
    → **pasa**.

**Cobertura de spec:** R2 (Confirmación determinista y tolerante), R3
(Clasificación de intención verificable), parte de R4 (acuse con datos reales) y
parte de R6 (detección de ambigüedad clínica).

---

## Fase 2 — Elegibilidad pura y transición guardada de estado

Archivos de implementación: `src/lib/citas/reminder-reply.ts` (parte de
elegibilidad/rastro), `src/lib/citas/appointment-status.ts`,
`src/lib/citas/reminder-reply-service.ts`.
Archivos de prueba: `src/lib/citas/__tests__/reminder-reply.test.ts` (extensión),
`src/lib/citas/__tests__/appointment-status.test.ts`,
`src/lib/citas/__tests__/reminder-reply-service.test.ts`.
Referencia de mock: `src/lib/citas/__tests__/send-appointment-reminder.test.ts`
(`vi.mock('@/lib/supabase/server')` + `MockQuery`).

- [x] 2.1 **RED** — Extender `src/lib/citas/__tests__/reminder-reply.test.ts`
  con elegibilidad y rastro (`design.md` §1 y §4): `REMINDER_REPLY_WINDOW_HOURS`
  = 36; ventana `[now - 36h, now]` dentro/fuera; cita sin recordatorio reciente;
  `CONFIRM_ALLOWED_FROM` (`requested`,`pending`) y `CANCEL_ALLOWED_FROM`
  (`requested`,`pending`,`confirmed`); estados terminales → no elegible;
  `reminderReplyWindowStart(now)`; `normalizePhoneValue` espejo de
  `normalize_whatsapp_phone`; `pickEligibleReminderReplyCandidate` elige el
  `sentAt` más reciente y, en empate, el `startAt` más próximo (determinista);
  `buildReminderReplyNotesEntry` con y sin motivo en formato
  `[YYYY-MM-DD HH:mm America/Mexico_City] Confirmada/Cancelada desde recordatorio (quién: sistema/recordatorio)[. Motivo: <texto>]`;
  `appendReminderReplyNotes` concatena con `' | '` y sanea el motivo
  (`.trim()`, colapsar saltos, truncar a 200 chars).
  - Verificación: `npm run test -- src/lib/citas/__tests__/reminder-reply.test.ts`
    → **falla** (funciones RED inexistentes).
- [x] 2.2 **GREEN** — Implementar en `src/lib/citas/reminder-reply.ts` la parte
  pura de elegibilidad y rastro: `ReminderReplyCandidate`,
  `REMINDER_REPLY_WINDOW_HOURS`, `CONFIRM_ALLOWED_FROM`, `CANCEL_ALLOWED_FROM`,
  `normalizePhoneValue`, `reminderReplyWindowStart`,
  `isEligibleReminderReplyCandidate`, `pickEligibleReminderReplyCandidate`,
  `buildReminderReplyNotesEntry`, `appendReminderReplyNotes`. Sin
  `process.env`, sin Supabase y sin `Date.now()` implícito: recibe `now`/`phone`.
  - Verificación: `npm run test -- src/lib/citas/__tests__/reminder-reply.test.ts`
    → **pasa**.
- [x] 2.3 **RED** — Escribir
  `src/lib/citas/__tests__/appointment-status.test.ts` para
  `transitionAppointmentFromReminder` (`design.md` §4): cita inexistente →
  `{ ok:false, reason:'not_found' }`; estado terminal o fuera del set permitido →
  `{ ok:false, reason:'ineligible_status' }` **sin** escribir; cambio válido
  `requested/pending → confirmed` y `requested/pending/confirmed → cancelled` con
  `UPDATE ... WHERE id = ? AND status IN (allowed)`; 0 filas afectadas (carrera) →
  relectura y `ineligible_status`; `notes` anexado con el formato de rastro; marca
  de tiempo en `America/Mexico_City`.
  - Verificación:
    `npm run test -- src/lib/citas/__tests__/appointment-status.test.ts`
    → **falla** (módulo inexistente; casos RED).
- [x] 2.4 **GREEN** — Implementar `src/lib/citas/appointment-status.ts` con
  `ReminderReplyTransitionResult` y `transitionAppointmentFromReminder` usando
  `getSupabaseAdmin()`, lectura `id, status, notes` con `.maybeSingle()`,
  validación del set permitido y `UPDATE` guardado por estado origen. No reutilizar
  `updateAppointment` (es full-row).
  - Verificación:
    `npm run test -- src/lib/citas/__tests__/appointment-status.test.ts` → **pasa**.
- [x] 2.5 **RED** — Escribir
  `src/lib/citas/__tests__/reminder-reply-service.test.ts` con Supabase mockeado
  (`design.md` §3, §7 y §9): la query de elegibilidad filtra
  `status='sent'`, `dry_run=false`, `sent_at >= ventana`,
  `appointments.status IN (requested,pending,confirmed)`, `order sent_at desc`,
  `limit 10`; `handleReminderReply` → confirmación elegible transiciona y responde
  acuse con fecha real; cancelación elegible transiciona, anexa motivo y llama
  `createEveWhatsAppEscalation` **una vez** con `idempotencyKey` y oferta de
  reagendar; ambigüedad escala y **no** cambia estado; intención `none` →
  `handled:false`; fuera de ventana/sin candidato → escalación
  `${providerMessageId}:out_of_window`, sin transición; confirmación repetida
  sobre cita ya `confirmed` → no revierte ni duplica escalación; cancelación
  repetida → no cambia estado ni duplica escalación.
  - Verificación:
    `npm run test -- src/lib/citas/__tests__/reminder-reply-service.test.ts`
    → **falla** (módulo inexistente; casos RED).
- [x] 2.6 **GREEN** — Implementar `src/lib/citas/reminder-reply-service.ts`:
  `REMINDER_REPLY_SELECT` con embeds anidados
  (`appointments!inner` → `patients!inner`), query acotada por ventana/estado,
  emparejamiento de teléfono en JS con `normalizePhoneValue` + fast-path opcional
  por `contactId`, selección con `pickEligibleReminderReplyCandidate`, orquestación
  `handleReminderReply(input): { handled, outcome, responseText, needsHuman }` y
  escalación suave con `createEveWhatsAppEscalation` en
  `src/lib/whatsapp/eve-escalation.ts` (sin modificar ese archivo).
  - Verificación:
    `npm run test -- src/lib/citas/__tests__/reminder-reply-service.test.ts`
    → **pasa**.
- [x] 2.7 **TRIANGULATE/REFACTOR** — Casos negativos que protegen el contrato:
  estado terminal (`cancelled`, `rescheduled`, `no_show`, `attended`) nunca
  transiciona; sin candidato no se llama a `transitionAppointmentFromReminder`;
  empate de `sentAt` resuelto por `startAt`; teléfono con formato distinto
  normaliza igual; `dry_run=true`/`status != 'sent'` no aparecen como elegibles.
  Limpiar la orquestación manteniendo la suite en verde.
  - Verificación:
    `npm run test -- src/lib/citas/__tests__/reminder-reply.test.ts src/lib/citas/__tests__/appointment-status.test.ts src/lib/citas/__tests__/reminder-reply-service.test.ts`
    → **pasa**.

**Cobertura de spec:** R1 (Detección del contexto de recordatorio activo), R4
(Transición a `confirmed` + acuse), R5 (Cancelación desde el recordatorio), R6
(Ambigüedad clínica escala sin tocar estado), R7 (Citas inexistentes/terminales
nunca se modifican), R8 (Fuera de ventana con escalación), R9 (Rastro auditable),
R10 (Idempotencia — parte de servicio).

---

## Fase 3 — Gancho en el pipeline y feature flag

Archivos de implementación: `src/lib/citas/reminder-reply-flag.ts`,
`src/lib/whatsapp/orchestrator.ts` (exportaciones),
`src/lib/whatsapp/inbound-service.ts` (gancho).
Archivos de prueba: `src/lib/citas/__tests__/reminder-reply-flag.test.ts`,
`src/lib/whatsapp/__tests__/orchestrator-flow-session.test.ts`,
`src/lib/whatsapp/__tests__/inbound-service-reminder-reply.test.ts`.

- [x] 3.1 **RED** — Escribir
  `src/lib/citas/__tests__/reminder-reply-flag.test.ts`: `undefined`/ausente →
  `false`; `'false'`, `'0'`, `'no'`, `'on'`, `''` → `false`; `'true'`, `'1'`,
  `'yes'`, `' TRUE '` → `true` (espejo de `eve-flag.test.ts`).
  - Verificación:
    `npm run test -- src/lib/citas/__tests__/reminder-reply-flag.test.ts`
    → **falla** (módulo inexistente; casos RED).
- [x] 3.2 **GREEN** — Implementar `src/lib/citas/reminder-reply-flag.ts` con
  `isReminderReplyEnabled(rawValue?: string | null): boolean` copiando el patrón
  de `src/lib/whatsapp/eve-flag.ts` (`TRUTHY_VALUES = true|1|yes`, `trim()` +
  `toLowerCase()`; ausente y todo lo demás → `false`, default **off**). No extender
  el `isFlowEngineEnabled` privado de `inbound-service.ts`.
  - Verificación:
    `npm run test -- src/lib/citas/__tests__/reminder-reply-flag.test.ts` → **pasa**.
- [x] 3.3 **RED** — Escribir
  `src/lib/whatsapp/__tests__/orchestrator-flow-session.test.ts` para las
  exportaciones de `src/lib/whatsapp/orchestrator.ts`: `isFlowSessionActive`
  devuelve `true` con sesión no `complete` y no expirada; `false` con
  `flowState = null`; `false` con `name === 'complete'`; `false` con sesión
  expirada (`FLOW_TIMEOUT_MINUTES = 30`); `isFlowExpired` y
  `FLOW_TIMEOUT_MINUTES` exportados.
  - Verificación:
    `npm run test -- src/lib/whatsapp/__tests__/orchestrator-flow-session.test.ts`
    → **falla** (`isFlowSessionActive` no exportado / inexistente).
- [x] 3.4 **GREEN** — Exportar desde `src/lib/whatsapp/orchestrator.ts`
  `isFlowSessionActive(flowState, now)`, `isFlowExpired` y
  `FLOW_TIMEOUT_MINUTES` con la semántica exacta del bloque privado actual
  (`flowState != null && flowState.name !== 'complete' && !isFlowExpired(...)`),
  sin cambio de comportamiento y reutilizando la constante sin duplicarla.
  - Verificación:
    `npm run test -- src/lib/whatsapp/__tests__/orchestrator-flow-session.test.ts`
    → **pasa**.
- [x] 3.5 **RED** — Escribir
  `src/lib/whatsapp/__tests__/inbound-service-reminder-reply.test.ts` (integración
  con store mockeado, `design.md` §2): flag apagado → el gancho **no** se evalúa y
  el pipeline actual sigue intacto; sesión de flow engine activa → **no** hay
  transición ni escalación y el flujo continúa; `handleReminderReply` con
  `handled:true` → corto-circuito (no se llama a `orchestrate`), se envía y
  persiste el acuse, se marca el mensaje
  `responded`/`escalated` y `needs_human` según el caso; `handled:false` →
  el mensaje sigue al orquestador sin tocar estado; path legacy
  (`WHATSAPP_FLOW_ENGINE_ENABLED` off) reconoce la respuesta; duplicado por ledger
  (`inserted:false`) no repite transición ni acuse.
  - Verificación:
    `npm run test -- src/lib/whatsapp/__tests__/inbound-service-reminder-reply.test.ts`
    → **falla** (gancho inexistente; casos RED).
- [x] 3.6 **GREEN** — Cablear el gancho en
  `src/lib/whatsapp/inbound-service.ts::processWhatsAppInboundEvent`, **después**
  de `loadConversationContext`/`loadConversationHistory` y **antes** del branch
  `if (isFlowEngineEnabled())`, exactamente con el orden de guardas del
  `design.md` §2: `isReminderReplyEnabled()` →
  `event.messageType === 'text'` → `event.body` →
  `!isFlowSessionActive(conversation.flowState ?? null, new Date())`; luego
  `handleReminderReply(...)`; si `handled`, `sendAndPersist` +
  `updateConversationSummary` + `markInboundMessageProcessed` y `return` con
  `needs_human`/`auto_answer` y la decisión construida. Un solo punto de inserción
  cubre flow-engine y legacy.
  - Verificación:
    `npm run test -- src/lib/whatsapp/__tests__/inbound-service-reminder-reply.test.ts`
    → **pasa**.
- [x] 3.7 **TRIANGULATE/REFACTOR** — Reforzar la precedencia y el apagado
  seguro: con flag apagado, una confirmación elegible llega al pipeline normal
  (regresión); sesión `complete`/expirada **no** bloquea y sí aplica el manejo;
  mensaje no-texto (p. ej. imagen) no entra al gancho. Limpiar el dispatch
  manteniendo la suite en verde.
  - Verificación:
    `npm run test -- src/lib/whatsapp/__tests__/inbound-service-reminder-reply.test.ts src/lib/whatsapp/__tests__/orchestrator-flow-session.test.ts src/lib/citas/__tests__/reminder-reply-flag.test.ts`
    → **pasa**.

**Cobertura de spec:** R11 (Control por feature flag), R12 y R13 (Precedencia de la
sesión de flow engine activa), R14 (Respuestas a recordatorio antes de la
clasificación general).

---

## Fase 4 — Pruebas de integración y aceptación del issue #87

> **Nota TDD:** esta fase es **solo de pruebas** (no introduce implementación).
> La disciplina RED/GREEN se cumplió en las fases 1–3, donde vive cada
> comportamiento; su RED quedó anotado allí (módulo/gancho inexistente antes de
> implementar). Aquí las tres pruebas de aceptación del issue #87 se consolidan
> como regresión explícita y quedan en verde.

- [x] 4.1 **Aceptación #87 (parse)** — Agregar en
  `src/lib/citas/__tests__/reminder-reply.test.ts` un bloque de aceptación que
  nombre los tres casos del issue: positivos (`1`, `sí`, `confirmo`, `va`, `ok`),
  negativos (`no`, texto libre) y ambiguos (`"sí, pero me duele mucho"`).
  - Verificación:
    `npm run test -- src/lib/citas/__tests__/reminder-reply-acceptance.test.ts -t "parseo"`
    → **pasa** (regresión de R2/R3; el RED de comportamiento se observó en 1.1).
- [x] 4.2 **Aceptación #87 (no confirma con síntoma)** — Agregar en
  `src/lib/whatsapp/__tests__/inbound-service-reminder-reply.test.ts` la prueba de
  aceptación: `"me duele mucho"` mezclado con confirmación crea escalación a
  humano y **no** aplica transición (estado intacto).
  - Verificación:
    `npm run test -- src/lib/citas/__tests__/reminder-reply-acceptance.test.ts -t "síntoma"`
    → **pasa** (regresión de R6; RED observado en 2.5/3.5).
- [x] 4.3 **Aceptación #87 (sesión activa gana)** — Agregar la prueba de
  aceptación: con una sesión de flow engine activa y una cita elegible con
  recordatorio reciente, un `"1"` **no** produce transición ni escalación y el
  mensaje sigue el flujo de reserva.
  - Verificación:
    `npm run test -- src/lib/whatsapp/__tests__/inbound-service-reminder-reply.test.ts -t "sesión"`
    → **pasa** (regresión de R12/R13; RED observado en 3.5).
- [x] 4.4 **Aceptación (path legacy)** — Consolidar en
  `src/lib/whatsapp/__tests__/inbound-service-reminder-reply.test.ts` la prueba
  del path legacy (`WHATSAPP_FLOW_ENGINE_ENABLED` apagado) que reconoce la
  respuesta a recordatorio antes de la clasificación general.
  - Verificación:
    `npm run test -- src/lib/whatsapp/__tests__/inbound-service-reminder-reply.test.ts -t "legacy"`
    → **pasa** (regresión de R14).
- [x] 4.5 **Aceptación (idempotencia por ledger)** — Consolidar la aserción de
  duplicado: un segundo webhook con el mismo `providerMessageId` no repite la
  transición ni duplica el acuse.
  - Verificación:
    `npm run test -- src/lib/whatsapp/__tests__/inbound-service-reminder-reply.test.ts -t "duplicado"`
    → **pasa** (regresión de R10/R14).

> **Enmienda (parte C, Fase 4):** la aceptación del issue #87 se consolidó en
> `src/lib/citas/__tests__/reminder-reply-acceptance.test.ts` (16 pruebas,
> end-to-end sobre el borde de servicio: `classifyReminderReply` + elegibilidad +
> `handleReminderReply` con Supabase/transición/escalación mockeados), porque ese
> archivo sí está en las superficies de edición autorizadas de la parte C y
> `src/lib/whatsapp/__tests__/inbound-service-reminder-reply.test.ts` no lo está.
> 4.1 (positivos/negativos/ambiguos) y 4.2 (dolor/urgencia no confirma, escalación
> creada y `appointments.notes` intactas) quedan cubiertos ahí; 4.3 (sesión activa
> gana), 4.4 (path legacy) y 4.5 (duplicado por ledger) ya estaban cubiertos por
> la suite de la Fase 3 en `inbound-service-reminder-reply.test.ts` ("con una
> sesión de flow engine activa no hay transición ni escalación y el flujo
> continúa (aceptación #87)", "reconoce la respuesta en el path legacy con el flow
> engine apagado" y "un duplicado por ledger no repite transición ni acuse"), que
> sigue en verde; no se duplican.

**Cobertura de spec:** consolida R2, R3, R6, R10, R12, R13 y R14 como aceptación
explícita del issue #87.

---

## Fase 5 — Documentación y ejemplo de entorno

- [-] 5.1 Agregar `WHATSAPP_REMINDER_REPLY_ENABLED=false` a `.env.local.example`
  junto a `WHATSAPP_FLOW_ENGINE_ENABLED`, con comentario breve: default **off**;
  encender solo tras verificar (rollback = apagarlo, sin deploy ni migración).
  - Verificación: `grep -n "WHATSAPP_REMINDER_REPLY_ENABLED=false" .env.local.example`
    → una coincidencia; confirmar que está junto a `WHATSAPP_FLOW_ENGINE_ENABLED` y
    que su default documentado es `false`.
  - **Diferida (parte D):** bloqueado por política de seguridad del harness; la
    línea `WHATSAPP_REMINDER_REPLY_ENABLED=false` está documentada en `design.md`
    §8 y se agregará a `.env.local.example` manualmente por el humano.
- [-] 5.2 Verificar que el nombre exacto `WHATSAPP_REMINDER_REPLY_ENABLED`
  coincide en `.env.local.example`, `src/lib/citas/reminder-reply-flag.ts` y las
  tareas/design (sin variantes).
  - Verificación:
    `grep -rn "WHATSAPP_REMINDER_REPLY_ENABLED" .env.local.example src/lib/citas/reminder-reply-flag.ts`
    → mismo identificador en ambos, sin sinónimos.
  - **Diferida (parte D):** el cotejo estricto contra `.env.local.example` depende
    de 5.1 (ruta bloqueada). Mitad `src/` verificada: identificador único
    `WHATSAPP_REMINDER_REPLY_ENABLED`, sin variantes, con única lectura de
    `process.env` en `src/lib/citas/reminder-reply-flag.ts:20`.

> **Pendiente (parte C):** 5.1 queda diferido al padre (`.env.local.example` está
> bloqueado por la política de seguridad del harness: no se leen rutas `.env*`).
> 5.2 no puede cerrarse mientras 5.1 no agregue la línea: la mitad `src/` está
> verificada (identificador único `WHATSAPP_REMINDER_REPLY_ENABLED`, sin variantes,
> única lectura en `src/lib/citas/reminder-reply-flag.ts`), pero la comparación
> contra `.env.local.example` requiere esa ruta.
>
> **Confirmación (parte D):** 5.1 y 5.2 quedan marcadas `[-]` (diferidas) por el
> bloqueo de `.env.local.example`; no hay tarea de documentación de usuario
> adicional en la Fase 5/6 (la única exigencia documental del cambio es la línea
> de entorno, diferida al humano).

**Cobertura de spec:** R11 (Control por feature flag, documentación del default
apagado).

---

## Fase 6 — Verificación global

- [x] 6.1 Ejecutar la suite completa: `npm run test` → **pasa**. Observado
  (parte D): **954/954 (114 archivos)**.
- [x] 6.2 Ejecutar el typecheck: `npx tsc --noEmit` → sin errores. Observado
  (parte D): exit 0, sin salida.
- [x] 6.3 Ejecutar el build: `npm run build` → **éxito**. Observado (parte D):
  exit 0, compilación de rutas completada.
- [-] 6.4 Registrar la limitación de lint: `npm run lint` no existe en
  `package.json` (no hay `eslint`); **no** inventar runner, documentar el hueco.
  - Verificación: `node -e "console.log(require('./package.json').scripts.lint)"`
    → `undefined` (observado en la parte D).
  - **Diferida (parte D):** script inexistente en `package.json` (gap preexistente).
- [x] 6.5 Verificación de apagado seguro: confirmar que el commit llega con el
  flag apagado por default (ni `true` harcodeado ni `process.env` leído fuera de
  `reminder-reply-flag.ts`).
  - Verificación:
    `grep -rn "WHATSAPP_REMINDER_REPLY_ENABLED" src/ | grep -v "eve-flag"` →
    única lectura en `src/lib/citas/reminder-reply-flag.ts`.
  - Observado (parte D): única lectura de `process.env` en
    `src/lib/citas/reminder-reply-flag.ts:20`; el resto de coincidencias en `src/`
    son el comentario del módulo y el nombre en su prueba. Flag default **off**.

---

## Matriz de cobertura de specs

Los 14 requisitos de los tres deltas quedan mapeados a tareas:

| # | Requisito (delta) | Tareas |
|---|---|---|
| R1 | Detección del contexto de recordatorio activo (`appointment-reminder-reply`) | 2.1, 2.2, 2.5, 2.6 |
| R2 | Confirmación determinista y tolerante | 1.1, 1.2, 4.1 |
| R3 | Clasificación de intención verificable | 1.1, 1.2, 4.1 |
| R4 | Transición a `confirmed` y acuse con datos reales | 1.3, 1.4, 2.3, 2.4, 2.5, 2.6 |
| R5 | Cancelación desde el recordatorio | 2.5, 2.6, 2.7 |
| R6 | Ambigüedad clínica escala y no toca el estado | 1.1, 1.2, 2.5, 2.6, 4.2 |
| R7 | Citas inexistentes o terminales nunca se modifican | 2.3, 2.4, 2.5, 2.7 |
| R8 | Respuesta fuera de ventana con escalación a humano | 2.5, 2.6, 2.7 |
| R9 | Rastro auditable de la transición | 2.1, 2.2, 2.3, 2.4 |
| R10 | Idempotencia de las respuestas repetidas | 2.5, 2.7, 3.5, 4.5 |
| R11 | Control por feature flag | 3.1, 3.2, 3.5, 3.6, 3.7, 5.1, 5.2 |
| R12 | Precedencia de la sesión de flow engine activa (`appointment-reminder-reply`) | 3.3, 3.4, 3.5, 3.6, 4.3 |
| R13 | Precedencia de la sesión de flujo activa (`flow-engine`) | 3.3, 3.4, 3.5, 3.6, 4.3 |
| R14 | Respuestas a recordatorio antes de la clasificación general (`whatsapp-inbound-automation`) | 3.5, 3.6, 4.4, 4.5 |

---

## Workload Forecast

| Campo | Valor |
|---|---|
| Tareas | 31 checkboxes en 6 fases de verificación (toda tarea de implementación precedida por su RED) |
| Archivos nuevos | 12 — 5 de implementación + 7 de prueba |
| Archivos modificados | 3 — `src/lib/whatsapp/inbound-service.ts`, `src/lib/whatsapp/orchestrator.ts`, `.env.local.example` |
| Líneas modificadas estimadas | ~1,400–2,000 (implementación ~650–850; pruebas ~700–1,050; env ~5) |
| Casos de prueba estimados | ~70–95 (clasificación/eligibilidad/rastro ~33, mensajes ~8, flag ~6, transición ~8, servicio ~14, sesión de flujo ~6, integración/aceptación ~10) |
| Riesgo de tamaño de review | **Alto** — supera el umbral de 400 líneas de `chained-pr` |
| Riesgo técnico | **Medio** — append no atómico de `notes`, doble fila inbound al escalar (trade-off documentado en `design.md`) y falsos positivos de teléfono acotados por ventana + estado elegible |
| Riesgo de runner | `npm run lint` no existe en `package.json`; hueco de verificación, no del cambio |

**Estrategia de entrega:** las fases 1–3 ya trazan los cortes naturales de una
cadena de PRs (1. clasificación+mensajes, 2. elegibilidad+transición+servicio,
3. gancho+flag, 4. aceptación+env). Como el forecast supera 400 líneas, se
recomienda PR encadenado por fase; alternativa de PR único requiere
`size:exception`.

Decision needed before apply: Yes

El cambio supera el presupuesto de 400 líneas de `chained-pr`; antes del
Apply hay que decidir si se entrega como cadena de PRs por fase (recomendado) o
como PR único con `size:exception` aprobada.

**Chained PRs recommended:** Yes
**400-line budget risk:** High
