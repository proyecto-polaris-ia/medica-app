# Design: Pagos manuales y morosidad

## Technical Approach

Agregar una capa financiera administrativa derivada, no materializada, sobre planes de tratamiento existentes. La fuente de verdad será una tabla nueva `payments` en Supabase con reverso operativo; los saldos se calcularán en `src/lib/admin/accounts-receivable.ts` a partir de `treatment_plans.total_amount` y pagos no reversados.

El diseño sigue los patrones actuales del repo:

- Migraciones idempotentes en `supabase/migrations/` con down migration en `supabase/migrations/down/`.
- Tipos camelCase en `src/lib/admin/types.ts` y filas snake_case en BD.
- Validadores compartidos en `src/lib/admin/validate.ts`.
- Capa de datos por dominio en `src/lib/admin/*.ts` usando `getSupabaseAdmin()`.
- Rutas admin en `app/api/admin/**/route.ts` con `requireUser()`, `handleAdminRequest()` y `parseJsonBody()`.
- UI del expediente como pestañas client-side con estados `LoadingState`, `ErrorState` y `EmptyState`.

## Architecture Decisions

### Decision: Pagos con reverso operativo, no eliminación física

**Choice**: Crear `payments` con campos de reverso (`voided_at`, `voided_by`, `void_reason`) y no exponer operación administrativa `DELETE`.

**Alternatives considered**: Borrado físico o edición libre de pagos.

**Rationale**: El historial financiero necesita trazabilidad básica. Reversar conserva el dato original, permite auditoría operativa y cumple la especificación de excluir pagos reversados de saldos sin perder historial.

### Decision: Saldos derivados en capa de datos

**Choice**: Calcular saldos bajo demanda en `src/lib/admin/accounts-receivable.ts`.

**Alternatives considered**: Columnas materializadas de saldo por paciente/plan o triggers que actualicen tablas resumen.

**Rationale**: El volumen esperado es bajo y la fase busca corrección operativa antes que optimización. Materializar saldos introduciría riesgo de desincronización y mayor costo de rollback.

### Decision: Pagos a cuenta reducen solo saldo global

**Choice**: Cuando `payments.treatment_plan_id` sea `NULL`, el pago reducirá `patientBalance` pero no ningún `planBalance` individual.

**Alternatives considered**: Asignación automática FIFO a planes con saldo.

**Rationale**: La asignación automática puede producir confusión contable y no fue solicitada. La UI debe nombrar estos registros como “Pago a cuenta” para que la operación sea explícita.

### Decision: Sobrepago como crédito visible

**Choice**: Permitir que saldos derivados sean negativos y presentarlos como crédito operativo.

**Alternatives considered**: Bloquear pagos que excedan el saldo del paciente o del plan.

**Rationale**: La caja real puede tener anticipos o errores corregibles por reverso. Bloquearlos haría que el sistema deje de reflejar la operación real.

### Decision: Morosidad por plan con fecha base explícita

**Choice**: Un plan elegible es vencido si tiene saldo positivo y `daysPastDue > thresholdDays`; la fecha base será `accepted_at` o `created_at` si `accepted_at` falta.

**Alternatives considered**: Usar siempre `created_at` o no evaluar planes sin `accepted_at`.

**Rationale**: `accepted_at` representa el inicio financiero correcto. El fallback evita ocultar deuda histórica si hay datos incompletos.

## Data Flow

### Registro de pago

```text
PatientPaymentsTab
  └─ POST /api/admin/patients/[id]/payments
      └─ requireUser()
      └─ parsePaymentInput()
      └─ createPayment(patientId, input, user.id)
          ├─ valida paciente/plan
          └─ INSERT payments
```

### Reverso de pago

```text
PatientPaymentsTab
  └─ PATCH /api/admin/payments/[paymentId]
      └─ requireUser()
      └─ reversePayment(paymentId, reason, user.id)
          ├─ rechaza si ya está reversado
          └─ UPDATE voided_at / voided_by / void_reason
```

### Consulta de saldos del expediente

```text
Patient record page
  ├─ GET /api/admin/patients/[id]/payments
  │   ├─ listPayments(patientId)
  │   └─ getPatientReceivableSummary(patientId)
  └─ PatientRecordTabs → PatientPaymentsTab
```

### Vista global de cartera

```text
/app/(admin)/accounts-receivable/page.tsx
  └─ GET /api/admin/accounts-receivable?thresholdDays=30
      └─ listAccountsReceivable({ thresholdDays })
          ├─ treatment_plans elegibles
          ├─ payments activos
          └─ pacientes con saldo global positivo
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/0016_payments.sql` | Create | Tabla `payments`, enum `payment_method`, índices, constraints, RLS y revocación de `anon`. |
| `supabase/migrations/down/0016_payments.down.sql` | Create | Reversión en orden inverso: índices, tabla, enum. |
| `src/lib/admin/types.ts` | Modify | Tipos `Payment`, `PaymentInput`, `PaymentUpdateInput`, `PaymentReversalInput`, `PaymentMethod`, `PatientReceivableSummary`, `PlanBalance`, `AccountsReceivableRow`. |
| `src/lib/admin/validate.ts` | Modify | Validadores `parsePaymentMethod`, `parseMoneyPositive`, `parsePaidAt`, `parseVoidReason`, `parseThresholdDays`. |
| `src/lib/admin/payments.ts` | Create | CRUD administrativo de pagos: listar, crear, actualizar campos operativos y reversar. |
| `src/lib/admin/accounts-receivable.ts` | Create | Cálculo derivado de saldo global, saldos por plan, último pago y morosidad. |
| `app/api/admin/patients/[id]/payments/route.ts` | Create | `GET` historial/resumen y `POST` registro manual de pago. |
| `app/api/admin/payments/[paymentId]/route.ts` | Create | `PATCH` para corrección operativa o reverso; sin `DELETE`. |
| `app/api/admin/accounts-receivable/route.ts` | Create | `GET` de cartera por cobrar con umbral configurable. |
| `app/(admin)/patients/[id]/page.tsx` | Modify | Cargar estado financiero y refrescarlo al registrar/reversar pagos. |
| `src/components/admin/patient-record/PatientRecordTabs.tsx` | Modify | Agregar tab id `payments`, etiqueta `Pagos` y render de `PatientPaymentsTab`. |
| `src/components/admin/patient-record/PatientPaymentsTab.tsx` | Create | UI de saldo global, saldos por plan, pagos a cuenta, historial y formulario manual. |
| `app/(admin)/accounts-receivable/page.tsx` | Create | Vista global de cartera pendiente y planes vencidos. |
| `app/(admin)/layout.tsx` | Modify | Agregar navegación `Cartera`. |
| `src/lib/admin/__tests__/payments.test.ts` | Create | Pruebas de capa de datos de pagos y reversos. |
| `src/lib/admin/__tests__/accounts-receivable.test.ts` | Create | Pruebas de saldos, pagos a cuenta, créditos y morosidad. |
| `src/lib/admin/__tests__/validate-payments.test.ts` | Create | Pruebas de validadores financieros. |
| `app/api/admin/patients/[id]/payments/route.test.ts` | Create | Pruebas de autenticación, listado y registro. |
| `app/api/admin/payments/[paymentId]/route.test.ts` | Create | Pruebas de actualización/reverso y rechazo de pago reversado. |
| `app/api/admin/accounts-receivable/route.test.ts` | Create | Pruebas del endpoint global de cartera. |
| `src/components/admin/patient-record/PatientPaymentsTab.test.tsx` | Create | Pruebas de estados de UI, pagos a cuenta, reversos y crédito visible. |
| `app/(admin)/patients/[id]/page.test.tsx` | Modify | Verificar que la navegación incluye `Pagos`. |

## Interfaces / Contracts

### Base de datos

```sql
CREATE TYPE payment_method AS ENUM ('cash', 'card', 'transfer', 'other');

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  treatment_plan_id uuid REFERENCES treatment_plans(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL,
  method payment_method NOT NULL,
  paid_at timestamptz NOT NULL,
  reference text,
  notes text,
  created_by uuid,
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_amount_positive CHECK (amount > 0),
  CONSTRAINT payments_void_reason_required CHECK (
    voided_at IS NULL OR nullif(trim(void_reason), '') IS NOT NULL
  )
);
```

Índices mínimos:

- `idx_payments_patient_paid_at` en `(patient_id, paid_at DESC)`.
- `idx_payments_treatment_plan` en `(treatment_plan_id)` donde `treatment_plan_id IS NOT NULL`.
- `idx_payments_active_patient` en `(patient_id)` donde `voided_at IS NULL`.

Validación de integridad plan/paciente: la capa `createPayment` MUST verificar que `treatment_plan_id`, si existe, pertenezca al `patient_id` recibido antes de insertar. Si se requiere enforcement en BD durante implementación, agregar constraint compuesta en `treatment_plans(id, patient_id)` más FK compuesta desde `payments(treatment_plan_id, patient_id)`; la implementación debe mantener idempotencia.

### Tipos TypeScript

```ts
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other';

export type Payment = {
  id: string;
  patientId: string;
  treatmentPlanId: string | null;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  reference: string | null;
  notes: string | null;
  createdBy: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentInput = {
  treatmentPlanId?: string | null;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  reference?: string | null;
  notes?: string | null;
};

export type PaymentUpdateInput = Partial<Pick<PaymentInput,
  'treatmentPlanId' | 'amount' | 'method' | 'paidAt' | 'reference' | 'notes'
>>;

export type PaymentReversalInput = {
  reason: string;
};

export type PlanBalance = {
  treatmentPlanId: string;
  name: string;
  status: TreatmentPlanStatus;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  baseDate: string;
  baseDateSource: 'accepted_at' | 'created_at';
  daysPastDue: number;
  isPastDue: boolean;
};

export type PatientReceivableSummary = {
  patientId: string;
  totalEligibleAmount: number;
  paidAmount: number;
  unallocatedPaidAmount: number;
  balance: number;
  creditAmount: number;
  planBalances: PlanBalance[];
  lastPaymentAt: string | null;
};

export type AccountsReceivableRow = PatientReceivableSummary & {
  patientName: string;
  patientPhoneE164: string | null;
  pastDuePlans: PlanBalance[];
};
```

### Capa de datos

```ts
export async function listPayments(patientId: string): Promise<Payment[]>;

export async function createPayment(
  patientId: string,
  input: PaymentInput,
  createdBy: string | null
): Promise<Payment>;

export async function updatePayment(
  paymentId: string,
  input: PaymentUpdateInput
): Promise<Payment>;

export async function reversePayment(
  paymentId: string,
  input: PaymentReversalInput,
  voidedBy: string | null
): Promise<Payment>;

export async function getPatientReceivableSummary(
  patientId: string,
  options?: { thresholdDays?: number; now?: Date }
): Promise<PatientReceivableSummary>;

export async function listAccountsReceivable(
  options?: { thresholdDays?: number; now?: Date }
): Promise<AccountsReceivableRow[]>;
```

Reglas de contrato:

- `updatePayment` MUST rechazar pagos con `voidedAt != null`.
- `reversePayment` MUST requerir motivo no vacío y rechazar reverso doble.
- `createPayment` y `updatePayment` MUST rechazar `treatmentPlanId` de otro paciente.
- Cálculos MUST excluir pagos reversados.
- Planes elegibles MUST ser solo `accepted`, `in_progress`, `completed`.
- Pagos sin plan MUST reducir únicamente el saldo global.

### API

| Route | Method | Response |
|-------|--------|----------|
| `/api/admin/patients/[id]/payments` | `GET` | `{ payments, summary }` |
| `/api/admin/patients/[id]/payments` | `POST` | `{ payment }` |
| `/api/admin/payments/[paymentId]` | `PATCH` | `{ payment }` |
| `/api/admin/accounts-receivable?thresholdDays=30` | `GET` | `{ accountsReceivable }` |

`PATCH /api/admin/payments/[paymentId]` debe distinguir por body:

```ts
type PaymentPatchBody =
  | { action: 'update'; payment: PaymentUpdateInput }
  | { action: 'reverse'; reason: string };
```

No se crea `DELETE` para pagos. Si en una prueba se importa `DELETE`, debe responder `405` o no existir la exportación; la UI no debe ofrecer borrado físico.

## Testing Strategy

Strict TDD está habilitado; la implementación posterior debe escribir RED tests antes del código.

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Validadores de método, monto positivo, fecha, motivo de reverso y umbral. | `src/lib/admin/__tests__/validate-payments.test.ts` con casos inválidos y centavos. |
| Unit | Mapeo y reglas de `payments.ts`: crear, listar, actualizar activo, rechazar reversado, reversar con motivo. | Mock de Supabase similar a `treatment-plans.test.ts`; cubrir plan de otro paciente y doble reverso. |
| Unit | Saldos derivados y morosidad. | `accounts-receivable.test.ts` con fixtures de planes/pagos: parciales, pagos a cuenta, reversados, sobrepago, centavos, `accepted_at` y fallback a `created_at`. |
| API | Autenticación y respuestas. | Route tests para `401`, `400`, `404`, `GET/POST/PATCH` exitosos y ausencia/rechazo de borrado físico. |
| UI | Pestaña `Pagos`, estados y acciones. | Testing Library para saldo global, crédito visible, pagos a cuenta, estado vacío, error recuperable y llamada de reverso. |
| Integration/manual | Navegación admin y vista de cartera. | `npm run test`, `npx tsc --noEmit`, `npm run build`; E2E solo si ya existe cobertura estable para admin. |

RED tests mínimos que no deben omitirse:

1. Pago ligado a plan de otro paciente se rechaza.
2. Pago reversado queda visible en historial, pero no reduce saldo.
3. Pago a cuenta reduce saldo global y no saldo de plan.
4. Sobrepago produce saldo negativo/crédito visible.
5. Morosidad usa `accepted_at`; si falta, usa `created_at`.
6. `Pagos` aparece en la navegación del expediente.

## Threat Matrix

N/A — este diseño no introduce routing dinámico de ejecución, shell, subprocess, automatización VCS/PR, clasificación de archivos ejecutables ni integración con procesos externos. Solo agrega migración SQL, endpoints HTTP internos, capa de datos Supabase y UI administrativa.

## Migration / Rollout

1. Crear `supabase/migrations/0016_payments.sql` de forma idempotente.
2. Crear `supabase/migrations/down/0016_payments.down.sql` con reversión explícita.
3. Implementar primero capa de datos y pruebas de saldos/reversos.
4. Exponer rutas admin autenticadas.
5. Agregar UI del expediente `Pagos` y después vista global `Cartera`.
6. Ejecutar verificaciones: `npm run test`, `npx tsc --noEmit`, `npm run build`.

No se requiere migración de datos existentes porque no hay pagos previos en el sistema. Los saldos iniciales se derivarán de planes existentes elegibles y pagos vacíos. Si se descubre una tabla financiera manual externa durante apply, no importarla en esta fase sin nueva autorización de alcance.

Rollback:

- Revertir código UI/API/capa admin.
- Ejecutar down migration solo si no existen pagos reales o con aprobación explícita del mantenedor.
- Si ya hay pagos reales, ocultar rutas/navegación primero y exportar datos antes de retirar esquema.

## Open Questions

- [ ] Ninguna pregunta técnica bloquea `sdd-tasks`.
