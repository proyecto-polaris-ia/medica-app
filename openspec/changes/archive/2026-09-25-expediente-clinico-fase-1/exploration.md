# Exploración: expediente-clínico-fase-1

## Current State

Hoy el sistema solo tiene un **resumen de paciente de solo lectura**:

- `patients` almacena `id`, `full_name`, `phone_e164`, `email`, `notes`.
- `src/lib/admin/patient-record.ts` construye `PatientRecord` con el paciente, sus citas futuras activas y sus citas `attended`.
- `app/api/admin/patients/[id]/record/route.ts` expone ese resumen vía GET.
- `app/(admin)/patients/[id]/page.tsx` renderiza `PatientRecordView` con datos personales + citas.
- La especificación base `openspec/specs/patient-record-summary/spec.md` describe exactamente ese comportamiento de solo lectura.

El stack ya tiene las capas necesarias:

- Capa de servicio en `src/lib/admin/` con mapeo fila→tipo, `validate.ts`, `errors.ts` y tests con mocks de Supabase.
- Rutas API en `app/api/admin/` con `requireUser`, `handleAdminRequest` y manejo de `ValidationError`/`NotFoundError`/`ConflictError`.
- UI reutilizable: `DataTable`, `FormModal`, `LoadingState`, `ErrorState`, `EmptyState`.
- Migraciones idempotentes con `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CHECK`, `UNIQUE` parciales, RLS (`ENABLE ROW LEVEL SECURITY` + `REVOKE ALL ... FROM anon`) y scripts `down/` correspondientes.

## Affected Areas

- `supabase/migrations/` — nueva migración para extender `patients` y crear `patient_medical_history` y `clinical_visits`; RLS; índices; script `down/`.
- `supabase/migrations/down/` — rollback de tablas, columnas e índices nuevos.
- `src/lib/admin/types.ts` — tipos `Patient` extendido, `MedicalHistory`, `ClinicalVisit`, etc.
- `src/lib/admin/validate.ts` — validadores para fechas, sexo, jsonb, campos clínicos.
- `src/lib/admin/patients.ts` — actualizar `SELECT_COLUMNS`, `mapRow` y `validatePatientInput` con los nuevos campos de identificación.
- `src/lib/admin/patient-record.ts` — ya no será el único agregador; probablemente siga sirviendo la pestaña **Citas**.
- `src/lib/admin/medical-history.ts` (nuevo) — lectura/escritura 1:1 de historia clínica.
- `src/lib/admin/clinical-visits.ts` (nuevo) — CRUD de notas SOAP.
- `app/api/admin/patients/[id]/route.ts` — PATCH ahora recibe más campos de identificación.
- `app/api/admin/patients/[id]/medical-history/route.ts` (nuevo) — GET/PATCH historia clínica.
- `app/api/admin/patients/[id]/clinical-visits/route.ts` (nuevo) — GET/POST lista de consultas.
- `app/api/admin/patients/[id]/clinical-visits/[visitId]/route.ts` (nuevo) — GET/PATCH/DELETE consulta individual.
- `app/(admin)/patients/[id]/page.tsx` — convertir en tabs: Datos / Historia / Consultas / Citas.
- `src/components/admin/PatientRecordView.tsx` — refactorizar en vistas por pestaña o nuevos componentes.
- `openspec/specs/patient-record-summary/spec.md` — debe pasar de "solo lectura" a "expediente editable"; la spec delta de esta fase lo MODIFICARÁ.
- Tests en `src/lib/admin/__tests__/` y `app/api/admin/patients/**/route.test.ts` — extender para cubrir nuevas entidades y campos.

## Approaches

### 1. Agregar todo al agregador `PatientRecord`

Extender `getPatientRecord` para que devuelva paciente + historia + consultas + citas en un solo endpoint, y hacer que `/patients/[id]` sea una página larga con tabs.

- **Pros:** una sola llamada de red inicial, aprovecha la estructura actual, cambios mínimos de rutas.
- **Cons:** payload grande y acoplado; cualquier edición requiere otro endpoint de todas formas; la página y el servicio crecen rápido y superan el presupuesto de 400 líneas.
- **Esfuerzo:** Medio.

### 2. Módulos separados con endpoints independientes (recomendado)

Crear `medical-history.ts` y `clinical-visits.ts` con sus propios endpoints (`/medical-history`, `/clinical-visits`). La pestaña **Citas** sigue usando `/record` existente; **Datos** usa el PATCH de `/patients/[id]`.

- **Pros:** alinea con la arquitectura actual (cada dominio tiene su servicio y ruta), facilita tests, permite cargar tabs bajo demanda, respeta el presupuesto de review y encaja con `strict_tdd: true`.
- **Cons:** más archivos y contratos API; el frontend hace múltiples fetch (aceptable para tabs).
- **Esfuerzo:** Medio-Alto, pero divisible en unidades de entrega.

### 3. Lector agregado + escritores separados

Mantener un endpoint de lectura que agrupe todo (`/record` extendido) pero usar PATCH/POST/DELETE separados para mutar historia y consultas.

- **Pros:** lectura rápida en una sola llamada.
- **Cons:** mezcla dos patrones, el agregador se vuelve costoso de mantener y requiere versionar `PatientRecord`.
- **Esfuerzo:** Medio.

## Recommendation

**Adoptar la opción 2 (módulos separados con endpoints independientes).**

- Sigue el patrón ya establecido en `src/lib/admin/patients.ts`, `appointments.ts` y `patient-record.ts`.
- Mantiene la pestaña **Citas** con el `PatientRecord` existente, evitando romper la spec base hasta que se archive la delta.
- Permite dividir la fase en PRs encadenados si el diff supera 400 líneas (por ejemplo: migraciones + servicios, API, UI).
- Facilita que Fase 2 (odontograma, ICD-10, archivos) se acople como otro módulo sin rediseñar el agregador.

Para la **ficha de identificación**, extender `patients` directamente en la misma migración. Para **historia clínica** y **consultas**, crear tablas nuevas con FK a `patients`, `appointments` (nullable) y `providers`. El diagnóstico en Fase 1 será `text` libre en `clinical_visits.assessment`, sin catálogo ICD-10.

## Risks

- **Información sensible (PHI/PII):** las nuevas tablas deben tener `ENABLE ROW LEVEL SECURITY` y `REVOKE ALL ... FROM anon`, igual que el resto del dominio agenda.
- **Down migration destructiva:** `patient_medical_history` y `clinical_visits` deben tener rollback seguro; si se revierten columnas en `patients` hay que validar que no existan datos que rompan `CHECK` o `NOT NULL` restaurados.
- **Riesgo clínico del diagnóstico libre:** aunque lo escribe un humano, la UI debe dejar claro que es una anotación clínica, no un diagnóstico automatizado ni prescripción. Esto respalda el guardrail "No diagnosticar / No recetar".
- **Crecimiento de la página `/patients/[id]`:** convertirla en tabs con cuatro secciones puede producir un diff mayor a 400 líneas; planear componentes pequeños y considerar PRs encadenados.
- **jsonb en historia clínica:** alergias, condiciones, medicamentos y hábitos irán en `jsonb`. Si más adelante se filtran o ordenan, se necesitarán índices GIN; de lo contrario es razonable para listas pequeñas.
- **Cambio de semántica del spec base:** `patient-record-summary` deja de ser solo lectura. La delta spec debe usar `MODIFIED` para reemplazar el propósito y escenarios afectados, no `ADDED` solamente.

## Ready for Proposal

**Sí.** La exploración confirma que el cambio es viable con la arquitectura actual y que el diagnóstico como texto libre en Fase 1 es la opción más simple. El siguiente paso es `sdd-propose`, donde se definirá alcance, rollback y estrategia de entrega (posiblemente PRs encadenados para no exceder 400 líneas).
