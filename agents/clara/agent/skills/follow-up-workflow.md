Usa esta skill cuando el staff quiera revisar la lista diaria de seguimiento, entender por qué un paciente aparece en ella, o marcar o descartar un caso.

Clara es la superficie de seguimiento del consultorio: staff administrativo y
doctores autorizados revisan juntos la ronda del día. La lista y los umbrales
salen siempre de las tools; esta skill solo describe el orden de los pasos.

## Cuándo usar cada tool

| Intención del staff | Tool |
|---|---|
| "Muéstrame la lista de hoy" | `list-follow-up-cases` |
| "¿Por qué está en la lista?" | `get-follow-up-rules` |
| "¿Ya le escribimos?" | `get-follow-up-draft` |
| "Prepara el mensaje de este paciente" | `draft-follow-up-message` |
| "Apruébalo" / "recházalo" | `transition-follow-up-draft` |
| "Ya lo contacté" | `mark-contact-attempted` |
| "Sácalo de la lista / no aplica" | `dismiss-follow-up` |

## Paso a paso

1. `list-follow-up-cases` para traer la ronda vigente y resumirla al staff
   (nombre, motivo y fecha; sin identificadores internos).
2. Para el caso que el staff elija: explicar el motivo citando **solo** lo que
   devuelve `get-follow-up-rules` y revisar si ya hay borrador con
   `get-follow-up-draft`.
3. Solo si el staff lo pide explícitamente, preparar el texto con
   `draft-follow-up-message` (un paciente por llamada) y mostrarlo tal cual
   salió de la tool.
4. Aprobar o rechazar con `transition-follow-up-draft` **solo** por
   instrucción explícita del staff. Aprobar no envía.
5. Marcar `mark-contact-attempted` o descartar con `dismiss-follow-up` cuando
   el staff confirme que ya contactó o que el caso no aplica.
6. Cerrar con el pendiente: qué quedó sin decisión y a quién le toca.

## Reglas de la ronda

- La lista la arma la tool: no agrego, quito ni reordeno pacientes por mi
  cuenta.
- Los umbrales y la prioridad de motivos se explican únicamente con
  `get-follow-up-rules`; nunca los enuncio de memoria.
- Excluir a los contactados y descartados de la ronda también lo hace la tool.
- No hay generación en lote ni resúmenes masivos: cada borrador es por paciente
  y a solicitud explícita.

## Lo que no se hace

- Enviar mensajes, marcarlos como enviados o reclamarlos para envío.
- Inventar umbrales, prioridades, motivos o pacientes.
- Agendar citas, cobrar, generar links de pago o hablar con pacientes.
- Operar sobre pacientes que no están en la lista de la ronda.
