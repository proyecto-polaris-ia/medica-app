# Change: Onboarding pre-cita por WhatsApp (historia clínica básica y datos generales)

## Why

Hoy el consultorio recaba la información que más necesita **en el peor
momento**: cuando el paciente ya está sentado en el sillón. En la primera
consulta, recepción y el doctor preguntan a prisa alergias, medicamentos,
condiciones relevantes y datos de contacto que faltan, y el expediente arranca
incompleto o se llena a mano después. Un dato omitido (una alergia, un
anticoagulante, un embarazo) es un riesgo clínico real.

Eva (el agente de WhatsApp del consultorio) ya conversa con el paciente para
resolver dudas y agendar citas. Este cambio la extiende para que, **antes de la
primera cita**, recolecte de forma determinista los datos clínicos básicos y los
datos generales que hoy se improvisan en el mostrador. El paciente llega a la
consulta con su expediente **iniciado**, y la historia clínica se llena sola.

Es la materialización del **agente de onboarding** del documento 07 del plan del
cliente, integrado al agente de WhatsApp existente (Eva) a través del path
determinista de flow engine: el LLM **interpreta y redacta**, pero el backend
decide el orden de las preguntas, valida y ejecuta la escritura. Cubre el issue
[#90](https://github.com/proyecto-polaris-ia/medica-app/issues/90).

## What Changes

Entrega incremental en **tres fases con PRs apilados**, cada una revisable por
separado (patrón establecido en los issues #88, #89 y #91).

### Fase 1 — Historia clínica básica del paciente nuevo

- **Disparador determinista:** se inicia el onboarding cuando el paciente es
  nuevo o no tiene fila en `patient_medical_history` **y** tiene una cita futura
  en estado `confirmed` o `pending`.
- **Preguntas cerradas y literales**, una por turno, en orden fijo:
  1. ¿Tiene alergias? (sí/no) y, si sí, ¿cuáles?
  2. ¿Toma algún medicamento actualmente? (sí/no) y, si sí, ¿cuáles?
  3. ¿Tiene alguna condición médica relevante? (sí/no) y, si sí, ¿cuál?
  4. Embarazo (solo si aplica por sexo/edad); si no aplica, se omite.
  5. Hábitos (tabaco, alcohol), con opciones cerradas.
- **El LLM solo redacta** el resumen; no clasifica, no interpreta y no avanza
  estados por sí mismo. Las listas viven en `FlowState.metadata` (las entidades
  del flow engine son escalares hoy).
- **Resumen + confirmación:** al terminar, el agente muestra un resumen fiel de
  lo capturado y pide confirmación explícita. **Solo tras la confirmación** se
  ejecuta una **escritura única y atómica** a `patient_medical_history`
  (all-or-nothing; el upsert hoy es full-replace).
- **Provenance:** los registros capturados por WhatsApp se marcan como
  **autoreporte del paciente**. Hoy `patient_medical_history` (migración `0013`)
  no tiene campo de procedencia, así que se agrega una **migración aditiva**
  nueva con una columna de provenance (ver Decisions) más su `down` migration.

### Fase 2 — Completado de datos generales

- El mismo flujo detecta campos faltantes del paciente (principalmente
  **email**, y contacto si aplica) y los pide dentro de la misma conversación.
- Escritura determinista a `patients` (la columna `email` ya existe, migración
  `0011`), sin tocar la historia clínica.
- Si el paciente ya no es "nuevo" pero le faltan datos generales, aplica solo
  esta parte; nunca se re-escribe historia clínica ya capturada por staff.

### Fase 3 — Nudges y visibilidad en el panel

- **Nudge de onboarding pendiente:** si hay onboarding pendiente, se envía un
  recordatorio amable ("te faltan tus datos médicos, ¿los completamos?").
  **La plantilla HSM `recordatorio_cita` tiene parámetros congelados:** el nudge
  **MUST** ser un mensaje/plantilla **separado**, nunca un parámetro anexado a
  la plantilla congelada. El disparo va después del recordatorio, sin modificar
  `send-appointment-reminder.ts` ni el contrato aprobado en Meta.
- **Badge de onboarding en el expediente:** nuevo componente hermano de
  `MedicalHistoryBadge.tsx` que muestra `pendiente` / `completo`, renderizado en
  `PatientRecordTabs.tsx`. Superficie **aditiva**; no altera el badge de
  advertencia clínica ni el resto de pestañas.

## Capabilities

### New Capabilities

- `whatsapp-onboarding`: Flujo conversacional determinista de onboarding
  pre-cita (Fases 1–2). Incluye el disparador (paciente nuevo/sin historia + cita
  futura), las preguntas cerradas, el resumen con confirmación, la escritura
  única y atómica a `patient_medical_history` marcada como autoreporte, el
  completado de datos generales en `patients`, la escalación a humano ante
  urgencia y el gating por feature flag. Spec nueva en
  `openspec/specs/whatsapp-onboarding/spec.md`.
- `patient-onboarding-status`: Estado determinista de onboarding (pendiente /
  completo) y su visibilidad. Incluye la derivación del estado, el **nudge
  separado** (nunca dentro de `recordatorio_cita`) y el badge del expediente.
  Spec nueva en `openspec/specs/patient-onboarding-status/spec.md`.

### Modified Capabilities

- `flow-engine`: El motor **MUST** soportar un flujo de onboarding con una nueva
  acción en el union cerrado `FlowResult.action`, registrarla en el registry de
  flujos y reconocer el nombre del flujo en el control de tema. El contrato
  existente de los flujos de reserva no cambia.
- `whatsapp-inbound-automation`: El pipeline de entrada **MUST** poder iniciar y
  continuar el onboarding dentro del path de flow engine, y **MUST** pausarlo
  (limpiar `flow_state`) cuando se escala a humano.
- `clinical-record`: `patient_medical_history` **MUST** registrar la procedencia
  del dato (autoreporte del paciente vs. captura por staff) mediante una columna
  aditiva, preservando el contrato 1:1 retrieval/replacement y el badge de
  advertencia clínica existente.
- **No modificadas (criterio aditivo, precedente `patient-clinical-files`):**
  `appointment-reminders` (el nudge es un mensaje separado; la plantilla
  `recordatorio_cita` y su orden de parámetros quedan intactos) y
  `patient-record-summary` (el badge es una superficie aditiva encapsulada en la
  capability nueva).

## Guardrails (innegociables)

Estas reglas viven en el backend, no solo en el prompt:

- **No diagnósticar.** El onboarding **MUST** registrar literalmente lo que dice
  el paciente; **MUST NOT** interpretar, clasificar, normalizar clínicamente ni
  emitir advertencias clínicas.
- **Urgencia → humano.** Respuestas de dolor fuerte, inflamación severa, alergia
  a anestesia u otra señal de urgencia **MUST** disparar la escalación
  (`escalate-to-human` → `createEveWhatsAppEscalation`) de inmediato y
  **pausar/abortar** el onboarding (limpiar `flow_state`). Nunca se continúa
  recolectando ni escribiendo historia tras una urgencia.
- **Escritura solo con contacto verificado del propio paciente.** El onboarding
  **MUST** exigir el teléfono confiable del canal
  (`requireTrustedWhatsAppPhone` / `selectPatientPhone`), con el mismo criterio
  que las tools de cobranza. **MUST NOT** escribir historia clínica sobre la
  identidad de un tercero.
- **Autoreporte marcado, validado por el doctor.** Toda historia capturada por
  WhatsApp **MUST** quedar marcada como autoreporte del paciente; el doctor la
  valida en consulta. La captura por WhatsApp **MUST NOT** sustituir la
  validación clínica.
- **Escritura atómica.** La historia clínica **MUST** guardarse all-or-nothing
  una sola vez, al confirmar el resumen; **MUST NOT** escribirse parcialmente
  durante la conversación.

## Fuera de alcance (Non-goals)

- Historia clínica dental completa (dentición, odontograma, periodontograma):
  es captura del doctor en consulta.
- Edición clínica desde WhatsApp (modificar/anular historia ya capturada).
- Diagnóstico, consejos clínicos, precios/costos o disponibilidad por WhatsApp.
- Cambios al motor de reserva, al wizard `/appointments/new` o a la plantilla
  `recordatorio_cita` aprobada en Meta.
- Envío masivo de nudges o campañas de marketing.
- Cualquier modificación dentro de `travelhub-app` (regla crítica del repo:
  copiar + adaptar, nunca editar).

## Anclas técnicas (rutas concretas)

- **Flow engine (puro):** `src/lib/flows/flow-engine.ts`; el union cerrado
  `FlowResult.action` vive en `src/lib/flows/types.ts:63`; hoy el único flujo y
  el `flowRegistry` / `getFlowDefinition` están en
  `src/lib/flows/definitions/book-appointment.flow.ts`. Agregar el onboarding
  requiere **types + orchestrator + registry**. `FlowState.entities` solo admite
  escalares → las listas van en `metadata`.
- **Control de flujo:** `src/lib/flows/flow-control.ts` (`detectTopicChange` y
  el mapa `flowNames` están hardcodeados a booking) → requiere extensión.
- **Orquestador:** `src/lib/whatsapp/orchestrator.ts` (switch de
  `executeFlowAction`, `FLOW_TIMEOUT_MINUTES = 30`); la expiración limpia el
  `flow_state`. El `flow_state` se persiste desde
  `src/lib/whatsapp/inbound-service.ts` vía `store.updateConversationFlowState`.
- **Gate / feature flag:** `isFlowEngineEnabled()` en `src/lib/whatsapp/inbound-service.ts`
  (`WHATSAPP_FLOW_ENGINE_ENABLED`) es el patrón a seguir para el gating del
  onboarding.
- **Escalación:** `agent/tools/escalate-to-human.ts` →
  `src/lib/whatsapp/eve-escalation.ts`; la conversación pasa a `status:
  'escalated'` en `inbound-service.ts`. **Pausar = limpiar `flow_state`.**
- **Datos clínicos:** `patient_medical_history` (migración
  `0013_clinical_record.sql`, 1:1 con `patients`; `upsertMedicalHistory` es
  full-replace con validación estricta en `src/lib/admin/medical-history.ts`) —
  hoy **sin campo de provenance** → migración aditiva nueva.
- **Datos generales:** `patients.email` (migración `0011_patient_email_contact.sql`).
- **Identidad verificada:** `agent/trusted-contact-context.ts`
  (`requireTrustedWhatsAppPhone`); `agent/tools/resolve-patient.ts` devuelve
  `isNew` y `email`, señales de las Fases 1–2.
- **Recordatorios:** `src/lib/citas/send-appointment-reminder.ts` (issue #86,
  slice 1/3, ya merged); plantilla congelada documentada en
  `docs/plantilla-hsm-recordatorio-cita.md`; precedente de hook de respuesta en
  `inbound-service.ts` (`processReminderReplyHook`).
- **Panel:** `src/components/admin/patient-record/MedicalHistoryBadge.tsx`
  (badge de advertencia condicional) + `PatientRecordTabs.tsx` (render de tabs y
  punto de inserción del badge hermano).

## Decisions

| Decisión | Valor | Razón |
|---|---|---|
| Provenance de la historia clínica | Columna aditiva `source text` con valores `patient_autoreport` / `staff`, default `staff` (alternativa considerada: `patient_autoreported boolean`) | No existe campo hoy; `source` deja espacio a futuras procedencias (staff, migración) sin otra migración. `design.md` finaliza el nombre exacto. |
| Migración | Nueva migración **timestamped** `supabase/migrations/YYYYMMDDHHMMSS_patient_medical_history_source.sql` + `supabase/migrations/down/YYYYMMDDHHMMSS_*.down.sql` (timestamp UTC al crear el archivo) | Convención vigente del repo (numeración secuencial deprecada). Columna nullable/aditiva → rollback simple. |
| Escritura de historia | Única y atómica al confirmar el resumen, reutilizando `upsertMedicalHistory` con la provenance de onboarding | Evita estados parciales; el resumen confirmado es el punto de verdad. |
| Disparador | Paciente nuevo/sin `patient_medical_history` **y** cita futura `confirmed`/`pending` | Corrige el problema real (primera cita) sin molestar a pacientes con expediente. |
| Listas (alergias/medicamentos/condiciones) | En `FlowState.metadata`, serializadas; el determinista las parsea | `ExtractedEntities` solo admite escalares. |
| Pausa del onboarding | Limpiar `flow_state` tras escalar | No existe estado "paused"; la conversación queda `escalated`. |
| Nudge | Mensaje/plantilla **separada**, aguas abajo del recordatorio | La plantilla `recordatorio_cita` tiene parámetros congelados y aprobados en Meta; anexar un parámetro la invalidaría. |
| Feature flag | `WHATSAPP_ONBOARDING_ENABLED` (default **off**), estilo `isFlowEngineEnabled()`, además del path de flow engine | Apagado = comportamiento actual; encendido tras verificar. |
| Capabilities | Nuevas `whatsapp-onboarding` y `patient-onboarding-status`; modificadas `flow-engine`, `whatsapp-inbound-automation`, `clinical-record` | Nombres según la convención de las propuestas archivadas (`follow-up`, `appointment-reminders`, `patient-clinical-files`). |
| Entrega | PRs apilados por fase | Revisión incremental y riesgo acotado por fase. |

## Impacto

Archivos esperados (sin modificar `travelhub-app`):

| Área | Impacto | Descripción |
|---|---|---|
| `src/lib/flows/definitions/onboarding.flow.ts` | New | Definición del flujo de onboarding (estados, preguntas cerradas, transiciones y confirmación). |
| `src/lib/flows/types.ts` | Modified | Nueva acción en el union `FlowResult.action` (p. ej. `saveOnboarding`). |
| `src/lib/flows/definitions/book-appointment.flow.ts` | Modified | Registrar el flujo de onboarding en el `flowRegistry`. |
| `src/lib/flows/flow-control.ts` | Modified | `flowNames` / control de tema reconoce el flujo de onboarding. |
| `src/lib/whatsapp/orchestrator.ts` | Modified | `executeFlowAction` maneja la acción nueva e inicia/continúa el onboarding. |
| `src/lib/whatsapp/inbound-service.ts` | Modified | Gating por flag y persistencia de `flow_state`; pausa al escalar. |
| `src/lib/admin/medical-history.ts` + `src/lib/admin/types.ts` | Modified | Soporte de provenance y helper de escritura atómica del onboarding. |
| `src/lib/admin/patients.ts` | Reused / Modified | Lectura de campos faltantes y escritura de `email`/contacto (Fase 2). |
| `agent/tools/resolve-patient.ts` + `agent/trusted-contact-context.ts` | Reused | Señales `isNew`/`email` y verificación de teléfono confiable. |
| `supabase/migrations/YYYYMMDDHHMMSS_patient_medical_history_source.sql` | New | Columna aditiva de provenance en `patient_medical_history`. |
| `supabase/migrations/down/YYYYMMDDHHMMSS_*.down.sql` | New | Reverso estructural de la columna. |
| Nudge (módulo separado / plantilla nueva) | New | Envío del nudge de onboarding pendiente sin tocar `recordatorio_cita`. |
| `src/components/admin/patient-record/OnboardingStatusBadge.tsx` | New | Badge `pendiente` / `completo` (hermano de `MedicalHistoryBadge`). |
| `src/components/admin/patient-record/PatientRecordTabs.tsx` | Modified | Render aditivo del badge de onboarding. |
| `src/lib/flows/__tests__/`, `src/lib/admin/__tests__/medical-history.test.ts`, `src/lib/whatsapp/__tests__/` | Modified / New | Tests puros del flow engine, de la escritura con provenance y del gating/dormancia. |

**Impacto en pruebas:** el flow engine es puro y se prueba sin mocks
(`src/lib/flows/__tests__/`); la capa de datos usa `vi.mock` de
`getSupabaseAdmin` (`src/lib/admin/__tests__/medical-history.test.ts`); el
inbound se prueba con options inyectadas
(`src/lib/whatsapp/__tests__/inbound-service*.test.ts`). Se agregan casos de
escritura atómica, provenance de autoreporte, escalación que pausa el onboarding
y respeto del flag apagado.

## Rollback plan

- **Cada fase es revertible por separado.** Revertir Fase 3, Fase 2 y Fase 1
  restaura el comportamiento actual sin tocar reserva, historia clínica existente
  ni panel.
- **La migración es aditiva.** La columna `source` es nullable con default
  `staff`; las filas existentes conservan su semántica. El `down` migration
  elimina la columna. No hay pérdida de datos en tablas existentes.
- **El flujo es opt-in por feature flag.** `WHATSAPP_ONBOARDING_ENABLED` (default
  **off**, patrón `isFlowEngineEnabled()`): apagarlo desactiva el onboarding sin
  deploy; con el flag apagado el comportamiento es idéntico al actual.
- **El badge del panel es aditivo.** Ocultarlo/revertirlo no afecta ninguna otra
  pestaña ni el badge de advertencia clínica.
- **El nudge es un mensaje separado.** Revertirlo no toca la plantilla
  `recordatorio_cita` ni el cron de recordatorios ya entregado (#86).

## Riesgos

- **Escritura clínica sin validación humana.** Mitigación: marca de autoreporte +
  validación del doctor en consulta + guardrail de no-diagnóstico.
- **Omitir o falsear provenance.** Mitigación: la escritura de onboarding fija la
  provenance en el backend; el default `staff` evita atribuir mal datos viejos.
- **Urgencia detectada a medias.** Mitigación: ante señal de urgencia se escala y
  se limpia `flow_state`; nunca se guarda historia parcial.
- **Colisión de la plantilla congelada.** Mitigación: nudge como mensaje/plantilla
  aparte, jamás un parámetro nuevo en `recordatorio_cita`.
- **Abandono a medio onboarding.** Mitigación: el estado vive en `flow_state`
  (con timeout de 30 min) y el nudge de Fase 3 retoma el pendiente.
- **Identidad de tercero.** Mitigación: `requireTrustedWhatsAppPhone` como
  requisito duro de escritura.
- **Colisión de migración.** Otra rama puede crear la misma columna; mitigación:
  `ADD COLUMN IF NOT EXISTS`, diffs aditivos y verificación de dependencia contra
  el esquema real (convención vigente).

## Criterios de éxito

- [ ] El onboarding se inicia solo para paciente nuevo/sin historia **con** cita
      futura `confirmed`/`pending`.
- [ ] Las preguntas son cerradas y el orden lo decide el determinista; el LLM
      solo redacta.
- [ ] La historia clínica se escribe **una sola vez**, all-or-nothing, tras la
      confirmación del resumen, y queda marcada como autoreporte del paciente.
- [ ] Una respuesta de urgencia escala a humano y pausa/aborta el onboarding sin
      escribir historia.
- [ ] No se escribe historia clínica sin teléfono confiable del propio paciente.
- [ ] El completado de datos generales (email/contacto) escribe en `patients`
      sin tocar la historia clínica.
- [ ] El nudge de onboarding es un mensaje/plantilla separado; `recordatorio_cita`
      no cambia.
- [ ] El expediente muestra el badge de onboarding `pendiente`/`completo`.
- [ ] Con el feature flag apagado, el comportamiento es idéntico al actual.
- [ ] `npm run test`, `npx tsc --noEmit` y `npm run build` en verde.
