# Reporte de archivo: add-patient-clinical-files

**Cambio**: `add-patient-clinical-files` (Carga de archivos clínicos del paciente
con Supabase Storage — Issue
[#91](https://github.com/proyecto-polaris-ia/medica-app/issues/91))
**Archivado**: 2026-10-06 (fecha ISO, prefijo de la convención de archivo del
repo)
**Archivado en**: `openspec/changes/archive/2026-10-06-add-patient-clinical-files/`
**Método de archivo**: manual (`git mv`), porque el CLI `openspec` no está
disponible en esta rama (`npx openspec` falla con `could not determine executable
to run`)
**Artefactos previos**: `proposal.md`, `design.md`, `tasks.md`,
`specs/patient-clinical-files/spec.md`, `verify-report.md`

## Estado final (autoritativo — al cierre)

El cambio queda **COMPLETO y archivado**. Resultado de verificación reportado:
**PASS WITH WARNINGS**.

| Hecho | Valor |
|------|-------|
| Issue | [#91](https://github.com/proyecto-polaris-ia/medica-app/issues/91) |
| Fases del ciclo SDD | explore → propose → spec → design → tasks → apply → verify → archive — todas ejecutadas |
| Tareas | 41 checkboxes; solo 8.3 y 10.2 abiertas a propósito (verificación manual con datos reales). V.1–V.5 marcadas con su resultado |
| Verificación | `npm run typecheck` ✅ · `npm run test` ✅ 128 archivos / 1137 tests · `npm run build` ✅ · V.5 estructural ✅ |
| Lint | Omitido — no existe script `lint` en `package.json` (hueco preexistente, ajeno al cambio) |
| Requisitos | 9 requisitos / 28 escenarios / 1 capability nueva (`patient-clinical-files`) |
| Entrega | 3 fases con PRs apilados (Fase 1 base sobre `main` → Fase 2 → Fase 3) |
| Commits | `0c6c223` (propuesta), `e922835` (Fase 1), `b906d53` (Fase 2), `153deef` (Fase 3) |
| Migración | `0020_patient_files.sql` — riesgo de renumeración al merge |

## Fases del ciclo SDD (todas ejecutadas)

| Fase | Artefacto / superficie | Estado |
|------|------------------------|--------|
| Explore | Contexto del issue #91 y reutilización de patrones del repo | ✅ |
| Propose | `proposal.md` | ✅ |
| Spec | `specs/patient-clinical-files/spec.md` (9 requisitos / 28 escenarios, RFC 2119) | ✅ |
| Design | `design.md` (15 decisiones + flujo de datos + estrategia de pruebas) | ✅ |
| Tasks | `tasks.md` (41 checkboxes en 3 fases + cierre) | ✅ |
| Apply | 3 PRs apilados, TDD RED→GREEN→TRIANGULATE→REFACTOR | ✅ |
| Verify | `verify-report.md` — PASS WITH WARNINGS | ✅ |
| Archive | este reporte + `git mv` a `archive/2026-10-06-add-patient-clinical-files/` | ✅ |

## Archivos clave entregados

### Fase 1 — Modelo de datos + almacenamiento seguro

- `supabase/migrations/0020_patient_files.sql` — tabla `patient_files`, dos
  índices, RLS (`ENABLE` + `FORCE`), revocación a `anon`, bucket privado
  `patient-files` y policies de `storage.objects` solo para `authenticated`.
- `supabase/migrations/down/0020_patient_files.down.sql` — reverso estructural
  (policies, tabla y bucket).
- `src/lib/admin/patient-files.ts` — servicio: constantes, `validatePatientFileUpload`
  (mensajes en español), `mapRow`, subir/listar/firmar/eliminar y compensación de
  objeto si falla el insert.
- `src/lib/admin/types.ts` — `PatientFile`, `PatientFileCategory`,
  `PatientFileInput` (modificado).
- `app/api/admin/patients/[id]/files/route.ts` — `GET` (lista + URLs firmadas en
  lote) y `POST` (subida `multipart/form-data`).
- `app/api/admin/patients/[id]/files/[fileId]/route.ts` — `GET` (URL firmada de
  descarga) y `DELETE`.

### Fase 2 — Pestaña "Archivos" en el expediente

- `src/components/admin/patient-record/PatientFilesTab.tsx` — drag & drop,
  miniaturas, descarga PDF, categoría, consulta opcional y eliminación.
- `src/components/admin/patient-record/PatientRecordTabs.tsx` — entrada
  `files`/`Archivos` y props de archivos (modificado).
- `app/(admin)/patients/[id]/page.tsx` — estado, carga y cableado de archivos
  (modificado).

### Fase 3 — Integración con la consulta clínica

- `src/components/admin/patient-record/ClinicalVisitForm.tsx` — adjuntar
  archivos **después** de crear/actualizar la consulta, con el
  `clinical_visit_id` resultante (modificado).
- `PatientFilesTab.tsx` — soporte de `clinicalVisitId` fijo (modo consulta).

## Pruebas entregadas (conteo por área)

| Área | Archivo | Casos |
|------|---------|-------|
| Librería | `src/lib/admin/__tests__/patient-files.test.ts` | 24 |
| Ruta de colección | `app/api/admin/patients/[id]/files/route.test.ts` | 13 |
| Ruta de archivo | `app/api/admin/patients/[id]/files/[fileId]/route.test.ts` | 6 |
| Pestaña Archivos | `src/components/admin/patient-record/PatientFilesTab.test.tsx` | 11 |
| Formulario de consulta | `src/components/admin/patient-record/ClinicalVisitForm.test.tsx` | 3 |
| Página del expediente | `app/(admin)/patients/[id]/page.test.tsx` | 12 (incluye las adiciones de la pestaña) |

Suite completa: **128 archivos / 1137 tests en verde**.

## Criterios de aceptación del issue #91

| Criterio | Estado | Evidencia |
|----------|--------|-----------|
| No exponer credenciales de service role al cliente | ✅ PASS | La lib usa `getSupabaseAdmin()` solo en el servidor; el cliente llama a la API propia y nunca recibe la llave. |
| Auth/RLS | ✅ PASS (estructural) | `requireUser()` en la ruta (401 sin sesión) + RLS en la base (`FORCE ROW LEVEL SECURITY`, `REVOKE ... FROM anon`). Verificación estructural de `0020`. |
| Límite de tamaño/tipo rechazado con mensaje en español | ✅ PASS | `validatePatientFileUpload` y la ruta devuelven 400 con mensaje en español; el bucket aplica la segunda barrera. |
| Pruebas | ✅ PASS | Suite completa 128 archivos / 1137 tests en verde. |
| OpenSpec | ✅ PASS | Ciclo SDD completo; este cambio queda archivado con sus artefactos. |

## Specs sincronizadas

| Dominio | Acción | Detalles |
|---------|--------|---------|
| `patient-clinical-files` | ⚠️ Pendiente fuera de esta superficie | La delta spec se conserva en el change archivado (`specs/patient-clinical-files/spec.md`). La sincronización a `openspec/specs/patient-clinical-files/spec.md` **no** se ejecutó en este pase porque queda fuera de las superficies de edición delegadas (`openspec/changes/**`). Queda como pendiente para el maintainer. |

## Contenido del archive

- `proposal.md` ✅
- `design.md` ✅
- `specs/patient-clinical-files/spec.md` ✅ (delta de la capacidad nueva)
- `tasks.md` ✅ (V.1–V.5 con resultado; 8.3 y 10.2 abiertas a propósito)
- `verify-report.md` ✅ (este ciclo sí produjo artefacto de verificación)

## Pendientes (fuera del alcance de este archive)

1. **Tarea 8.3** — verificación manual con datos reales: subir una imagen y un
   PDF desde la pestaña "Archivos", ver la miniatura, descargar el PDF y eliminar
   un archivo. No verificable en CI; registrar la evidencia en el PR.
2. **Tarea 10.2** — verificación manual con datos reales: crear una consulta con
   archivos y editarla con archivos nuevos; confirmar la asociación al
   `clinical_visit_id`. No verificable en CI; registrar la evidencia en el PR.
3. **Hueco de lint** — agregar el script `lint` a `package.json` (hueco
   preexistente, ajeno al cambio).
4. **Renumeración de la migración `0020` al merge** — si otra rama tomó `0020`,
   renumerar y verificar el orden contra `supabase/migrations/`.
5. **Sincronización de specs** — materializar
   `openspec/specs/patient-clinical-files/spec.md` desde la delta archivada (fuera
   de la superficie delegada de este pase).

## Ciclo SDD completo

El cambio quedó explorado, propuesto, especificado, diseñado, planeado,
implementado, verificado y archivado. Listo para el siguiente cambio.
