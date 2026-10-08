# Propuesta: Campo "Requiere factura" al registrar pago

**Issue**: #184 — Agregar campo "Requiere factura" al registrar pago

## Intención

Permitir que el staff administrativo marque, al registrar un pago de paciente, si
ese pago requiere factura, para dar seguimiento operativo posterior desde el
expediente financiero sin depender de notas libres.

## Alcance

### Incluido

- Agregar una casilla opcional "Requiere factura" al formulario de registro de
  pago del expediente del paciente, desmarcada por defecto.
- Persistir `requires_invoice boolean NOT NULL DEFAULT false` en `payments`.
- Enviar la marca en el `POST /api/admin/patients/{id}/payments` y devolverla en
  el `GET` del mismo endpoint.
- Mostrar la marca como distintivo "Requiere factura" en el historial de pagos.
- Reiniciar la casilla a desmarcada tras un registro exitoso.
- Asociar la etiqueta al control para accesibilidad.

### Fuera de alcance

- Filtrar u ordenar el historial por la marca de factura.
- Editar la marca en pagos existentes vía `PATCH`/`updatePayment`
  (`PaymentUpdateInput` no cambia).
- Integración con facturación externa, timbrado, CFDI, RFC o cualquier emisión
  de comprobantes fiscales.
- Notificaciones, correos o tareas derivadas de la marca.

## Capacidades

### Capacidades nuevas

Ninguna.

### Capacidades modificadas

- `payments`: el registro manual acepta y persiste `requires_invoice` (opcional,
  default `false`), el listado lo devuelve y la actualización controlada lo
  excluye (solo creación).
- `admin-panel`: el formulario de pagos del expediente captura la casilla
  opcional con etiqueta accesible, la reinicia tras el alta y el historial
  muestra el distintivo "Requiere factura".

## Enfoque

Cambio aditivo de una sola columna booleana con default. La columna se crea con
`ADD COLUMN IF NOT EXISTS` y se agrega a `PAYMENT_COLUMNS`, `mapPaymentRow` y
`buildPaymentPayload`; `parsePaymentBody` normaliza de forma defensiva con
`body.requiresInvoice === true`. La edición queda explícitamente excluida de
`buildPaymentUpdatePayload` para no alterar pagos ya registrados. En la UI basta
un `useState(false)`, un checkbox etiquetado, el campo en el cuerpo del `POST`,
el reinicio tras el alta y un distintivo en el historial.

## Áreas afectadas

| Área | Impacto | Descripción |
|---|---|---|
| `supabase/migrations/0024_requires_invoice.sql` | Crear | Columna aditiva `requires_invoice` con default `false`. |
| `supabase/migrations/down/0024_requires_invoice.down.sql` | Crear | Reversa: retira la columna. |
| `src/lib/admin/types.ts` | Modificar | `Payment.requiresInvoice`, `PaymentInput.requiresInvoice`; `PaymentUpdateInput` intacto. |
| `src/lib/admin/payments.ts` | Modificar | `PAYMENT_COLUMNS`, `mapPaymentRow`, `buildPaymentPayload`; `buildPaymentUpdatePayload` intacto. |
| `app/api/admin/patients/[id]/payments/route.ts` | Modificar | `parsePaymentBody` acepta `requiresInvoice`; `GET`/`POST` sin cambios de contrato. |
| `src/components/admin/patient-record/PatientPaymentsTab.tsx` | Modificar | Casilla, `POST`, reinicio, distintivo en historial. |
| `src/lib/admin/__tests__/payments.test.ts` | Modificar | Persistencia y default en la capa de datos. |
| `src/components/admin/patient-record/PatientPaymentsTab.test.tsx` | Modificar | Casilla, payload, reinicio y distintivo. |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Filas previas sin la columna durante el despliegue | Baja | `DEFAULT false NOT NULL` evita nulos; el mapper coerciona a booleano. |
| La marca se filtra a la edición de pagos | Baja | Excluirla de `PaymentUpdateInput` y `buildPaymentUpdatePayload`; cubrir con prueba. |
| Regresión en el contrato de pagos existente | Baja | Campo opcional y aditivo; las pruebas de payload usan `toMatchObject`. |
| Duplicar la marca como nota de texto libre | Baja | Distintivo dedicado en el historial, sin depender de `notes`. |

## Plan de reversión

Retirar el campo del `POST`/UI y revertir la migración con
`0024_requires_invoice.down.sql` (`DROP COLUMN IF EXISTS requires_invoice`). La
reversa descarta la marca capturada; al ser un dato operativo no crítico, no
requiere backfill ni migración de datos. El código de lectura debe retirarse
antes que la columna.

## Dependencias

- Migraciones imperativas de Supabase/Postgres existentes.
- Capa de pagos vigente (`payments`, `accounts-receivable`) sin cambios de
  cálculo.

## Criterios de éxito

- [ ] El formulario muestra una casilla opcional "Requiere factura" desmarcada
  por defecto y asociada a su etiqueta.
- [ ] Un pago creado con la marca persiste `requires_invoice = true`; uno sin
  marca persiste `false`.
- [ ] El `GET` de pagos devuelve `requiresInvoice` y el historial muestra el
  distintivo "Requiere factura" solo cuando corresponde.
- [ ] La casilla se reinicia a desmarcada tras un registro exitoso.
- [ ] `requiresInvoice` no puede modificarse vía `PATCH`/`updatePayment`.
