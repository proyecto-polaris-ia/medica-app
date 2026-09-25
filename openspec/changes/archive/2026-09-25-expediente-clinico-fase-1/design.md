# Diseño: Expediente Clínico — Fase 1

## Enfoque técnico

Convertir `/patients/[id]` en expediente editable para staff: extender `patients` con la ficha de identificación, crear `patient_medical_history` (1:1) y `clinical_visits` (SOAP) en una migración idempotente, y exponer endpoints admin por dominio. El diagnóstico es `assessment` (`text` libre) escrito por el dentista; el backend solo valida y persiste, nunca genera ni sugiere diagnósticos. La pestaña Citas conserva `/record`; Datos usa el PATCH de `/patients/[id]`.

## Decisiones de arquitectura

| Decisión | Elección | Alternativas y razón |
|---|---|---|
| Módulos | `medical-history.ts` y `clinical-visits.ts` separados de `patient-record.ts` (opción 2). | Agregar todo a `PatientRecord` acopla lectura/escritura y excede 400 líneas; lectores+escritores mezclan patrones. Módulos por dominio alinean con `patients.ts` y permiten PRs encadenados. |
| Columnas SOAP | `subjective` (S), `objective` (O), `assessment` (A), `plan` (P), más `treatment` y `notes`. | El issue proponía `chief_complaint`/`diagnosis`; `diagnosis` insinúa ICD-10/IA y viola "no diagnosticar". La spec fija `assessment` como campo A; se adopta la nomenclatura de la exploración. |
| jsonb de historia | `allergies`, `systemic_conditions`, `medications`, `oral_habits` como `text[]` en `jsonb NOT NULL DEFAULT '[]'`. | Objetos con severidad/reacción amplían alcance sin demanda; listas planas cubren Fase 1 y admiten GIN después. |
| Upsert de historia | `PUT /medical-history` reemplaza el registro 1:1 (UPSERT sobre `patient_id` UNIQUE). | PATCH parcial requeriría merge por campo; el reemplazo completo coincide con la spec. |
| Cita/proveedor | `appointment_id` y `provider_id` nullable, `ON DELETE SET NULL`. | Preservan la nota clínica aunque se desvincule cita o proveedor. |

## Flujo de datos

```text
Datos     → PATCH /patients/[id]          → updatePatient (ficha)
Historia  → GET/PUT /medical-history      → medical-history.ts (UPSERT)
Consultas → GET/POST /clinical-visits     → clinical-visits.ts
          → GET/PATCH/DELETE /clinical-visits/[visitId]
Citas     → GET /record                   → patient-record.ts (sin cambios)
Acceso    → requireUser() + handleAdminRequest; datos vía service_role (BYPASSRLS)
```

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `supabase/migrations/0013_clinical_record.sql` | Crear | Columnas ficha, tablas `patient_medical_history` y `clinical_visits`, CHECK, índices, RLS + `REVOKE ALL FROM anon`. |
| `supabase/migrations/down/0013_clinical_record.down.sql` | Crear | Revierte tablas/columnas/índices; aborta si datos romperían CHECK/NOT NULL. |
| `src/lib/admin/types.ts` | Modificar | `Patient` extendido, `MedicalHistory`, `ClinicalVisit`. |
| `src/lib/admin/validate.ts` | Modificar | `parseDate`, `parseSex`, `parseStringArray`, `parseStatus`. |
| `src/lib/admin/patients.ts` | Modificar | `SELECT_COLUMNS`, `mapRow`, `validatePatientInput` con ficha. |
| `src/lib/admin/medical-history.ts` | Crear | `getMedicalHistory`, `upsertMedicalHistory`. |
| `src/lib/admin/clinical-visits.ts` | Crear | `list/get/create/update/deleteClinicalVisit`. |
| `app/api/admin/patients/[id]/medical-history/route.ts` | Crear | GET/PUT. |
| `app/api/admin/patients/[id]/clinical-visits/route.ts` | Crear | GET/POST. |
| `app/api/admin/patients/[id]/clinical-visits/[visitId]/route.ts` | Crear | GET/PATCH/DELETE. |
| `app/api/admin/patients/[id]/route.ts` | Modificar | PATCH con ficha. |
| `app/(admin)/patients/[id]/page.tsx` + componentes | Modificar | Tabs Datos/Historia/Consultas/Citas; badge rojo. |

## Interfaces / contratos

```ts
type Patient = { /* ...existentes */ birthDate: string|null; sex: 'male'|'female'|'other'|null;
  address: string|null; occupation: string|null; referralSource: string|null; secondaryPhone: string|null;
  emergencyContactName: string|null; emergencyContactPhone: string|null; emergencyContactRelationship: string|null; };

type MedicalHistory = { patientId: string; allergies: string[]; systemicConditions: string[]; medications: string[];
  pregnancyStatus: 'not_applicable'|'no'|'yes'|null; coagulationDisorders: string|null; anticoagulants: string|null;
  surgeries: string|null; infectiousDiseases: string|null; smoking: 'never'|'former'|'current'|null;
  alcohol: 'never'|'occasional'|'frequent'|null; dentalHistory: string|null; oralHabits: string[];
  clinicalNotes: string|null; createdAt: string; updatedAt: string; };

type ClinicalVisit = { id: string; patientId: string; appointmentId: string|null; providerId: string|null;
  subjective: string; objective: string|null; assessment: string|null; plan: string|null;
  treatment: string|null; notes: string|null; createdAt: string; updatedAt: string; };
```

CHECK: `sex IN ('male','female','other')`; `pregnancy_status IN ('not_applicable','no','yes')`; `smoking IN ('never','former','current')`; `alcohol IN ('never','occasional','frequent')`. `subjective` NOT NULL; los demás campos SOAP se normalizan a `NULL` si están vacíos. `patient_medical_history.patient_id` UNIQUE (1:1). Índices: `clinical_visits(patient_id, created_at desc)` y `clinical_visits(appointment_id)`.

## Estrategia de pruebas

| Capa | Cobertura |
|---|---|
| Unidad | Validadores (fecha, sexo, arrays, statuses); mapeo fila→tipo; UPSERT 1:1; orden descendente; normalización de SOAP vacíos. |
| API | 401 sin sesión; historia vacía devuelve valores vacíos sin error; PUT reemplaza; CRUD de consultas; PATCH ficha; 400/404/409. |
| Regresión | `/record` y Citas intactos; migración aplica y revierte en local; badge rojo solo con alergias/condiciones. |

## Matriz de amenazas

N/A — no se crean rutas de shell, subprocesos, VCS/PR, clasificación de ejecutables ni integración de procesos; solo se añaden endpoints admin bajo `requireUser`.

## Migración, despliegue y reversión

Migración idempotente (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`); se prueba solo en Supabase local. Desplegar esquema antes que backend/UI. El `down/` dropea tablas e índices y remueve columnas de ficha; aborta si restaurar CHECK/NOT NULL violaría datos existentes. Código aditivo: sin migración, los endpoints nuevos fallan limpio.

## Preguntas abiertas

- [ ] ¿Eliminar paciente debe cascadear sus datos clínicos o conservarlos (soft-delete/auditoría)?
- [ ] ¿Listas de alergias/medicamentos requieren catálogo controlado en Fase 2?
