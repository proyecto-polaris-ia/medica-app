## Exploration: Planes de tratamiento (Fase 2 del expediente)

### Current State

- La Fase 1 del expediente ya está integrada. Existen las tablas `patient_medical_history` e `historia 1:1` y `clinical_visits` (notas SOAP), con columnas de ficha en `patients` y RLS activa.
- El catálogo `services` solo tiene `name` y `duration_minutes`; no tiene precio. `providers` tiene `name` y `color`.
- La capa de datos administrativa (`src/lib/admin/*`) usa `getSupabaseAdmin()` (service role, bypass RLS), funciones `list/create/update/delete`, mapeo manual de `snake_case` a `camelCase`, `SELECT_COLUMNS` explícito y validadores en `validate.ts`.
- Los endpoints administrativos usan `requireUser()` + `handleAdminRequest()`, códigos 200/201/204 y errores 400/401/404/500.
- La UI del expediente está organizada en `PatientRecordTabs.tsx` con un arreglo `TABS` y componentes por pestaña; la página `app/(admin)/patients/[id]/page.tsx` carga cada recurso con `fetch` y propaga callbacks `on*Changed`.
- Las especificaciones usan RFC 2119 y escenarios Given/When/Then (`openspec/specs/clinical-record/spec.md`).

### Affected Areas

- `supabase/migrations/0015_treatment_plans.sql` — nueva tabla `treatment_plans`, tabla `treatment_plan_items`, índices, enums de estado, RLS.
- `supabase/migrations/down/0015_treatment_plans.down.sql` — reversión ordenada de índices, tablas y tipos.
- `src/lib/admin/types.ts` — tipos `TreatmentPlan`, `TreatmentPlanItem`, `TreatmentPlanInput`, `TreatmentPlanItemInput`.
- `src/lib/admin/validate.ts` — validadores para cantidad, precio, estado del plan, estado del ítem y notación FDI.
- `src/lib/admin/treatment-plans.ts` — funciones de listado, obtención, creación, actualización y eliminación de planes e ítems.
- `src/lib/admin/__tests__/treatment-plans.test.ts` — pruebas unitarias con mocks de `getSupabaseAdmin`, siguiendo el estilo de `clinical-visits.test.ts`.
- `app/api/admin/patients/[id]/treatment-plans/route.ts` — `GET` y `POST`.
- `app/api/admin/patients/[id]/treatment-plans/[planId]/route.ts` — `GET`, `PATCH` y `DELETE`.
- `app/api/admin/patients/[id]/treatment-plans/[planId]/items/route.ts` — posible ruta anidada para ítems, o manejo de ítems dentro del plan según decida el diseño.
- `app/(admin)/patients/[id]/page.tsx` — carga planes y pasa el estado/errores a las pestañas.
- `src/components/admin/patient-record/PatientRecordTabs.tsx` — agregar la pestaña `plans` con etiqueta "Plan de tratamiento".
- `src/components/admin/patient-record/TreatmentPlansTab.tsx` — nuevo componente de pestaña.
- `src/components/admin/patient-record/TreatmentPlanForm.tsx` — formulario de cabecera e ítems.

### Approaches

#### 1. Cálculo de `total_amount`

**Opción A: Columna almacenada + recálculo explícito en borrador**

- `total_amount` se guarda en la tabla y representa el monto acordado con el paciente.
- Mientras `status = 'draft'`, la capa de aplicación recalcula y persiste el total cada vez que se crea, edita o elimina un ítem.
- Una vez que el plan cambia a `presented`, `accepted` o posterior, el total solo se actualiza mediante una acción explícita (por ejemplo, regenerar versión o revertir a `draft`).

- Pros: respeta el requerimiento de "foto" del acuerdo; compatible con historial futuro; simple de auditar.
- Cons: requiere lógica de guardia en la capa de aplicación para evitar mutaciones silenciosas en estados avanzados.
- Esfuerzo: Medio.

**Opción B: Columna generada por trigger en la base de datos**

- Un trigger recalcula `total_amount` siempre que cambia un ítem.

- Pros: total siempre consistente con los ítems; menos código de aplicación.
- Cons: invalida el concepto de "monto aceptado" si el dentista edita ítems después de la aceptación; dificulta versionar acuerdos; rompe la intención del issue.
- Esfuerzo: Bajo.

**Opción C: Sin columna; calcular al vuelo**

- El total siempre se deriva de `quantity * unit_price` de los ítems.

- Pros: nunca hay desfasamiento.
- Cons: no se puede preservar el monto histórico aceptado; complica reportes y morosidad futura.
- Esfuerzo: Bajo.

#### 2. Campos para Fase 3 (pagos / morosidad)

**Opción A: Agregar `accepted_at` ahora y diferir `due_date`**

- `accepted_at timestamptz NULL` se llena cuando el plan pasa a `accepted`.
- `due_date` o `first_payment_due_date` se agrega en la Fase 3, cuando se defina el modelo de pagos.

- Pros: captura el momento de aceptación sin inventar un modelo de pagos prematuro; migración futura mínima.
- Cons: no permite calcular morosidad hasta la Fase 3.

**Opción B: Agregar `accepted_at` y `due_date` desde ahora**

- Incluye ambos campos en `treatment_plans`.

- Pros: la Fase 3 puede calcular morosidad sin alterar tabla existente.
- Cons: `due_date` es especulativo; no hay reglas de negocio definidas aún para pagos a plazos, abonos o número de pagos.

#### 3. Relación entre `treatment_plan_items.unit_price` y `services`

**Opción A: Precio copiado del catálogo**

- No es viable: `services` no tiene columna de precio.

**Opción B: Precio por ítem, con `service_id` opcional como referencia descriptiva**

- `unit_price` se captura manualmente en cada ítem.
- `service_id` es nullable y sirve para heredar nombre/duración del catálogo, pero no precio.

- Pros: refleja el acuerdo real con el paciente (precios pueden variar por caso); no requiere modificar `services`.
- Cons: el usuario debe teclear el precio; riesgo de error humano.

### Recommendation

- **Usar la Opción A para `total_amount`**: columna almacenada que se recalcula automáticamente solo mientras el plan está en `draft`; en estados posteriores, cualquier cambio de ítems debe requerir una transición explícita de estado o generar una nueva versión/revertir a borrador.
- **Agregar `accepted_at timestamptz NULL` ahora** para registrar la aceptación sin comprometerse con un modelo de pagos inexistente. Diferir `due_date` y los campos de pago a la Fase 3, momento en el que se decida si serán abonos, pagos únicos o mixtos.
- **Mantener `unit_price` como precio independiente por ítem**, con `service_id` opcional como referencia al catálogo. Esto respeta que `services` es un catálogo de procedimientos (`duration_minutes`), no de tarifas fijas.
- **Número de migración**: `0015`, con su contraparte `down/0015_treatment_plans.down.sql`.
- **Estilos de migración**: seguir el patrón idempotente de Fase 1 (`CREATE TABLE IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE TYPE ... IF NOT EXISTS` dentro de bloque `DO $$`) y activar RLS con `REVOKE ALL ON TABLE ... FROM anon`.
- **Patrón de implementación**: extender `src/lib/admin/types.ts`, `validate.ts` y crear `src/lib/admin/treatment-plans.ts` con funciones `list/create/update/delete` y operaciones de ítems; agregar rutas API anidadas bajo `app/api/admin/patients/[id]/treatment-plans`; agregar la pestaña en `PatientRecordTabs.tsx` y el componente `TreatmentPlansTab.tsx`.

### Risks

- Mutar ítems después de la aceptación puede alterar el acuerdo económico si no se bloquea en la capa de negocio.
- El catálogo `services` no tiene precio, por lo que no se puede prellenar `unit_price`; se debe validar que sea numérico no negativo.
- La notación FDI (`tooth`) es texto libre; conviene validar formato o permitir valor nulo si no aplica.
- Agregar `due_date` prematuramente puede generar migraciones confusas cuando se defina el flujo de pagos.
- Si los ítems se manejan como sub-recurso, hay que decidir si el formulario envía el plan con ítems en una sola petición o si se actualizan por separado; esto afecta la atomicidad y la experiencia de usuario.

### Ready for Proposal

Sí. Se cuenta con el esquema de Fase 1, el patrón de capa de datos, API, UI y especificaciones. La recomendación principal es almacenar `total_amount` como snapshot y recalcularlo solo en `draft`, agregar `accepted_at` para la Fase 3, y mantener el precio por ítem independiente del catálogo de servicios.
