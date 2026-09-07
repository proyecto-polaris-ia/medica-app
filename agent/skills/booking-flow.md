# Flujo de Agendamiento de Citas

Cuando un paciente quiera agendar una cita, sigue estos pasos en orden.

## Paso 1: Confirmar intención

Si el paciente dice algo como "quiero agendar una cita" o "necesito una cita", confirma que quieres ayudarle.

## Paso 2: Recopilar la información necesaria

Necesitas obtener estos datos del paciente:

- Servicio que necesita (ej: limpieza, valoración, blanqueamiento).
- Doctor preferido (opcional, puede ser cualquiera disponible).
- Fecha preferida.
- Horario preferido (opcional).

## Paso 3: Consultar disponibilidad

Usa la tool `check-availability` con los datos recopilados:

- `serviceName`: nombre del servicio.
- `providerName`: nombre del doctor (o "Cualquiera" si no tiene preferencia).
- `date`: fecha en formato `YYYY-MM-DD`.

Nunca propongas ni confirmes un horario antes de consultar la base de datos.

## Paso 4: Presentar opciones

Si hay disponibilidad, presenta los horarios disponibles al paciente de forma clara:

> "Tengo estos horarios disponibles para [servicio] con [doctor] el [fecha]:
> 1) 10:00 AM
> 2) 11:30 AM
> 3) 2:00 PM
> ¿Cuál prefieres?"

## Paso 5: Confirmar y agendar

Una vez que el paciente elija un horario:

1. Confirma los detalles: "Perfecto, voy a agendar tu cita para [fecha y hora] con [doctor] para [servicio]. ¿Confirmas?"
2. Si confirma, usa la tool `book-appointment` con todos los datos.
3. Solo puedes decir que la cita quedó agendada si `book-appointment` devuelve `success: true`. Entonces confirma: "¡Listo! Tu cita quedó agendada para [fecha y hora]. Te enviaré un recordatorio."

## Paso 6: Manejar conflictos

Si no hay disponibilidad:

- Ofrece consultar otra fecha: "No hay horarios disponibles ese día. ¿Te gustaría consultar otro día?"
- Si el paciente acepta, repite desde el Paso 3 con la nueva fecha.

Si hay un conflicto al agendar (el horario ya no está disponible):

- Informa al paciente: "Lo siento, ese horario acaba de ser ocupado. Déjame consultar la siguiente disponibilidad."
- Usa la tool `get-next-available` para encontrar la próxima disponibilidad real.
- Ofrece la alternativa al paciente.

## Notas importantes

- NUNCA inventes horarios; SIEMPRE consulta la base de datos con `check-availability` o `get-next-available`.
- Si el paciente no tiene preferencia de doctor, consulta disponibilidad con "Cualquiera".
- Si el paciente menciona síntomas clínicos (dolor fuerte, urgencia, infección), escala a humano inmediatamente siguiendo el skill `clinical-escalation.md`.
- Si el paciente pregunta por precios, indica que los precios se confirman en la consulta. No des precios definitivos por WhatsApp.
- Mantén un tono cálido y profesional en todo momento.
