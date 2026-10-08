## Exploration: Campo "Requiere factura" al registrar pago

### Current State

- El registro de pagos de paciente vive en
  `src/components/admin/patient-record/PatientPaymentsTab.tsx`. Cada campo del
  formulario tiene su propio `useState` (líneas 50–56) y `handleSubmit`
  (líneas 64–91) arma el cuerpo del `POST` (líneas 74–81) hacia
  `/api/admin/patients/${patientId}/payments`. Los controles del formulario
  están en las líneas 133–197 y usan `<label>` envolvente con texto en español.
- El historial de pagos se renderiza en la sección de las líneas 280–330 y ya
  usa un patrón de píldora de estado (líneas 292–296) para distinguir
  "Activo"/"Reversado".
- El endpoint `app/api/admin/patients/[id]/payments/route.ts` usa
  `parsePaymentBody` (líneas 9–18) con cast manual, sin zod, y expone `GET`
  (líneas 21–35) vía `listPayments` + `getPatientReceivableSummary` y `POST`
  (líneas 37–48) vía `createPayment`.
- La capa de datos `src/lib/admin/payments.ts` centraliza `PAYMENT_COLUMNS`
  (líneas 19–33), `mapPaymentRow` (líneas 35–52), `buildPaymentPayload`
  (líneas 82–94) y `buildPaymentUpdatePayload` (líneas 96–118). La tabla
  `payments` se creó en `supabase/migrations/0016_payments.sql:12–31`, sin
  ninguna columna de factura.
- Los tipos vigentes están en `src/lib/admin/types.ts`: `PaymentMethod`
  (línea 323), `Payment` (líneas 325–340), `PaymentInput` (líneas 342–349) y
  `PaymentUpdateInput` (líneas 351–356).
- Pruebas existentes: `src/lib/admin/__tests__/payments.test.ts` corre contra
  Supabase local con `npm run test:local` y tiene el helper `readPaymentRow`
  (líneas 67–79); `src/components/admin/patient-record/PatientPaymentsTab.test.tsx`
  mockea `fetch` (línea 115), afirma el payload del `POST` con `toMatchObject`
  (líneas 197–208) y define fixtures (líneas 47–71).
- No existe una carpeta de cambio para este issue; el siguiente número de
  migración libre es `0024` y los down-migrations viven en
  `supabase/migrations/down/` con sufijo `.down.sql`.

### Affected Areas

- `supabase/migrations/0024_requires_invoice.sql` y su reversa en
  `supabase/migrations/down/` — columna booleana aditiva con default `false`.
- `src/lib/admin/types.ts` — `Payment.requiresInvoice` y
  `PaymentInput.requiresInvoice`; `PaymentUpdateInput` queda intacto.
- `src/lib/admin/payments.ts` — columna, mapper y payload de creación.
- `app/api/admin/patients/[id]/payments/route.ts` — normalización en
  `parsePaymentBody`.
- `src/components/admin/patient-record/PatientPaymentsTab.tsx` — casilla,
  payload, reinicio y distintivo en el historial.
- Pruebas de la capa de datos y del componente — default, persistencia,
  payload, reinicio, distintivo y no edición.
- `openspec/specs/payments/spec.md` y `openspec/specs/admin-panel/spec.md` —
  capacidades vigentes a extender por delta.

### Approaches

1. **Columna booleana aditiva con default `false` (enfoque elegido)** — agregar
   `requires_invoice boolean NOT NULL DEFAULT false`, propagarla por la capa de
   pagos y mostrarla en el formulario/historial.
   - Pros: cambio mínimo, sin backfill, compatible con código previo durante el
     despliegue; sin impacto en cálculos de saldo.
   - Cons: requiere tocar varios puntos de la cadena (migración, tipos, servicio,
     API, UI y pruebas), aunque cada uno es de una línea.
   - Effort: Low

2. **Reutilizar `notes`/`reference` como texto libre** — capturar "Requiere
   factura" dentro de las notas.
   - Pros: cero cambios de esquema.
   - Cons: no es consultable ni filtrable de forma fiable, y mezcla semántica
     operativa con texto libre; no cumple el resultado pedido.
   - Effort: Low

3. **Hacer la marca editable vía `PATCH`** — extender `PaymentUpdateInput` y
   `buildPaymentUpdatePayload`.
   - Pros: corrige la marca después del alta.
   - Cons: amplía el alcance decidido (create-only), añade reglas de auditoría y
     roza la semántica de pagos reversados; descartado en esta iteración.
   - Effort: Medium

### Recommendation

Adoptar el enfoque 1 con alcance create-only: la marca se captura al registrar
el pago, se persiste como `false` por defecto, se devuelve en el `GET` y se
presenta como distintivo "Requiere factura" en el historial. `PaymentUpdateInput`
y `buildPaymentUpdatePayload` no se modifican. El filtro del historial por la
marca y cualquier integración con facturación externa quedan fuera de alcance.
`parsePaymentBody` normaliza con `body.requiresInvoice === true` para no aceptar
cadenas o números como verdaderos. El componente reinicia la casilla tras un
alta exitosa y asocia la etiqueta al control.

### Risks

- Durante el despliegue, código nuevo contra una base sin la columna puede
  fallar al seleccionar `requires_invoice`; el `DEFAULT false` y el orden
  esquema→backend→UI lo mitigan.
- Incluir por accidente `requiresInvoice` en la ruta de edición rompería el
  alcance create-only; se cubre con una prueba de regresión de `updatePayment`.
- El contrato de `POST`/`GET` existente no debe cambiar para los campos previos;
  la aserción `toMatchObject` permite el campo nuevo sin romper lo previo.
- La píldora del historial no debe mezclarse con el estado de reverso; se
  coloca como distintivo independiente.

### Ready for Proposal

Sí. El alcance create-only, el default desmarcado, el distintivo en el historial
y la exclusión de filtro/PATCH están confirmados. El orchestrator puede ejecutar
`apply` sobre estas tareas sin más exploración técnica.
