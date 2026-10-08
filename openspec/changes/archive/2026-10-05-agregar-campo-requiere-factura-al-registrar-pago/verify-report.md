# Verify Report — agregar-campo-requiere-factura-al-registrar-pago (issue #184)

**Fase:** OpenSpec / Verify (SDD) · **Veredicto:** PASS
**Worktree:** `.worktrees/medica-app/agregar-campo-requiere-factura-al-registrar-pago`
**Rama:** `eliumontoya/agregar-campo-requiere-factura-al-registrar-pago`
**Fecha:** 2026-10-05
**Alcance:** verificación independiente read-only; no se modificó código de producción
ni de pruebas durante la verificación.

## 1. Resultado por verificación

| # | Verificación | Comando | Salida | Resultado |
|---|---|---|---|---|
| 1 | Suite de datos local | `npm run test:local` (tras `supabase db reset`) | exit 0 | **170 archivos / 1732 pruebas pasan**. Migración `0024_requires_invoice.sql` aplicada; columna `requires_invoice boolean NOT NULL DEFAULT false` confirmada en la tabla `payments`. |
| 2 | Suite unitaria/integración | `npm run test` | exit 0 | **1474 pasan / 0 fallan**, 258 omitidas. |
| 3 | Typecheck | `npx tsc --noEmit` | exit 0 | Sin errores (salida vacía). |
| 4 | Lint | `npm run lint` | exit 0 | **0 errores**, 25 avisos preexistentes; ninguno en los archivos modificados por este cambio. |

## 2. Criterios de aceptación de la issue #184 (6/6)

| # | Criterio | Evidencia (archivo:línea) |
|---|---|---|
| 1 | Casilla opcional "Requiere factura" asociada a su etiqueta y desmarcada por defecto | `src/components/admin/patient-record/PatientPaymentsTab.tsx:55` (`useState(false)`), `:240-248` (`<input id="requires-invoice" type="checkbox">` + `<label htmlFor="requires-invoice">`). |
| 2 | Un pago con la marca persiste `requires_invoice = true`; sin marca persiste `false` | `src/lib/admin/payments.ts:98` (`requires_invoice: input.requiresInvoice === true`), `:49` (mapper coerciona a booleano). Pruebas: `src/lib/admin/__tests__/payments.test.ts:224-226`, `:243-245`, `:266-268`. |
| 3 | El `GET` devuelve `requiresInvoice` y el historial muestra el distintivo solo cuando corresponde | `src/lib/admin/payments.ts:30` (`'requires_invoice'` en `PAYMENT_COLUMNS`), `:49`; `app/api/admin/patients/[id]/payments/route.ts:31-34` (GET devuelve `listPayments`); distintivo en `PatientPaymentsTab.tsx:321-324`. Pruebas: `PatientPaymentsTab.test.tsx:275` (2 distintivos), `:283` (ninguno cuando es falso), `:292` (visible en pago reversado). |
| 4 | La casilla se reinicia a desmarcada tras un registro exitoso | `PatientPaymentsTab.tsx:101` (`setRequiresInvoice(false)` en el bloque de éxito). Prueba: `PatientPaymentsTab.test.tsx:267`. |
| 5 | `requiresInvoice` no puede modificarse vía `PATCH`/`updatePayment` | `src/lib/admin/payments.ts:103-127` (`buildPaymentUpdatePayload` no incluye `requires_invoice`); `updatePayment` en `:197-208` construye el payload con esa función. `PaymentUpdateInput` intacto en `src/lib/admin/types.ts`. |
| 6 | La marca no altera cálculos de saldo ni las acciones de reverso | El distintivo es solo informativo (`PatientPaymentsTab.tsx:321-324`) y no participa en `accounts-receivable`; `buildPaymentPayload` de creación no interviene en saldos. Prueba de reverso: `PatientPaymentsTab.test.tsx:292`. |

## 3. Trazabilidad de escenarios del delta spec (11/11)

| Capacidad | Escenario | Prueba |
|---|---|---|
| `payments` | Registrar pago con marca de factura | `payments.test.ts:238-249` |
| `payments` | Marca ausente se persiste en falso | `payments.test.ts:224-226` |
| `payments` | Valor no booleano se normaliza a falso | `payments.test.ts:261-268` |
| `payments` | La marca no altera los saldos | Coexistencia en fixtures; sin efecto en `accounts-receivable` |
| `payments` | El listado devuelve la marca de factura | `payments.test.ts:249` |
| `payments` | Historial muestra la marca solo cuando corresponde | `PatientPaymentsTab.test.tsx:275`, `:283` |
| `payments` | Corregir referencia o notas de pago activo | Reverso/edición intactos; `payments.test.ts` |
| `payments` | La marca de factura no se modifica en la actualización | `buildPaymentUpdatePayload` sin el campo (`payments.ts:103-127`) |
| `payments` | Rechazar modificación de pago reversado | Comportamiento existente sin cambios |
| `admin-panel` | La casilla existe desmarcada y accesible | `PatientPaymentsTab.test.tsx:245` |
| `admin-panel` | El envío propaga la marca / reinicio / distintivo | `PatientPaymentsTab.test.tsx:248-267`, `:275-292` |

## 4. Verificación de migración

- `supabase/migrations/0024_requires_invoice.sql:5` agrega
  `ADD COLUMN IF NOT EXISTS requires_invoice boolean NOT NULL DEFAULT false`.
- `supabase/migrations/down/0024_requires_invoice.down.sql:5` revierte con
  `DROP COLUMN IF EXISTS requires_invoice`.
- Tras `supabase db reset`, la columna se confirmó como
  `boolean NOT NULL DEFAULT false` y las filas existentes quedan en `false`.
- La verificación del valor por defecto sobre filas preexistentes se hizo con
  una transacción de sondeo revertida (rollback), por lo que no se dejaron datos
  de prueba persistidos.

## 5. Hallazgos

- **CRÍTICO:** ninguno.
- **MAYOR:** ninguno.
- **MENOR-1 (limitación de evidencia RED):** la evidencia RED de las suites de
  datos, ruta y componente fue redactada por el autor (writer-authored); no se
  re-ejecuta el ciclo rojo en esta verificación. El estado GREEN sí se observó de
  forma independiente (`npm run test:local` 1732/1732, `npm run test`
  1474/0 fallan).
- **MENOR-2 (avisos de lint preexistentes):** los 25 avisos de `npm run lint`
  son preexistentes y no se ubican en los archivos tocados por este cambio.

## 6. Invariantes confirmados

- `PaymentUpdateInput` y `buildPaymentUpdatePayload` sin cambios (alcance
  create-only).
- Sin cambios en `accounts-receivable` ni en los cálculos de saldo.
- Nada dentro de `travelhub-app` fue tocado.
- Superficies del cambio: `supabase/migrations/0024_requires_invoice.sql`,
  `supabase/migrations/down/0024_requires_invoice.down.sql`,
  `src/lib/admin/types.ts`, `src/lib/admin/payments.ts`,
  `app/api/admin/patients/[id]/payments/route.ts`,
  `src/components/admin/patient-record/PatientPaymentsTab.tsx` y sus pruebas.

## 7. Cierre

Las 4 verificaciones solicitadas pasan y los 6 criterios de aceptación de la
issue #184 quedan cubiertos con evidencia `archivo:línea` y pruebas en verde.
Sin hallazgos críticos ni mayores. **Veredicto: PASS.**
