# Propuesta: Expediente Clínico — Fase 1

## Intent

`/patients/[id]` es hoy un resumen de solo lectura. Se requiere un expediente clínico editable — identificación, historia clínica y notas SOAP — para staff autenticado.

## Scope

### In Scope
- Ficha de identificación en `patients`: `birth_date`, `sex` (CHECK), `address`, `occupation`, `referral_source`, `secondary_phone`, `emergency_contact_*`.
- `patient_medical_history` (1:1): alergias, condiciones, medicamentos, embarazo, coagulación, anticoagulantes, cirugías, infecciosas, tabaquismo, alcohol, historia dental, hábitos (jsonb) + auditoría.
- `clinical_visits` (SOAP): `subjective`, `objective`, `assessment` (texto libre), `plan`, tratamiento, notas; FK `patient`, `appointment` (nullable), `provider`.
- Endpoints admin: `medical-history`, `clinical-visits`, `clinical-visits/[visitId]`; PATCH ampliado en `/patients/[id]`.
- UI tabs: Datos / Historia / Consultas / Citas.

### Out of Scope
- Odontograma, radiografías, planes con montos, pagos, recetas, consentimientos, firma digital, ICD-10.

## Capabilities

### New Capabilities
- `clinical-record`: historia clínica 1:1 y notas SOAP con CRUD admin, RLS y pestaña de consultas.

### Modified Capabilities
- `patient-record-summary`: pasa de solo-lectura a expediente editable; sección de datos extendida con la ficha de identificación.

## Approach

Opción 2 de la exploración: módulos separados (`medical-history.ts`, `clinical-visits.ts`) con endpoints independientes. Citas reutiliza `/record`; Datos usa PATCH de `/patients/[id]`. Diagnóstico como `text` libre (lo escribe el dentista; el backend valida y persiste). Migración idempotente con RLS + `REVOKE ALL FROM anon`. PRs encadenados si excede 400 líneas.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/` | New | Migración + `down/` |
| `src/lib/admin/types.ts` | Modified | Tipos nuevos |
| `src/lib/admin/validate.ts` | Modified | Validadores fecha, sexo, jsonb |
| `src/lib/admin/medical-history.ts` | New | Servicio 1:1 |
| `src/lib/admin/clinical-visits.ts` | New | CRUD SOAP |
| `app/api/admin/patients/[id]/...` | New/Modified | Rutas nuevas + PATCH |
| `app/(admin)/patients/[id]/page.tsx` | Modified | Tabs |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| PHI/PII expuesto | Med | RLS + `REVOKE ALL FROM anon` |
| Down migration destructiva | Med | `down/` valida CHECK/NOT NULL |
| Diagnóstico confundido con IA | Baja | UI rotula anotación del dentista |
| Diff > 400 líneas | Alta | Componentes pequeños + PRs encadenados |

## Rollback Plan

Revertir migración con `down/` (dropea tablas/columnas nuevas). El código es aditivo: sin migración, los endpoints nuevos fallan limpio y el frontend degrada a la vista previa. `git revert` revierte API/UI sin tocar datos.

## Dependencies

- Ninguna externa. Reutiliza `requireUser`, `handleAdminRequest`, `DataTable`/`FormModal`.

## Success Criteria

- [ ] Migración aplica y revierte sin error en local.
- [ ] CRUD de historia y consultas pasa tests unit (strict TDD).
- [ ] Endpoints devuelven 401 sin sesión; anon sin acceso vía RLS.
- [ ] Tabs renderizan y persisten ediciones.
