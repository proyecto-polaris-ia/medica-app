# Exploración: payments-delinquency

Exploración para GitHub issue #66: Fase 3 del expediente dental, enfocada en registro manual de pagos, cálculo de saldos y visibilidad de morosidad. La solución debe partir de planes de tratamiento ya entregados en Fase 2, sin pasarela de pago ni CFDI.

## Current State

- El producto es una app dental Next.js App Router + TypeScript con Supabase/Postgres como fuente de verdad. Las migraciones y RLS viven en `supabase/migrations/`.
- El expediente del paciente ya tiene pestañas `Datos`, `Historia`, `Consultas`, `Citas` y `Plan de tratamiento` en `src/components/admin/patient-record/PatientRecordTabs.tsx`.
- Fase 2 agregó `treatment_plans` y `treatment_plan_items` mediante `supabase/migrations/0015_treatment_plans.sql`, con `total_amount numeric(12,2)`, `accepted_at`, estados `draft/presented/accepted/in_progress/completed/cancelled`, RLS habilitado y down migration.
- La capa de datos admin sigue el patrón `src/lib/admin/<domain>.ts`: mapeo de filas snake_case a tipos camelCase, validadores en `src/lib/admin/validate.ts`, errores de dominio y pruebas Vitest con Supabase mockeado.
- Las rutas admin siguen el patrón `app/api/admin/**/route.ts`: `requireUser()`, `handleAdminRequest()`, parseo explícito de body y respuestas JSON.
- La UI admin actual carga datos client-side con `fetch`, estados `LoadingState/ErrorState/EmptyState` y componentes tabulares/modales reutilizables.
- No existe una tabla financiera ni módulos `payments`/`accounts-receivable` todavía.

## Affected Areas

- `supabase/migrations/0016_payments.sql` — nueva tabla `payments`, índices, RLS, restricciones de monto/método, auditoría mínima y relación opcional a `treatment_plans`.
- `supabase/migrations/down/0016_payments.down.sql` — reversión segura en orden inverso.
- `src/lib/admin/types.ts` — tipos `Payment`, `PaymentInput`, balances, morosidad/cartera y método de pago.
- `src/lib/admin/validate.ts` — validadores para método de pago, monto positivo y fechas de pago.
- `src/lib/admin/payments.ts` — CRUD autenticado de pagos, mapeo de filas y reglas de edición/reversión.
- `src/lib/admin/accounts-receivable.ts` — cálculo de saldo por paciente/plan y detección de morosidad con umbral configurable.
- `src/lib/admin/__tests__/payments.test.ts` — tests de CRUD/cálculo: sin pagos, pagos parciales, sobrepago, pago a cuenta y múltiples planes.
- `src/lib/admin/__tests__/accounts-receivable.test.ts` — tests de cartera vencida, umbral y antigüedad.
- `app/api/admin/patients/[id]/payments/route.ts` — historial y registro de pagos por paciente.
- `app/api/admin/payments/[paymentId]/route.ts` — lectura/edición/reversión de un pago específico.
- `app/api/admin/accounts-receivable/route.ts` — endpoint de cartera vencida.
- `app/(admin)/patients/[id]/page.tsx` — carga del estado financiero del paciente y callback de actualización.
- `src/components/admin/patient-record/PatientRecordTabs.tsx` — nueva pestaña `Pagos`.
- `src/components/admin/patient-record/PaymentsTab.tsx` — saldo, historial y formulario de registro manual.
- `app/(admin)/accounts-receivable/page.tsx` o `app/(admin)/payments/page.tsx` — vista global de cartera vencida.
- `app/(admin)/layout.tsx` — navegación a la vista de cartera si se crea una página independiente.
- `openspec/specs/patient-record-summary/spec.md` — delta para agregar la pestaña `Pagos` al expediente.
- `openspec/specs/payments/spec.md` y `openspec/specs/accounts-receivable/spec.md` — nuevas capacidades observables.

## Approaches

1. **Pagos físicos editables con DELETE/PATCH físico** — crear pagos y permitir edición/borrado directo.
   - Pros: implementación más corta y UI simple.
   - Cons: contradice la regla del issue de no borrar pagos sin auditoría; riesgo alto para trazabilidad financiera.
   - Effort: Medium

2. **Pagos manuales con soft-delete/reverso y saldos derivados** — registrar pagos como filas inmutables en lo esencial, permitir correcciones controladas y excluir reversados de saldos.
   - Pros: mantiene trazabilidad, encaja con operación manual, saldos se derivan de datos reales y reduce riesgo de auditoría.
   - Cons: requiere modelar `voided_at/voided_by/void_reason` o una semántica equivalente; más tests de cálculo.
   - Effort: High

3. **Saldo materializado por paciente/plan** — guardar saldos calculados en columnas o tablas resumen.
   - Pros: lecturas rápidas para cartera vencida.
   - Cons: riesgo de desincronización; demasiado pronto para el volumen actual; complica TDD y rollback.
   - Effort: High

## Recommendation

Usar el enfoque 2: tabla `payments` con registro manual, soft-delete/reverso para auditoría básica y saldos derivados en la capa de datos. Es la base correcta: primero se protege la verdad contable, luego se optimiza si el volumen lo exige. Para morosidad, definir en design un umbral configurable con default de 30 días y origen de fecha primario `accepted_at`; si `accepted_at` falta para planes aceptados históricos, usar `created_at` como fallback explícito o marcar el plan como no evaluable según la decisión de diseño.

La UI debería dividirse en dos superficies:

- Pestaña `Pagos` dentro del expediente: saldo del paciente, pagos, pagos por plan y registro manual.
- Vista de `Cartera`/`Cartera vencida`: pacientes con saldo, planes vencidos, días de atraso y último pago.

## Risks

- `payments.treatment_plan_id` nullable permite pagos a cuenta; el diseño debe especificar si esos pagos reducen solo el saldo del paciente o también se asignan automáticamente a planes. Recomendación: no autoasignar en esta fase; mostrar impacto solo en saldo global del paciente.
- El cálculo `Σ planes aceptados/en progreso/completados - Σ pagos` debe excluir planes `draft/presented/cancelled` y pagos reversados; esto debe quedar en spec y tests.
- Sobrepagos deben estar permitidos o bloqueados explícitamente. Recomendación: permitirlos a nivel de pago, mostrar saldo negativo/crédito y cubrirlo con tests si el negocio lo acepta; si no, bloquear en API.
- La morosidad depende de `accepted_at`; hay que validar que Fase 2 siempre lo pueble al aceptar un plan y definir fallback para datos existentes.
- RLS existe habilitado en tablas de treatment plans, pero el acceso real admin usa service role; la migración de pagos debe revocar `anon` y mantener políticas/privilegios coherentes con el patrón del repo.
- Strict TDD está activo; los tests de balance deben ir antes de implementación y cubrir precisión monetaria con centavos para evitar errores de flotantes.
- El alcance supera probablemente 400 líneas, por lo que `auto-chain` debe dividir implementación posterior en PRs pequeños.

## Ready for Proposal

Yes. La propuesta puede avanzar con alcance claro: persistencia de pagos manuales, saldos derivados, morosidad configurable y UI de expediente/cartera. El proposal debe decidir explícitamente:

1. semántica de reverso/soft-delete;
2. si el sobrepago se permite como crédito o se rechaza;
3. origen exacto de la morosidad (`accepted_at` con default de 30 días recomendado);
4. comportamiento de pagos a cuenta no ligados a plan;
5. nombre/ruta de la vista global de cartera vencida.
