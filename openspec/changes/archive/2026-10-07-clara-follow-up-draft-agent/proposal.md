# Change: Redacción de borradores de seguimiento con aprobación humana (Clara, Fase 2)

## Why

Hoy el consultorio ya tiene la lista diaria determinista de pacientes a contactar
([#89](https://github.com/proyecto-polaris-ia/medica-app/issues/89), spec
`follow-up`): no-shows recuperables, tratamientos inconclusos, pacientes
inactivos y presupuestos sin respuesta. Pero la secretaria **redacta cada
mensaje a mano** desde el panel. Es trabajo repetitivo y lento, y la
personalización (tono cálido, contexto del paciente, español de México) es justo
donde un LLM ayuda **sin ceder decisiones clínicas ni comerciales**: el LLM
redacta texto, el backend sigue decidiendo y ejecutando.

Este cambio entrega la **Fase 2 del épico #140** (separación de agentes):
convertir a **Clara** en una capacidad **interna/admin** que hereda la lista
determinista existente y aporta **redacción de borradores** y, opcionalmente,
explicación/priorización del orden sugerido — siempre con aprobación humana
obligatoria. Reutiliza la spec `follow-up` (16 requirements / 48 escenarios)
como base invariante y **no altera** las reglas de segmentación, la
deduplicación ni la prioridad de motivos.

## What Changes

- Clara expone una **capacidad de redacción interna** (no un canal de WhatsApp
  propio) que **consume la salida de `src/lib/admin/follow-up/` sin
  modificarla**: recibe el caso ya calculado (`patientId`, `patientName`,
  `reason`) y devuelve texto de borrador.
- La generación de texto por paciente **pasa por el LLM** para redactar un
  mensaje cálido en español de México, **reemplazando o aumentando** el camino
  actual de plantilla determinista (`buildFollowUpDraft`).
- La **plantilla determinista se conserva como fallback**: si el LLM no está
  configurado, falla o su salida no pasa los guardrails, el borrador se genera
  por plantilla. Ninguna ejecución de Clara deja al paciente sin borrador por
  falta de LLM.
- Todo borrador pasa por los guardrails existentes
  (`validateFollowUpDraftText`: precios, términos clínicos, presión comercial,
  longitud) **antes de persistir**.
- Los borradores se guardan en el **estado existente** de
  `follow_up_message_drafts` con estatus `draft`, alimentando el flujo actual de
  `whatsapp-command-center/follow-up-drafts` con **aprobación humana
  obligatoria**. El envío sigue siendo el transporte existente, solo tras
  aprobación explícita.
- Se habilita **editar el texto del borrador** en la superficie de aprobación
  (hoy solo existe aprobar / rechazar / enviar), de modo que la secretaria pueda
  ajustar la redacción del LLM antes de aprobar.
- **Las reglas de la lista, la deduplicación y la prioridad de motivos siguen
  siendo 100% deterministas.** El LLM NO participa en qué pacientes aparecen, en
  su orden canónico ni en las transiciones de estado. Si Clara "prioriza" o
  "explica", lo hace como **texto asesor** y nunca como reescritura del orden
  determinista.
- Clara **no envía** WhatsApp: no tiene canal propio y no ejecuta el envío.

### Alcance

- Backend: nueva capacidad/servicio de redacción que usa los patrones LLM
  existentes (provider OpenAI-compatible de `agent/model.ts`, env
  `WHATSAPP_AGENT_LLM_API_KEY/BASE_URL/MODEL`) y **degrada con gracia** cuando
  falten las llaves.
- API admin: ruta autenticada para generar (y regenerar) el borrador de un
  paciente de la lista, y para editar su texto mientras esté en `draft`.
- Panel admin: acción en `app/(admin)/follow-up/` y en
  `whatsapp-command-center/follow-up-drafts` para generar y editar borradores.
- Spec: deltas sobre `follow-up` (ver Capabilities) y spec nueva `clara-drafting`.

### Fuera de alcance (Non-goals)

- Conectar WhatsApp directo a Clara (ningún binding de canal para Clara).
- Envío automático, programado o masivo de cualquier mensaje.
- Cambiar las reglas de segmentación, la deduplicación por paciente o la
  prioridad de motivos.
- Diagnóstico, consejo clínico, precios o disponibilidad inventada.
- Cambios al motor de reserva o al wizard `/appointments/new`.
- Cambios a Eva (`WHATSAPP_EVE_ENABLED`) ni al path Eve conversacional.
- Cualquier modificación dentro de `travelhub-app` (regla crítica del repo:
  copiar + adaptar, nunca editar).

## Decisión diferida a design.md

La **superficie del agente** se resuelve en `design.md`, no aquí. Opciones:
subagente declarado en el runtime Eve (`agent/subagents/<id>/`), job/servicio
interno, o **capacidad server-side fuera del runtime Eve**.

Recomendación desde `exploration.md`: **capacidad server-side**, consistente con
la decisión "**sin agente autónomo**" de #89
(`openspec/changes/archive/2026-10-03-clara-daily-contact-list/proposal.md:14,
:118`) y con `architecture.md` §3.2 ("Clara y Nora NO son subagentes: son
capacidades admin/jobs"). #148 dice "agente interno admin", lo que apunta a lo
mismo. El change deberá **reconciliar** explícitamente esta elección con la
topología multiagente de #140.

## Capabilities

### New Capability: `clara-drafting`

Capacidad interna/admin de redacción de borradores de seguimiento. Consume los
casos ya calculados por `src/lib/admin/follow-up/` y produce texto por paciente
con LLM, con la plantilla determinista como fallback y los guardrails
existentes como barrera. No participa en reglas, deduplicación, prioridad ni
envío; todo borrador queda en `draft` para aprobación humana. Spec nueva en
`openspec/changes/clara-follow-up-draft-agent/specs/clara-drafting/spec.md`.

### Modified Capability: `follow-up`

Se esperan deltas **MODIFIED** sobre los siguientes requirements vigentes de
`openspec/specs/follow-up/spec.md` (confirmar en la fase spec):

- **`Generación de borrador determinista`** — es el requirement central a
  modificar. Hoy obliga redacción **100% por plantilla** y asume que el LLM no
  participa. Debe reescribirse a un requirement de generación de borrador que
  permita redacción asistida por LLM **conservando** las plantillas como camino
  por defecto/fallback, los mismos guardrails y la persistencia en estado
  `draft`.
- **`Tono y guardrails de los textos`** — MODIFIED para dejar explícito que los
  guardrails (sin diagnósticos, prescripciones, precios ni disponibilidad
  inventada) aplican **por igual** a texto generado por plantilla y por LLM, y
  que se revalidan antes de persistir y antes de enviar.
- **`Aprobación humana explícita del borrador`** — evaluar MODIFIED para
  incorporar la **edición humana** del texto mientras el borrador está en
  `draft`, sin relajar el ciclo de vida
  `draft → approved/rejected → sent/sent_failed` ni habilitar envío automático.

Además, el **párrafo de Purpose** de la spec ("El LLM no participa...") debe
actualizarse: las **reglas** siguen siendo deterministas y sin LLM; la
**redacción** deja de ser exclusivamente determinista. Esto no es un requirement,
pero el delta de spec MUST corregirlo para no contradecirse.

Invariantes que **NO** se modifican: los cuatro segmentos, `Deduplicación por
paciente con motivo principal`, `Determinismo y umbrales configurables`,
`Exclusión de pacientes ya contactados o descartados en la ronda` y `Envío solo
tras aprobación por el transporte existente`.

## Impacto

| Área | Impacto | Descripción |
|---|---|---|
| `src/lib/admin/follow-up/` | Reused (invariante) | Reglas, deduplicación, prioridad, `drafts.ts` y `types.ts` se consumen sin cambios. |
| `src/lib/admin/follow-up/draft.ts` | Modified | La plantilla determinista pasa a ser el fallback del nuevo camino LLM; `validateFollowUpDraftText` se reutiliza como guardrail. |
| Capacidad de redacción de Clara | New | Servicio server-side que arma el prompt con datos del caso, invoca el LLM bajo demanda (por paciente), valida la salida y cae a plantilla si falla. |
| `app/api/admin/follow-up/drafts/route.ts` | Modified | `POST` deja de invocar solo `buildFollowUpDraft`; usa el camino LLM con fallback. |
| `app/api/admin/follow-up/drafts/[id]/route.ts` | Modified | Nueva acción de edición del texto en `draft`. |
| `app/(admin)/follow-up/` | Modified | Acción para generar/regenerar borrador desde el caso. |
| `whatsapp-command-center/follow-up-drafts/` | Modified | UI de edición del borrador antes de aprobar (flujo de aprobación/envío intacto). |
| `openspec/specs/follow-up/spec.md` | Modified (delta) | Deltas MODIFIED descritos arriba. |
| `openspec/specs/clara-drafting/` | New | Spec de la capacidad de redacción. |
| `follow_up_message_drafts` (migración) | Modified (aditiva) | Columnas de auditoría de edición `edited_by`/`edited_at` (nullable), migración nueva. |
| `src/lib/whatsapp/client.ts` / `src/lib/follow-up/send-follow-up-draft.ts` | Reused (invariante) | El envío aprobado sigue usando el transporte y el ledger existentes. |
| `travelhub-app` | Sin cambios | Regla crítica del repo. |

### Riesgos

- **Alucinación del LLM (precios o términos clínicos).** Mitigación: todo texto
  pasa por `validateFollowUpDraftText` antes de persistir; si un texto viola un
  guardrail, se descarta y se usa la plantilla determinista.
- **Borrador interpretado como envío.** Mitigación: el ciclo de vida no cambia;
  todo borrador nace en `draft` y exige aprobación humana explícita.
- **Degradación sin llaves del LLM.** Mitigación: fallback a plantilla
  determinista; la lista y los borradores siguen funcionando aunque el LLM no
  esté configurado.
- **Costo y latencia por llamada al LLM.** Mitigación: acotar la generación
  (por demanda o lote acotado — ver Preguntas abiertas) y reutilizar el provider
  existente.
- **Deriva de alcance hacia reglas.** Mitigación: el consumo de
  `src/lib/admin/follow-up/` es de solo lectura; las reglas y la prioridad no se
  tocan y quedan cubiertas por sus pruebas actuales.

## Rollback plan

- **Kill switch de redacción por LLM:** una variable de entorno desactiva el
  camino LLM y fuerza la plantilla determinista, sin tocar datos. Si la
  redacción falla en producción, se apaga la capacidad y el flujo de borradores
  existente queda idéntico al actual.
- **Sin migración destructiva que revertir:** los borradores siguen viviendo
  en `follow_up_message_drafts` con los mismos estados (`draft`, `approved`,
  `rejected`, `sent`, `sent_failed`); la única migración nueva es **aditiva y
  nullable** (columnas de auditoría de edición), sin cambios de comportamiento
  si se revierte el código.
- **Reversión por commit:** revertir el commit de la capacidad de redacción
  restaura `buildFollowUpDraft` como única fuente de texto; el resto del flujo
  (aprobación, envío, transporte) permanece sin cambios.
- **Cero impacto en reglas:** al no modificar `rules.ts`, `follow-up.ts` ni
  `config.ts`, la lista diaria no cambia aunque se revierta o se apague Clara.

## Decisiones de producto (resueltas por el usuario antes de spec)

1. **Generación bajo demanda por paciente.** La secretaria genera el borrador
   desde el caso de la lista; no hay pre-generación en lote de toda la lista.
   Costo mínimo y sin llamadas LLM para pacientes que no se atenderán.
2. **Priorización solo como texto asesor.** Cualquier explicación/priorización
   de Clara es texto complementario; el orden canónico de la lista permanece
   100% determinista y el LLM no lo altera ni reordena la vista.
3. **Edición humana con auditoría.** Se habilita editar el texto del borrador
   en `draft` registrando quién editó y cuándo (columnas `edited_by`/
   `edited_at` en `follow_up_message_drafts`, nueva migración aditiva).

## Criterios de éxito

- [ ] Clara redacta un borrador por paciente a partir del caso ya calculado por
      `src/lib/admin/follow-up/`, sin modificar reglas, deduplicación ni
      prioridad.
- [ ] Todo texto generado por LLM pasa `validateFollowUpDraftText` antes de
      persistir; un texto inválido degrada a la plantilla determinista.
- [ ] Sin llaves de LLM configuradas, la generación de borradores sigue
      funcionando con la plantilla determinista.
- [ ] Los borradores se persisten en `follow_up_message_drafts` en estado
      `draft` y solo se envían tras aprobación humana explícita.
- [ ] La secretaria puede editar el texto del borrador antes de aprobarlo.
- [ ] Ninguna ruta de Clara envía WhatsApp de forma automática o masiva.
- [ ] La spec `follow-up` incorpora los deltas MODIFIED acordados y la spec
      nueva `clara-drafting` queda creada.
- [ ] `npm run test`, `npx tsc --noEmit` y `npm run build` en verde.
