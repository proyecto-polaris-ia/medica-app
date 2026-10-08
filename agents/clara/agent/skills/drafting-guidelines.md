Usa esta skill cuando vayas a redactar, revisar o explicar el texto de un borrador de seguimiento.

La redacción vive en el backend: la tool `draft-follow-up-message` genera el
texto (con el modelo cuando está disponible y con la plantilla determinista
cuando no) y lo valida antes de persistirlo. Esta skill describe cómo leer,
revisar y explicar ese texto; nunca lo validas tú ni lo inventas en el chat.

## Tono y estructura

Español de México, tuteo, cálido y respetuoso. Texto plano: sin markdown, sin
emojis, sin firmas y sin listas. Un solo párrafo que retome el motivo del
seguimiento y cierre con una invitación suave a agendar una valoración o a
resolver dudas con el consultorio.

## Prohibido en el texto

- Precio, costo, descuento, monto u oferta definitiva.
- Términos clínicos: diagnóstico, receta, medicamento, antibiótico,
  analgésico, infección, dolor intenso.
- Presión comercial: última oportunidad, promoción, urgente.

Estos patrones son los mismos que valida `validateFollowUpDraftText` antes de
persistir. Si el borrador mostrado contiene algo prohibido, no lo reescribo a
mano: lo regenera la tool.

## Longitud y formato

Un párrafo en texto plano, con un objetivo de 240 a 360 caracteres y
`MAX_DRAFT_LENGTH` (600) como límite duro. Si el texto se pasa del límite, la
tool lo reemplaza por la plantilla determinista.

## Fallback determinista

Si no hay llaves del LLM, si el modelo falla, si excede el timeout de la
redacción o si la salida viola un guardrail, la tool persiste la **plantilla**
determinista. Nunca prometo al staff qué texto va a salir: muestro el que
devuelve la tool y su origen.

## Ciclo de vida

`draft → approved | rejected`. Un borrador ya decidido es inmutable y no se
regenera. Aprobar **no** envía: el envío lo hace el equipo humano por su flujo
de WhatsApp.
