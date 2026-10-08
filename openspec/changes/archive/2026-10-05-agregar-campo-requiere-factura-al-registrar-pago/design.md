# Diseño: Campo "Requiere factura" al registrar pago

## Enfoque técnico

Cambio aditivo de una columna booleana en `payments` con default `false`,
propagada por la capa de pagos existente hasta el formulario y el historial del
expediente del paciente. La marca es de solo creación: no se acepta en el flujo
de actualización (`PATCH`), que sigue limitado a corregir referencia o notas de
pagos activos.

## Decisiones de arquitectura

| Decisión | Elección | Alternativas y razón |
|---|---|---|
| Esquema | `ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS requires_invoice boolean NOT NULL DEFAULT false` en `0024_requires_invoice.sql`. | Usar nullable forzaría tratar `null` en mapper y UI sin beneficio; el default `false` deja las filas existentes en "no requiere factura". |
| Reversa | `supabase/migrations/down/0024_requires_invoice.down.sql` con `DROP COLUMN IF EXISTS requires_invoice`. | Se conserva la convención observada `<nombre>.down.sql` (p. ej. `0016_payments.down.sql`); la ruta sin sufijo sugerida en el brief no coincide con el estilo existente. |
| Normalización de entrada | En `parsePaymentBody`: `requiresInvoice: body.requiresInvoice === true`. Sin zod, siguiendo el cast manual del archivo. | Un cast `as boolean` aceptaría `"true"`/`1`; la comparación estricta garantiza que cualquier valor distinto de `true` se trate como `false`. |
| Mapper | `requiresInvoice: row.requires_invoice === true` en `mapPaymentRow`, con `'requires_invoice'` en `PAYMENT_COLUMNS`. | Evita `null`/`undefined` en el tipo y tolera ventanas de despliegue previas al `ALTER`. |
| Payload de creación | `requires_invoice: input.requiresInvoice === true` en `buildPaymentPayload`. | Mantiene el default `false` cuando el campo se omite, sin depender solo del default de la columna. |
| Creación vs edición | `PaymentInput.requiresInvoice?: boolean`; `PaymentUpdateInput` y `buildPaymentUpdatePayload` NO se tocan. | La marca describe una intención registrada al momento del cobro; permitir cambiar `requires_invoice` después ampliaría el alcance y complicaría la auditoría. `updatePayment` queda inmune por construcción. |
| UI: estado y control | `const [requiresInvoice, setRequiresInvoice] = useState(false)` y `<input type="checkbox" id="requires-invoice">` con `<label htmlFor="requires-invoice">Requiere factura</label>`. | El campo inicia desmarcado; la asociación `htmlFor`/`id` (o `label` envolvente) garantiza que `getByLabelText('Requiere factura')` funcione y que el control tenga nombre accesible. |
| UI: historial | Distintivo tipo píldora amarilla `{payment.requiresInvoice && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Requiere factura</span>}` dentro del bloque de estado del pago, junto a "Activo"/"Reversado". | Reutiliza el patrón de píldora existente (líneas 292–296) y el color amarillo pedido; el distintivo es informativo y no filtra ni altera cálculos de saldo. |
| Reinicio | `setRequiresInvoice(false)` en el bloque de éxito de `handleSubmit`, junto a los demás resets. | El formulario queda listo para el siguiente cobro; consistente con monto, método, fecha, plan, referencia y notas. |

## Flujo de datos

```text
PatientPaymentsTab
  |- estado requiresInvoice (default false)
  |- checkbox "Requiere factura"
  `- POST /api/admin/patients/{id}/payments
         body { ..., requiresInvoice: boolean }
           `- parsePaymentBody -> requiresInvoice: body.requiresInvoice === true
                 `- createPayment -> buildPaymentPayload.requires_invoice
                       `- INSERT payments(requires_invoice)
  `- tras 2xx: setRequiresInvoice(false); onPaymentsChanged()

GET /api/admin/patients/{id}/payments
  `- listPayments -> PAYMENT_COLUMNS incluye requires_invoice
        `- mapPaymentRow -> Payment.requiresInvoice
              `- historial renderiza el distintivo "Requiere factura"

PATCH /api/admin/payments/{id}  (updatePayment)
  `- buildPaymentUpdatePayload NO incluye requires_invoice (solo creación)
```

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `supabase/migrations/0024_requires_invoice.sql` | Crear | Columna aditiva `requires_invoice boolean NOT NULL DEFAULT false`. |
| `supabase/migrations/down/0024_requires_invoice.down.sql` | Crear | `DROP COLUMN IF EXISTS requires_invoice`. |
| `src/lib/admin/types.ts` | Modificar | `Payment.requiresInvoice: boolean`; `PaymentInput.requiresInvoice?: boolean`; `PaymentUpdateInput` sin cambios. |
| `src/lib/admin/payments.ts` | Modificar | `'requires_invoice'` en `PAYMENT_COLUMNS`; coerción en `mapPaymentRow`; `requires_invoice` en `buildPaymentPayload`; `buildPaymentUpdatePayload` intacto. |
| `app/api/admin/patients/[id]/payments/route.ts` | Modificar | `parsePaymentBody` agrega `requiresInvoice`. `GET`/`POST` no cambian de forma. |
| `src/components/admin/patient-record/PatientPaymentsTab.tsx` | Modificar | Estado, checkbox etiquetado, campo del `POST`, reinicio y distintivo amarillo. |
| `src/lib/admin/__tests__/payments.test.ts` | Modificar | Default `false`, persistencia `true` y lectura cruda de la columna. |
| `src/components/admin/patient-record/PatientPaymentsTab.test.tsx` | Modificar | Fixtures con el campo; envío `true`, reinicio y distintivo. |

## Interfaces / contratos

```ts
// src/lib/admin/types.ts
export type Payment = {
  // ...
  requiresInvoice: boolean;
};

export type PaymentInput = {
  // ...
  requiresInvoice?: boolean;
};

// PaymentUpdateInput: sin cambios (create-only)

// POST /api/admin/patients/{id}/payments
type PaymentRequestBody = {
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  treatmentPlanId?: string | null;
  reference?: string | null;
  notes?: string | null;
  requiresInvoice?: boolean;
};

// GET /api/admin/patients/{id}/payments
type PaymentResponse = {
  payments: Payment[]; // cada Payment incluye requiresInvoice: boolean
  summary: PatientReceivableSummary;
};
```

Ausente o distinto de `true` equivale a `false`. La marca no participa en
cálculos de saldo ni en la validación de pagos.

## Estrategia de pruebas

| Capa | Cobertura |
|---|---|
| Datos (Supabase local) | `createPayment` sin marca persiste `false`; con `requiresInvoice: true` persiste `true`; `listPayments` devuelve el booleano; lectura cruda de `requires_invoice`. |
| Componente | La casilla existe, está desmarcada por defecto y tiene etiqueta accesible; al marcarla el `POST` incluye `requiresInvoice: true`; tras el éxito vuelve a desmarcada; el historial muestra el distintivo solo con `requiresInvoice: true`. |
| Regresión | El payload previo sigue pasando (`toMatchObject`); `updatePayment` no altera `requires_invoice`. |

### Escenario RED

- GIVEN un pago registrado sin marcar "Requiere factura"
- WHEN se crea y se relee la fila
- THEN `requires_invoice` MUST ser `false`
- AND WHEN se registra un pago marcando la casilla
- THEN el `POST` MUST enviar `requiresInvoice: true` y la fila MUST persistir `true`

## Matriz de amenazas

N/A — cambio aditivo de columna y UI existente; no se crean ni cambian rutas,
redirecciones, shell, subprocesos, VCS, clasificación ejecutable ni integración
de procesos. No se manejan datos sensibles nuevos.

## Migración, despliegue y reversión

Probar la migración solo en Supabase local. Desplegar el esquema antes que
backend/UI: `DEFAULT false NOT NULL` permite que el código previo siga operando
y el nuevo tolere filas sin la marca. Revertir el código de lectura antes de
ejecutar `DROP COLUMN IF EXISTS`; la reversa descarta la marca capturada y no
requiere backfill por ser un dato operativo no crítico. No se toca
`accounts-receivable` ni los cálculos de saldo.

## Preguntas abiertas

Ninguna.
