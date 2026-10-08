# Tareas: Pre-población del formulario de edición de consulta clínica

Change: `fix-clinical-visit-edit-form` (issue #181)
Capacidad: `clinical-record` (modificada)
Recordatorio: `openspec/config.yaml` define `strict_tdd: true`. El fix es un cambio de
comportamiento con prueba de componente determinista, así que se escribe primero la
prueba (RED), se implementa lo mínimo (GREEN) y se cierran los casos alternos
(TRIANGULATE) antes de refactorizar.

## Fase 1 — Prueba que reproduce el defecto (RED)

- [x] 1.1 **Añadir los casos de re-render** en
  `src/components/admin/patient-record/ClinicalVisitForm.test.tsx`:
  - Edición: `render` con `visit={null}` y luego `rerender` con `visit={savedVisitFull}`
    (todos los campos SOAP poblados) → cada campo muestra su valor.
  - Limpieza: `rerender` de `visit={savedVisitFull}` a `visit={null}` → campos vacíos.
  - Sin residuos: escribir con una consulta cargada y `rerender` a `visit={null}` →
    campos vacíos (el caso "Nueva consulta" no hereda datos).
  - Cambio entre consultas: escribir y `rerender` a **otra** consulta → valores de la
    nueva consulta.
  Archivos: `src/components/admin/patient-record/ClinicalVisitForm.test.tsx`.
  - Check: `npx vitest run src/components/admin/patient-record/ClinicalVisitForm.test.tsx`
    (debe fallar por campos vacíos en la edición).

## Fase 2 — Corrección (GREEN)

- [x] 2.1 **Implementar el resync** en `ClinicalVisitForm.tsx`: agregar
  `useEffect(() => { setFormData(visitToInput(visit)); }, [visit]);` con comentario en
  español. Sin tocar `handleSubmit`, el flujo de archivos ni `PatientVisitsTab.tsx`.
  Archivos: `src/components/admin/patient-record/ClinicalVisitForm.tsx`.
  - Check: `npx vitest run src/components/admin/patient-record/ClinicalVisitForm.test.tsx`
    (todos los casos en verde, incluidos los previos).

## Fase 3 — TRIANGULATE / REFACTOR

- [x] 3.1 **Verificar los casos alternos** de la Fase 1.1 (limpieza sin residuos, cambio
  entre consultas) y confirmar que las pruebas existentes de guardado/archivos siguen
  verdes. Archivos: `src/components/admin/patient-record/ClinicalVisitForm.test.tsx`.
  - Check: `npx vitest run src/components/admin/patient-record/ClinicalVisitForm.test.tsx`

## Fase 4 — Documentación OpenSpec

- [x] 4.1 **Crear el change** `openspec/changes/fix-clinical-visit-edit-form/` con
  `proposal.md`, `design.md`, `tasks.md` y `specs/clinical-record/spec.md` (delta
  `## ADDED Requirements`, una sola capacidad: `clinical-record`).
  Archivos: `openspec/changes/fix-clinical-visit-edit-form/**`.
  - Check: `find openspec/changes/fix-clinical-visit-edit-form -type f`

## Fase 5 — Verificación

- [x] 5.1 **Typecheck.** `npx tsc --noEmit` sin errores.
- [x] 5.2 **Lint.** `npm run lint` sin errores nuevos.
- [x] 5.3 **Recorrido de escenarios de spec.** Marcar cada escenario de
  `specs/clinical-record/spec.md` con su evidencia observada (comando + resultado).

## No objetivos (explícitos, fuera de alcance)

- `src/components/admin/patient-record/PatientVisitsTab.tsx`: sin cambios.
- Remonte por `key` o formulario no controlado: descartados (ver `design.md`).
- Contrato de guardado (`POST`/`PATCH`), backend, Supabase, migraciones y RLS: sin cambios.
- `travelhub-app`: no se modifica ningún archivo de ese proyecto.
