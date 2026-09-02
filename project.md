# Contexto de Negocio — medica-app

Documento de referencia funcional principal. Resume el propósito del negocio,
el dolor operativo actual y los resultados esperados.

## Propósito

Darle a un consultorio dental una herramienta propia, simple y de bajo costo
para que la operación diaria —atención por WhatsApp, programación y
confirmación de citas, y manejo de expedientes— deje de depender de procesos
manuales desordenados y de una sola persona.

## Contexto

Jorge opera un consultorio dental donde participan tres personas:

- Jorge, dentista y dueño/operador.
- Su hijo, también dentista.
- Una secretaria, responsable de comunicación con pacientes, agenda y
  expedientes físicos.

Jorge tiene disponibilidad limitada en el consultorio (da clases de 7:00 a
15:00 y atiende principalmente de 17:00 a 20:00), por lo que necesita que la
operación sea más confiable y menos dependiente de acciones manuales.

## Dolor del negocio

- **Gestión de citas inconsistente:** pacientes que escriben por WhatsApp y no
  reciben seguimiento; "ahorita te la hago" que nunca se concreta; agenda que
  parece llena pero termina con huecos por inasistencias y no confirmaciones.
- **Dependencia excesiva de la secretaria:** uso de celular personal como canal
  de trabajo, falta de visibilidad y trazabilidad de la comunicación.
- **Expedientes clínicos físicos desordenados:** entrega equivocada, archivo
  por apodo, imposibilidad de encontrarlos si la secretaria no está.
- **Falta de historial digital unificado:** información dispersa entre papel,
  archivos en computadora, WhatsApp, radiografías y notas de pago.
- **Riesgo de automatización excesiva:** experiencia previa negativa con IA que
  prometió lo que no podía cumplir. En odontología el riesgo es clínico y
  legal si el bot diagnostica o receta.

## Solución propuesta

Un sistema sencillo con dos grandes componentes iniciales:

1. **Automatización de citas por WhatsApp:** el paciente escribe, el agente
   consulta la agenda real, propone horarios disponibles, reserva o recomienda
   la siguiente hora, confirma y escala a humano cuando corresponde.
2. **Expediente clínico digital** (fase posterior): datos generales, historia
   clínica, hoja de evolución por consulta, presupuestos, pagos, archivos e
   imágenes.

## Usuarios

- **Jorge / dentista administrador:** ver agenda, consultar expedientes,
  registrar evolución, atender urgencias escaladas.
- **Hijo dentista:** funciones clínicas, potencialmente limitadas a sus
  pacientes o citas.
- **Secretaria / recepción:** registrar pacientes, agendar, confirmar,
  reprogramar, registrar pagos.
- **Paciente (externo, vía WhatsApp):** solicitar, confirmar, cancelar o
  reprogramar citas; reportar dolor o urgencia.

## Resultados esperados

- Menos huecos en agenda por falta de confirmación.
- Respuesta inmediata y confiable al paciente por WhatsApp.
- Menos dependencia de la secretaria para agenda y seguimiento.
- Trazabilidad de conversaciones y citas.
- Una base propia que crezca por fases (expediente, archivos, pagos) sin las
  limitaciones de herramientas externas tipo Doctoralia.

## Alcance por fases

1. **MVP 0 — WhatsApp + agenda real en Supabase:** agente dual (conocimiento
   estático + booking dinámico), sin dashboard completo aún.
2. **MVP 1 — Aplicación con agenda:** dashboard para administrar
   disponibilidad, citas, estados y vista por doctor.
3. **MVP 2 — Pacientes y expediente:** registro de pacientes, historia clínica,
   hoja de evolución.
4. **MVP 3 — Archivos, radiografías, pagos y documentos.**

Fuera del alcance inicial: diagnóstico automatizado, recetas automáticas,
administración fiscal, inventario, nómina, proveedores, marketplace
multi-clínica.
