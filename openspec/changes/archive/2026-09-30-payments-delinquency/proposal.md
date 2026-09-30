# Proposal: Pagos manuales y morosidad

## Intent

Agregar seguimiento financiero básico al expediente dental para que el staff registre pagos manuales, consulte saldos por paciente y por plan de tratamiento, y detecte cartera vencida sin introducir pasarela de pago, CFDI ni automatización fiscal. El cambio parte de Fase 2: `treatment_plans` contiene los montos acordados y sus estados; esta fase agrega visibilidad operativa sobre cobros y morosidad.

## Scope

### In Scope

- Crear la capacidad `payments` para registrar, consultar, actualizar y reversar pagos manuales asociados a un paciente y opcionalmente a un plan de tratamiento.
- Crear la capacidad `accounts-receivable` para calcular saldos derivados y cartera vencida por paciente y plan.
- Modificar `patient-record-summary` para agregar la pestaña `Pagos` al expediente del paciente.
- Agregar migración idempotente con tabla `payments`, índices, RLS, restricciones monetarias, relación opcional a `treatment_plans` y down migration.
- Agregar endpoints autenticados, capa de datos admin, validadores, tipos, pruebas de saldos/morosidad y UI administrativa básica.

### Out of Scope

- Pasarela de pagos, links de pago o conciliación automática bancaria.
- CFDI, facturación fiscal, recibos formales y contabilidad completa.
- Reembolsos formales; esta fase usa reverso/soft-delete operativo de pagos.
- Nómina, inventario y reportes financieros avanzados.
- Asignación automática de pagos a cuenta no ligados a un plan específico.

## Capabilities

### New Capabilities

- `payments`: Registro manual e historial de pagos de pacientes, con método, referencia, notas, usuario creador, relación opcional a plan de tratamiento y reverso operativo sin borrado físico.
- `accounts-receivable`: Consulta de saldos derivados y cartera vencida usando montos de planes aceptados/en progreso/completados menos pagos no reversados, con umbral configurable de morosidad.

### Modified Capabilities

- `patient-record-summary`: Agregar la pestaña `Pagos` al expediente del paciente para mostrar historial de pagos, saldo del paciente y saldos por plan.

## Approach

- Modelar `payments` como tabla nueva con `patient_id`, `treatment_plan_id` nullable, `amount numeric(12,2)`, `method` enum (`cash`, `card`, `transfer`, `other`), `paid_at`, `reference`, `notes`, `created_by`, timestamps y campos de reverso/soft-delete para auditoría operativa.
- Calcular saldos de forma derivada, no materializada:  
  - saldo por paciente = suma de `total_amount` de planes `accepted`, `in_progress` y `completed` menos pagos no reversados del paciente;  
  - saldo por plan = `total_amount` del plan menos pagos no reversados ligados a ese plan.
- No asignar automáticamente pagos sin `treatment_plan_id` a planes individuales; esos pagos reducen el saldo global del paciente y aparecen como pagos a cuenta.
- Permitir sobrepago como crédito operativo visible mediante saldo negativo, para no bloquear captura real de caja; los specs y tests deberán cubrirlo explícitamente.
- Detectar morosidad con umbral configurable, default 30 días, usando `accepted_at` como fecha fuente. Si un plan elegible no tiene `accepted_at`, usar `created_at` como fallback explícito para no ocultar deuda histórica.
- Mantener CRUD autenticado en rutas `app/api/admin/**`, lógica en `src/lib/admin/**`, UI client-side consistente con las pestañas existentes del expediente y vista global de cartera en admin.
- Respetar Strict TDD: primero pruebas de validación monetaria, reversos, pagos a cuenta, sobrepagos, saldos por plan/paciente y umbral de morosidad.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/0016_payments.sql` | New | Tabla `payments`, enum de método, índices, RLS, constraints y auditoría mínima. |
| `supabase/migrations/down/0016_payments.down.sql` | New | Reversión segura de tabla, índices y enum. |
| `src/lib/admin/types.ts` | Modified | Tipos de pagos, saldos, cartera vencida y métodos de pago. |
| `src/lib/admin/validate.ts` | Modified | Validación de monto positivo, método, fecha, reverso y referencias opcionales. |
| `src/lib/admin/payments.ts` | New | Capa de datos para CRUD autenticado y reverso operativo de pagos. |
| `src/lib/admin/accounts-receivable.ts` | New | Cálculo derivado de saldos y morosidad. |
| `app/api/admin/patients/[id]/payments/route.ts` | New | Endpoints de pagos del paciente. |
| `app/api/admin/accounts-receivable/route.ts` | New | Endpoint de cartera por cobrar/morosidad. |
| `src/components/admin/patient-record/PatientRecordTabs.tsx` | Modified | Agregar pestaña `Pagos`. |
| `src/components/admin/patient-record/PatientPaymentsTab.tsx` | New | Historial, captura y saldos del paciente. |
| `src/components/admin/**` | Modified/New | Vista global de cartera vencida y estados de carga/error/vacío. |
| `src/lib/admin/__tests__/*.test.ts` | Modified/New | Pruebas de pagos, saldos, morosidad y validadores. |
| `openspec/changes/payments-delinquency/specs/` | New | Delta specs para `payments`, `accounts-receivable` y `patient-record-summary`. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Confusión entre saldo global y saldo por plan cuando existan pagos a cuenta sin plan. | Medium | Specs y UI deben distinguir “pagos ligados a plan” vs “pagos a cuenta”; no hacer allocation automática en esta fase. |
| Morosidad incorrecta si `accepted_at` falta en datos existentes. | Medium | Definir fallback a `created_at`, cubrirlo con tests y mostrar la fecha base usada. |
| Errores de precisión monetaria. | Medium | Usar `numeric(12,2)` en BD, strings/normalización controlada en TypeScript y pruebas con centavos. |
| Eliminación accidental de historial financiero. | Low | Usar reverso/soft-delete en lugar de borrado físico; excluir pagos reversados de saldos. |
| Alcance mayor al presupuesto de revisión. | High | Mantener `auto-chain` y dividir implementación posterior en PRs pequeños bajo la política fija de 400 líneas. |

## Rollback Plan

- Revertir los commits de UI/API/capa admin asociados a esta fase.
- Ejecutar `supabase/migrations/down/0016_payments.down.sql` para retirar la tabla de pagos y sus objetos asociados si no hay datos que preservar.
- Si ya hay datos reales, desactivar temporalmente rutas y navegación de pagos, exportar/resguardar registros y ejecutar rollback de esquema solo con aprobación explícita del mantenedor.
- Como los saldos son derivados, no hay balances materializados que recalcular al revertir.

## Dependencies

- Fase 2 de planes de tratamiento: `treatment_plans.total_amount`, `status`, `accepted_at` y relación con `patients`.
- Supabase/Postgres como fuente de verdad para schema, RLS y constraints.
- Sesión admin existente (`requireUser()` y `handleAdminRequest()`) para endpoints privados.
- Strict TDD activo en `openspec/config.yaml` con `npm run test`, `npx tsc --noEmit` y `npm run build` como verificaciones esperadas.

## Success Criteria

- [ ] La migración `0016_payments` y su down son idempotentes y mantienen RLS/privilegios coherentes con el patrón del repo.
- [ ] Usuarios autenticados pueden crear, listar, actualizar y reversar pagos manuales; usuarios no autenticados reciben `401`.
- [ ] Los saldos por paciente y por plan se calculan desde planes elegibles y pagos no reversados, incluyendo pagos parciales, pagos a cuenta y sobrepagos/créditos.
- [ ] La morosidad usa umbral configurable con default de 30 días y fecha base `accepted_at` con fallback documentado a `created_at`.
- [ ] El expediente del paciente muestra la pestaña `Pagos` con historial, captura y saldos claros.
- [ ] Existe una vista administrativa de cartera por cobrar/morosidad.
- [ ] Las delta specs cubren `payments`, `accounts-receivable` y `patient-record-summary`.
- [ ] `npm run test`, `npx tsc --noEmit` y `npm run build` quedan en verde al terminar implementación/verificación.
