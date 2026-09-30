# Tasks: Pagos manuales y morosidad

Plan de implementación para registrar pagos manuales, calcular saldos derivados y exponer morosidad en expediente y administración. Strict TDD está activo: cada bloque inicia con pruebas RED, continúa con implementación GREEN y cierra con refactor/verificación.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 900-1,300 líneas authored |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 Persistencia de pagos → PR 2 Saldos/cartera API → PR 3 Pagos en expediente → PR 4 Vista global y endurecimiento |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Persistir pagos manuales y reversos auditables. | PR 1 | `npm run test -- src/lib/admin/__tests__/validate-payments.test.ts src/lib/admin/__tests__/payments.test.ts` | N/A — capa de datos con Supabase mockeado; no hay flujo UI todavía. | Revertir `supabase/migrations/0016_payments.sql`, `supabase/migrations/down/0016_payments.down.sql`, `src/lib/admin/types.ts`, `src/lib/admin/validate.ts`, `src/lib/admin/payments.ts` y sus tests. |
| 2 | Calcular saldos, créditos y morosidad, más endpoints financieros. | PR 2 | `npm run test -- src/lib/admin/__tests__/accounts-receivable.test.ts app/api/admin/accounts-receivable/route.test.ts app/api/admin/patients/[id]/payments/route.test.ts app/api/admin/payments/[paymentId]/route.test.ts` | Escenario: usuario admin consulta pagos del paciente y cartera con `thresholdDays=30`; usuario anónimo recibe `401`. | Revertir `src/lib/admin/accounts-receivable.ts`, rutas `app/api/admin/**/payments*/route.ts`, `app/api/admin/accounts-receivable/route.ts` y sus tests. |
| 3 | Integrar pestaña `Pagos` en expediente con historial, captura, reverso y estados. | PR 3 | `npm run test -- src/components/admin/patient-record/PatientPaymentsTab.test.tsx app/(admin)/patients/[id]/page.test.tsx` | Escenario manual: abrir expediente, ver pestaña `Pagos`, registrar pago, ver saldo actualizado y reversar con motivo. | Revertir `app/(admin)/patients/[id]/page.tsx`, `src/components/admin/patient-record/PatientRecordTabs.tsx`, `src/components/admin/patient-record/PatientPaymentsTab.tsx` y tests de UI. |
| 4 | Agregar vista global de cartera y cierre de verificación. | PR 4 | `npm run test -- app/api/admin/accounts-receivable/route.test.ts app/(admin)/accounts-receivable/page.test.tsx && npm run typecheck && npm run build` | Escenario manual: abrir `Cartera`, verificar pacientes con saldo positivo, planes vencidos y estado vacío. | Revertir `app/(admin)/accounts-receivable/page.tsx`, `app/(admin)/layout.tsx` y tests de navegación/cartera. |

## Phase 1: Persistencia de pagos y validación financiera

- [x] 1.1 RED: Crear `src/lib/admin/__tests__/validate-payments.test.ts` con casos para método válido/inválido, monto `100.50`, monto `0`/negativo, fecha inválida, motivo de reverso vacío y `thresholdDays` inválido.
- [x] 1.2 RED: Crear `src/lib/admin/__tests__/payments.test.ts` con fixtures Supabase para listar por fecha descendente, crear pago ligado a plan, crear pago a cuenta, rechazar plan de otro paciente, actualizar referencia/notas de pago activo, rechazar actualización de reversado, reversar con motivo y rechazar doble reverso.
- [x] 1.3 GREEN: Crear `supabase/migrations/0016_payments.sql` con enum `payment_method`, tabla `payments`, constraints de monto/motivo, índices mínimos, RLS habilitado y revocación coherente de acceso `anon`.
- [x] 1.4 GREEN: Crear `supabase/migrations/down/0016_payments.down.sql` con reversión en orden seguro de índices, tabla y enum, documentando que datos reales requieren aprobación antes de retirar esquema.
- [x] 1.5 GREEN: Extender `src/lib/admin/types.ts` con `PaymentMethod`, `Payment`, `PaymentInput`, `PaymentUpdateInput`, `PaymentReversalInput`, `PlanBalance`, `PatientReceivableSummary` y `AccountsReceivableRow`.
- [x] 1.6 GREEN: Extender `src/lib/admin/validate.ts` con `parsePaymentMethod`, `parseMoneyPositive`, `parsePaidAt`, `parseVoidReason` y `parseThresholdDays` siguiendo el patrón `ValidationError` existente.
- [x] 1.7 GREEN: Crear `src/lib/admin/payments.ts` con mapeo snake_case→camelCase, `listPayments`, `createPayment`, `updatePayment` y `reversePayment`; validar que `treatmentPlanId` pertenezca al paciente antes de insertar/actualizar.
- [x] 1.8 REFACTOR/VERIFY: Ejecutar `npm run test -- src/lib/admin/__tests__/validate-payments.test.ts src/lib/admin/__tests__/payments.test.ts` y ajustar nombres/mapeos sin cambiar comportamiento.

## Phase 2: Saldos derivados, créditos y morosidad

- [x] 2.1 RED: Crear `src/lib/admin/__tests__/accounts-receivable.test.ts` con escenarios de saldo global sin pagos, pagos ligados + pagos a cuenta, pago reversado excluido, estados elegibles/no elegibles, saldo por plan, pago a cuenta que no reduce plan, sobrepago global/por plan, centavos, saldo cero, `accepted_at`, fallback `created_at` y umbral configurable.
- [x] 2.2 GREEN: Crear `src/lib/admin/accounts-receivable.ts` con `getPatientReceivableSummary` y `listAccountsReceivable`, excluyendo pagos reversados y planes `draft`, `presented` o `cancelled`.
- [x] 2.3 GREEN: En `src/lib/admin/accounts-receivable.ts`, calcular `creditAmount`, `unallocatedPaidAmount`, `lastPaymentAt`, `baseDateSource`, `daysPastDue` e `isPastDue` sin materializar saldos.
- [x] 2.4 RED: Crear `app/api/admin/accounts-receivable/route.test.ts` para `401`, umbral inválido, respuesta `{ accountsReceivable }`, exclusión de saldos `0.00`/crédito y planes vencidos destacados.
- [x] 2.5 GREEN: Crear `app/api/admin/accounts-receivable/route.ts` con `requireUser()`, `handleAdminRequest()`, `parseThresholdDays()` y respuesta `{ accountsReceivable }`.
- [x] 2.6 REFACTOR/VERIFY: Ejecutar `npm run test -- src/lib/admin/__tests__/accounts-receivable.test.ts app/api/admin/accounts-receivable/route.test.ts` y revisar que las sumas con centavos no pierdan precisión observable.

## Phase 3: API administrativa de pagos del paciente

- [x] 3.1 RED: Crear `app/api/admin/patients/[id]/payments/route.test.ts` para `GET` autenticado `{ payments, summary }`, `POST` exitoso, `401` sin sesión, `400` por input inválido y rechazo de plan de otro paciente.
- [x] 3.2 RED: Crear `app/api/admin/payments/[paymentId]/route.test.ts` para `PATCH { action: 'update' }`, `PATCH { action: 'reverse' }`, motivo requerido, pago reversado no modificable, doble reverso rechazado y ausencia/rechazo de `DELETE` físico.
- [x] 3.3 GREEN: Crear `app/api/admin/patients/[id]/payments/route.ts` con `GET` que combine `listPayments(patientId)` y `getPatientReceivableSummary(patientId)`, y `POST` que registre el pago con `user.id`.
- [x] 3.4 GREEN: Crear `app/api/admin/payments/[paymentId]/route.ts` con `PATCH` discriminado por `action: 'update' | 'reverse'`, usando `parseJsonBody()` y sin operación administrativa `DELETE`.
- [x] 3.5 REFACTOR/VERIFY: Ejecutar `npm run test -- app/api/admin/patients/[id]/payments/route.test.ts app/api/admin/payments/[paymentId]/route.test.ts` y confirmar respuestas `401/400/404/409` bajo `handleAdminRequest()`.

## Phase 4: Pestaña `Pagos` en expediente del paciente

- [x] 4.1 RED: Modificar `app/(admin)/patients/[id]/page.test.tsx` para exigir que la navegación muestre `Pagos` y que un fallo al cargar pagos muestre error recuperable sin ocultar otras pestañas.
- [x] 4.2 RED: Crear `src/components/admin/patient-record/PatientPaymentsTab.test.tsx` para saldo global, saldos por plan, pagos a cuenta, historial con reversados visibles, crédito/saldo negativo, estado vacío, error, submit de pago y reverso con motivo.
- [x] 4.3 GREEN: Modificar `app/(admin)/patients/[id]/page.tsx` para cargar `/api/admin/patients/${patientId}/payments`, mantener estado financiero independiente y refrescar después de registrar/reversar pagos.
- [x] 4.4 GREEN: Modificar `src/components/admin/patient-record/PatientRecordTabs.tsx` para agregar `TabId` `payments`, etiqueta `Pagos` y render de `PatientPaymentsTab` sin romper `Datos`, `Historia`, `Consultas`, `Citas` ni `Plan de tratamiento`.
- [x] 4.5 GREEN: Crear `src/components/admin/patient-record/PatientPaymentsTab.tsx` con resumen de saldo, lista de planes, sección de pagos a cuenta, historial cronológico, formulario de registro manual y acción de reverso con estados `LoadingState`, `ErrorState` y `EmptyState`.
- [x] 4.6 REFACTOR/VERIFY: Ejecutar `npm run test -- src/components/admin/patient-record/PatientPaymentsTab.test.tsx app/(admin)/patients/[id]/page.test.tsx` y revisar que el copy de UI sea español de México neutral/profesional.

## Phase 5: Vista global de cartera por cobrar

- [x] 5.1 RED: Crear `app/(admin)/accounts-receivable/page.test.tsx` para listar pacientes con saldo positivo, mostrar planes vencidos/días de atraso, ocultar saldos cero/crédito y mostrar estado vacío claro.
- [x] 5.2 RED: Modificar o crear prueba de `app/(admin)/layout.tsx` si existe harness de navegación, verificando que aparezca el acceso `Cartera`; si no existe harness estable, documentar N/A en el resultado de apply.
- [x] 5.3 GREEN: Crear `app/(admin)/accounts-receivable/page.tsx` con carga de `/api/admin/accounts-receivable?thresholdDays=30`, cards/tabla de cartera pendiente, planes vencidos y estado vacío.
- [x] 5.4 GREEN: Modificar `app/(admin)/layout.tsx` para agregar navegación `Cartera` sin afectar rutas existentes.
- [x] 5.5 REFACTOR/VERIFY: Ejecutar `npm run test -- app/(admin)/accounts-receivable/page.test.tsx app/api/admin/accounts-receivable/route.test.ts` y validar manualmente el escenario de cartera con datos mockeados o fixture UI.

## Phase 6: Verificación final y preparación de entrega

- [x] 6.1 VERIFY: Ejecutar `npm run test` completo y registrar cualquier falla preexistente o nueva con evidencia concreta.
- [x] 6.2 VERIFY: Ejecutar `npm run typecheck` y corregir errores de tipos en pagos, saldos, rutas y props de UI.
- [x] 6.3 VERIFY: Ejecutar `npm run build` para validar App Router, rutas dinámicas y componentes client/server.
- [x] 6.4 VERIFY: Revisar que `npm run lint` no está definido en `package.json`; si el apply intenta lint, reportarlo como N/A por script ausente en vez de inventar verificación.
- [x] 6.5 REFACTOR: Revisar nombres, estados vacíos y copy visible para mantener español de México neutral/profesional y preservar identificadores en inglés.
- [x] 6.6 DELIVERY: Preparar commits por work unit con mensajes Conventional Commits y sin `Co-Authored-By`; mantener tests junto al comportamiento de cada PR slice.
