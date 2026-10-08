# Tareas: Campo "Requiere factura" al registrar pago

**TDD:** RED → GREEN → REFACTOR. No tocar `travelhub-app`, ni `PaymentUpdateInput`/`buildPaymentUpdatePayload`, ni los cálculos de saldo.

## Review Workload Forecast

| Campo | Valor |
|---|---|
| Líneas modificadas estimadas | 120–180 (migración, producción y pruebas; specs no se reescriben) |
| Riesgo de presupuesto de 400 líneas | Low |
| PRs encadenados recomendados | No |
| Estrategia de entrega | single-pr |
| Estrategia de cadena | N/A |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: N/A
400-line budget risk: Low

### Suggested Work Units

| Unidad | Objetivo / PR | Prueba enfocada | Runtime harness | Rollback boundary |
|---|---|---|---|---|
| 1 | Esquema + capa de datos + API / único PR | `npm run test:local -- src/lib/admin/__tests__/payments.test.ts` | `supabase start` + `supabase db reset` (suite de datos local) | `0024_requires_invoice.sql` y su down, `payments.ts`, `types.ts`, ruta de pagos |
| 2 | UI formulario + historial / único PR | `npm run test -- src/components/admin/patient-record/PatientPaymentsTab.test.tsx` | N/A: `fetch` se mockea | `PatientPaymentsTab.tsx` y su prueba |

## Phase 1: Migración

- [x] 1.1 **RED:** confirmar que la columna no existe y que la suite de datos actual no lee `requires_invoice`; documentar el resultado esperado de la nueva aserción sobre `readPaymentRow`.
- [x] 1.2 **GREEN:** crear `supabase/migrations/0024_requires_invoice.sql` con `ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS requires_invoice boolean NOT NULL DEFAULT false;`.
- [x] 1.3 **GREEN:** crear `supabase/migrations/down/0024_requires_invoice.down.sql` con `ALTER TABLE public.payments DROP COLUMN IF EXISTS requires_invoice;`.
- [x] 1.4 **VERIFY:** aplicar solo en Supabase local (`supabase db reset`) y comprobar que las filas existentes quedan en `false`.

## Phase 2: Tipos

- [x] 2.1 **RED:** ampliar las pruebas/tipos esperados para exigir `Payment.requiresInvoice: boolean` y `PaymentInput.requiresInvoice?: boolean`.
- [x] 2.2 **GREEN:** actualizar `src/lib/admin/types.ts` con ambos campos. **NO** tocar `PaymentUpdateInput`.

## Phase 3: Servicio de pagos

- [x] 3.1 **RED:** cubrir en `src/lib/admin/__tests__/payments.test.ts` el default `false`, la persistencia de `true` y la lectura cruda de `requires_invoice` vía `readPaymentRow`.
- [x] 3.2 **GREEN:** agregar `'requires_invoice'` a `PAYMENT_COLUMNS`, la coerción en `mapPaymentRow` y `requires_invoice: input.requiresInvoice === true` en `buildPaymentPayload`.
- [x] 3.3 **REFACTOR:** mantener `buildPaymentUpdatePayload` sin el campo y asegurar que `updatePayment` no lo altere.
- [x] 3.4 **REGRESIÓN:** ejecutar `npm run test:local -- src/lib/admin/__tests__/payments.test.ts`.

## Phase 4: API

- [x] 4.1 **RED:** cubrir el contrato del `POST`/`GET` para el campo nuevo.
- [x] 4.2 **GREEN:** agregar `requiresInvoice: body.requiresInvoice === true` a `parsePaymentBody` en `app/api/admin/patients/[id]/payments/route.ts`; no cambiar la forma de `GET`/`POST`.
- [x] 4.3 **REFACTOR:** conservar el estilo de cast manual existente, sin introducir zod.

## Phase 5: UI del formulario

- [x] 5.1 **RED:** en `src/components/admin/patient-record/PatientPaymentsTab.test.tsx`, cubrir casilla desmarcada por defecto con etiqueta accesible, envío `requiresInvoice: true` y reinicio tras éxito.
- [x] 5.2 **GREEN:** agregar `const [requiresInvoice, setRequiresInvoice] = useState(false)`, el checkbox `<input type="checkbox" id="requires-invoice">` con `<label htmlFor="requires-invoice">Requiere factura</label>`, el campo en el cuerpo del `POST` y `setRequiresInvoice(false)` tras el alta exitosa.
- [x] 5.3 **REFACTOR:** alinear la casilla con el estilo de los demás controles y mantener el reinicio junto a los campos existentes.

## Phase 6: UI del historial

- [x] 6.1 **RED:** cubrir que el distintivo "Requiere factura" aparece solo con `requiresInvoice: true`, incluso en pagos reversados.
- [x] 6.2 **GREEN:** renderizar la píldora amarilla "Requiere factura" en el bloque de estado del pago, reutilizando el patrón de píldora existente.
- [x] 6.3 **REFACTOR:** verificar que el distintivo no altera orden, saldos ni acciones de reverso.

## Phase 7: Pruebas y cierre

- [x] 7.1 Actualizar las fixtures de `PatientPaymentsTab.test.tsx` con `requiresInvoice` (al menos una verdadera) sin romper las aserciones `toMatchObject` existentes.
- [x] 7.2 Ejecutar `npm run test -- src/components/admin/patient-record/PatientPaymentsTab.test.tsx`.
- [x] 7.3 Ejecutar `npm run test:local -- src/lib/admin/__tests__/payments.test.ts` con Supabase local levantado.
- [x] 7.4 Ejecutar `npx tsc --noEmit` y confirmar que no se tocó `PaymentUpdateInput`.
- [x] 7.5 Verificar que el filtro del historial por la marca y la edición vía `PATCH` quedaron fuera de alcance.
