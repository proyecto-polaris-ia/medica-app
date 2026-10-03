# Change: Confirmación de cita en un toque desde el recordatorio

## Why

Hoy los recordatorios de cita (#86) son solo de salida: el paciente recibe el
mensaje H-24 / día mismo, pero si responde "1", "sí" o "confirmo" esa respuesta
cae al pipeline genérico de WhatsApp y se clasifica como un mensaje nuevo. Nadie
cierra el loop, así que una cita que el paciente ya confirmó sigue en
`requested` / `pending` hasta que recepción la marca a mano, y el consultorio
sigue expuesto a `no_show` y a trabajo manual.

Este cambio cierra el ciclo con acciones **deterministas**: el LLM interpreta el
lenguaje, pero el backend decide y ejecuta la transición de estado. Cubre el
issue [#87](https://github.com/proyecto-polaris-ia/medica-app/issues/87) (fases
1–3) y complementa el recordatorio ya entregado por #86.

## What Changes

### Fase 1 — Confirmación en un toque

- Pre-chequeo determinista en el path de flow engine, **antes** de la
  clasificación de intent y sin depender del LLM: reutiliza
  `detectConfirmation` / `detectCancellation` de `src/lib/flows/flow-control.ts`.
- Si el mensaje es una confirmación simple y hay una cita elegible, transiciona
  `requested | pending` → `confirmed` y responde con un acuse breve.
- Sin humano, sin LLM en la decisión; la ambigüedad nunca confirma.

### Fase 2 — Cancelación desde el recordatorio

- Intención de cancelación → `requested | pending | confirmed` → `cancelled`,
  con el texto libre del paciente (motivo) anexado a `appointments.notes`.
- Escalación suave a humano (Eva) vía `createEveWhatsAppEscalation`, ofreciendo
  reagendar. La respuesta al paciente y la alerta humana se persisten.

### Fase 3 — Coexistencia con el flow engine

- Si existe una sesión de flow engine activa (no `complete`, no expirada), la
  sesión gana: el chequeo de respuesta a recordatorio **no** corre y el mensaje
  sigue el flujo normal de reserva.
- El chequeo corre solo sin sesión activa y bajo el feature flag
  `WHATSAPP_REMINDER_REPLY_ENABLED` (default **off**, ver rollback).
- Idempotencia por el ledger de mensajes (id único del proveedor) más una
  actualización de estado guardada por el estado origen.

## Impacto y capacidades

### New Capabilities

- `appointment-reminder-reply`: Manejo determinista de respuestas entrantes a
  recordatorios de cita (confirmar, cancelar, ambiguo) con transiciones de estado
  acotadas, rastro en `appointments.notes`, escalación a humano y feature flag.

### Modified Capabilities

- `flow-engine`: Regla de precedencia — una sesión activa y no expirada MUST
  tener prioridad sobre el manejo de respuestas a recordatorio.
- `whatsapp-inbound-automation`: El pipeline de entrada MUST reconocer respuestas
  a recordatorio en el path de flow engine/legacy, antes de la clasificación
  general; la ventana y la idempotencia se rigen por el ledger de mensajes.

| Área | Impacto | Descripción |
|---|---|---|
| `src/lib/citas/` | New | Módulo de respuesta a recordatorio: elegibilidad, parseo, transición guardada y rastro. |
| `src/lib/whatsapp/orchestrator.ts` (`orchestrate`) | Modified | Pre-chequeo cuando no hay sesión activa y el flag está encendido. |
| `src/lib/whatsapp/inbound-service.ts` (`processWithFlowEngine`) | Modified | Invocación del módulo dentro del path de flow engine. |
| `src/lib/whatsapp/eve-escalation.ts` | Reused | `createEveWhatsAppEscalation` para la escala suave por cancelación. |
| `src/lib/flows/flow-control.ts` | Reused | `detectConfirmation` / `detectCancellation`. |
| `appointments.status` + `appointments.notes` | Reused | Estados y rastro; sin columnas nuevas (reutiliza `notes`). |
| `.env.local.example` | Modified | Documenta `WHATSAPP_REMINDER_REPLY_ENABLED=false`. |
| Path Eve (`WHATSAPP_EVE_ENABLED=true`) | Out of scope | Este cambio aplica al path flow-engine/legacy; Eve queda como pregunta abierta. |

## Decisions

| Decisión | Valor | Razón |
|---|---|---|
| Transiciones permitidas | `requested,pending` → `confirmed`; `requested,pending,confirmed` → `cancelled` | Godo acotado; los estados terminales `cancelled/rescheduled/no_show/attended` nunca se tocan. |
| Ventana de respuesta (N) | **36 h** desde `appointment_reminders.sent_at` | Cubre el H-24 con holgura y no reclasifica mensajes viejos. |
| Fuera de ventana o sin recordatorio reciente | No hay transición; se trata como mensaje general y se escala a humano | Evita confirmaciones accidentales y respeta la ventana de 24 h de Meta. |
| Ambigüedad (confirmación + dolor/urgencia/infección/alergia/receta) | Escalar a humano y **no** tocar el estado de la cita | Guardrail clínico innegociable (regla dura de negocio). |
| Idempotencia | Ledger de mensajes (id único de proveedor) + `UPDATE ... WHERE status IN (...)` | Un doble webhook o doble respuesta no duplican ni revierten el estado. |
| Rastro ("quién") | Anexar a `appointments.notes`: `[YYYY-MM-DD HH:mm America/Mexico_City] Confirmada/Cancelada desde recordatorio (quién: sistema/recordatorio). Motivo: <texto libre>` | Trazabilidad auditable sin migración nueva; reutiliza `notes` (0007). |
| Helper de transición | Nuevo helper status-only junto a `updateAppointment` (que hoy es full-row) | `updateAppointment` exige fila completa; se necesita un update acotado. |
| Feature flag | `WHATSAPP_REMINDER_REPLY_ENABLED` (default off) | Apagado = comportamiento actual; encendido tras verificar. |

## Fuera de alcance (Non-goals)

- Los recordatorios mismos (envío, cadencias, plantilla Meta): ya cubiertos por
  #86.
- Sugerencias de reacomodo de agenda de Nora (reprogramación automática de
  huecos).
- Cambios a Eva conversacional (prompt, tools) y al path Eve
  (`WHATSAPP_EVE_ENABLED`).
- Nuevas columnas de auditoría o migraciones: se reutiliza `appointments.notes`.
- Diagnóstico, precios o disponibilidad por WhatsApp.

## Riesgos y plan de reversión

- **Riesgo — falsos positivos:** un "sí" fuera de contexto confirmaría una cita.
  Mitigación: ventana de 36 h + recordatorio reciente + estado elegible +
  guardia de ambigüedad clínica.
- **Riesgo — carrera con el flow engine:** mitigado dando prioridad a la sesión
  activa y guardando la transición por estado origen.
- **Rollback:** nuevo feature flag `WHATSAPP_REMINDER_REPLY_ENABLED`, default
  **off** hasta verificar en producción. Apagarlo restaura el comportamiento
  actual sin deploy ni migración. La tabla `appointment_reminders` y `notes` no
  cambian su contrato; revertir el commit restaura el estado previo.

## Criterios de éxito

- [ ] Un "1" / "sí" / "confirmo" sobre una cita elegible la marca `confirmed`
      sin intervención humana y responde un acuse.
- [ ] Una cancelación marca `cancelled`, anexa el motivo en `appointments.notes`
      y escala a humano ofreciendo reagendar.
- [ ] Con una sesión de flow engine activa, el mensaje sigue el flujo de reserva
      y no toca ninguna cita.
- [ ] Un mensaje ambiguo (confirmación + síntoma) escala a humano y no cambia el
      estado.
- [ ] Con el flag apagado, el comportamiento es idéntico al actual.
