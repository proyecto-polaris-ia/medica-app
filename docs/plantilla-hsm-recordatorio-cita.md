# Plantilla HSM `recordatorio_cita` — instrucciones de aprobación en Meta

> Guía operativa para crear y enviar a aprobación la plantilla de WhatsApp
> que necesita el issue [#86](https://github.com/proyecto-polaris-ia/medica-app/issues/86)
> (recordatorios automáticos de citas). La confirmación de la respuesta del
> paciente la cubre [#87](https://github.com/proyecto-polaris-ia/medica-app/issues/87).

## Contexto

- La plantilla `recordatorio_pago` ya existe, está **aprobada** y en uso por
  `app/api/cron/payment-reminders` (ver `src/lib/payments/send-payment-reminder.ts`).
  Esto confirma que la cuenta de Meta Business del consultorio ya está verificada
  y con número de WhatsApp Cloud API registrado.
- Lo que falta aprobar es la **nueva** plantilla `recordatorio_cita`, con la que
  el cron del issue #86 recordará las citas H-24 y el día mismo.

## Dónde se crea

1. Entrar a **business.facebook.com** con la cuenta de Meta Business que
   administra el número de WhatsApp del consultorio.
2. Menú lateral → **WhatsApp** → **WhatsApp Manager**.
3. *Account tools* → **Message templates** → **Create template**.
4. Verificar en la lista que `recordatorio_pago` aparece con estado `Approved`
   (referencia del formato ya aprobado en esta cuenta).

## Formulario de Meta

| Campo | Valor | Nota |
| --- | --- | --- |
| Nombre | `recordatorio_cita` | Debe coincidir **exactamente** (minúsculas, guion bajo) con el `templateName` que enviará el código. |
| Categoría | **Utility** | Recordatorios de citas es el caso canónico de Utility. No usar Marketing: se rechaza más fácil y cuesta más por mensaje. |
| Idioma | Español (México) — `es_MX` | Igual que `recordatorio_pago`. |
| Header | Ninguno | Mantener consistencia con la plantilla de pago. |
| Footer (opcional) | `Consultorio Dental [nombre]` | Texto gris al final. |
| Botones | Quick Reply: `Confirmar` y `Reprogramar` (recomendado) | Ver sección de botones. |
| Ejemplos de variables | **Obligatorio**, valores realistas | Meta rechaza ejemplos genéricos tipo "nombre". |

## Texto propuesto del body

```
Hola {{1}}, te recordamos tu cita en el consultorio dental {{2}} el día {{3}} a las {{4}} con el {{5}}.

Si puedes asistir, responde 1 para confirmar.
Si necesitas cambiarla o cancelarla, responde 2 y con gusto te ayudamos a reprogramar.
```

Ejemplos de variables para el formulario:

- `{{1}}` = María
- `{{2}}` = Dental Sonrisa
- `{{3}}` = martes 15 de octubre
- `{{4}}` = 5:30 pm
- `{{5}}` = Dr. Jorge

Los "1" y "2" del texto no son botones: son la convención de respuesta que el
issue #87 parsea de forma tolerante ("1", "si", "sí", "va", "ok" confirman).

### Botones Quick Reply (recomendado)

Agregar dos botones: **Confirmar** y **Reprogramar**. Al tocarlos, el paciente
envía ese texto como mensaje. Elimina toda ambigüedad de parsing. El issue #87
debe reconocer tanto el texto del botón como la respuesta libre.

## Reglas que provocan rechazo (revisar antes de enviar)

- No poner dos variables juntas sin texto entre ellas (`{{1}}{{2}}` se rechaza).
- No dejar salto de línea inmediatamente antes o después de una variable.
- Sin contenido promocional ("¡aprovecha!", "descuento"): Utility se revisa estricto.
- Los ejemplos de variables deben ser realistas, no genéricos.

## Después de enviar

1. Estado inicial `Pending` / `In review`. Utility suele aprobarse en minutos a
   horas (en ocasiones hasta 24–48h).
2. Si se rechaza, Meta reporta la razón; lo común en Utility es texto que
   pareció marketing o ejemplos de variables genéricos.
3. Cuando esté `Approved`, el código no requiere cambios por esto, pero el
   nombre (`recordatorio_cita`), el idioma (`es_MX`) y el **orden** de los
   `bodyParameters` deben coincidir con el orden de las variables.

## Payload exacto para la implementación (#86)

El envío usa el helper existente `sendWhatsAppTemplateMessage` de
`src/lib/whatsapp/client.ts` (mismo que el cron de pagos). El orden de los
parámetros debe ser exactamente: nombre, consultorio, fecha, hora, doctor.

```ts
import { sendWhatsAppTemplateMessage } from '@/lib/whatsapp/client';

const sendResult = await sendWhatsAppTemplateMessage({
  to: appointment.patientPhoneE164,
  templateName: 'recordatorio_cita',
  languageCode: 'es_MX',
  bodyParameters: [
    { type: 'text', text: patientFirstName },
    { type: 'text', text: clinicName },
    { type: 'text', text: formatMxDate(appointment.startsAt) },   // "martes 15 de octubre"
    { type: 'text', text: formatMxTime(appointment.startsAt) },   // "5:30 pm"
    { type: 'text', text: providerDisplayName },                  // "Dr. Jorge"
  ],
});
```

Notas de implementación:

- `patientFirstName`, `clinicName`, `providerDisplayName` provienen de la cita
  en Supabase (ver referencias en el issue #86); `formatMxDate`/`formatMxTime`
  deben usar la zona `America/Mexico_City` (lib `src/lib/admin/clinic-time.ts`).
- Si se aprobaron los botones Quick Reply, el payload no cambia: los botones
  viven en la plantilla; el paciente responde con su texto y entra por el
  webhook normal (`app/api/whatsapp/webhook`).
- Idempotencia y dry-run: seguir el patrón de `send-payment-reminder.ts`
  (`reminder_key`, dry-run por defecto, feature flag).

## Costo

Cada envío de plantilla Utility fuera de la ventana de 24h se cobra por mensaje
(tarifa baja para Utility en México, muy por debajo de Marketing). Anotar esta
tarifa en el doc 05 de precios/costos del cliente, que sigue pendiente.

## Checklist

- [ ] Entrar a WhatsApp Manager de la cuenta del consultorio
- [ ] Crear plantilla: nombre `recordatorio_cita`, categoría **Utility**, idioma **es_MX**
- [ ] Body con 5 variables (texto de este documento) sin violar reglas de variables
- [ ] Ejemplos de variables realistas
- [ ] Decidir botones Quick Reply ("Confirmar" / "Reprogramar")
- [ ] Enviar a revisión y anotar la fecha de envío
- [ ] Al aprobarse: avisar en el issue #86 para iniciar la implementación
- [ ] Al implementar #86: usar el payload exacto de este documento (orden de variables)
