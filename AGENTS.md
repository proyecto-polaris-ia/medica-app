<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may
all differ from your training data. Read the relevant guide in
`node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Reglas para agentes que trabajen en este repo

## Lectura obligatoria antes de tocar código

- `project.md` — contexto de negocio: qué es el proyecto y qué problema resuelve.
- `architecture.md` — contexto técnico: stack, componentes, modelo de datos,
  mapa de reutilización desde TravelHub.

Ambos viven en la raíz.

## Idioma

- Documentación, comentarios y mensajes al cliente en **español de México**
  (neutro/profesional).
- Identificadores y nombres de código en inglés.

## Reutilización desde TravelHub (regla crítica)

Este repo reutiliza el agente inbound de WhatsApp de
`/Volumes/Data Coding/Desarrollo/AI-workspace/travelhub-app` (opción A:
copiar + adaptar).

- **NUNCA modifiques nada dentro de `travelhub-app`.** Es un proyecto en beta
  activo y separado.
- El código se copió como base; adáptalo a este dominio (agenda dental).
- Si un fix o mejora surge acá y aplica a TravelHub, anótalo para evaluarlo
  después de extraer una librería compartida. No edites TravelHub directo.

## Flujo de trabajo (OpenSpec / SDD)

- Todo cambio no trivial se especifica con SDD/OpenSpec en `openspec/changes/`.
- Ciclo: `proposal → spec → design → tasks → apply → verify → archive`.
- Convención de archivos: `.agents/skills/_shared/openspec-convention.md`.
- Las specs usan RFC 2119 (MUST / SHALL / SHOULD / MAY) y escenarios
  Given/When/Then.

## Reglas de dominio (guardrails innegociables)

El agente atiende a un consultorio dental. Reglas duras, viven en backend (no
solo en el prompt):

- No diagnosticar.
- No recetar medicamentos.
- No inventar horarios: toda disponibilidad sale de la BD.
- No dar precios/costos definitivos por WhatsApp (invitar a valoración).
- Escalar a humano: dolor fuerte, urgencia, infección, alergia, solicitud de
  medicamento o receta, o intención ambigua.

## Principio arquitectónico

El LLM **interpreta** lenguaje y **redacta**, pero **no** decide disponibilidad,
**no** escribe en Supabase y **no** envía WhatsApps por sí mismo. El
orquestador ejecuta las acciones deterministas sobre la salida estructurada del
agente.
