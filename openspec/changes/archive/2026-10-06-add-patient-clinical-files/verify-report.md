# Verify Report: add-patient-clinical-files

## Alcance

Verificación de cierre del cambio `add-patient-clinical-files` (issue
[#91](https://github.com/proyecto-polaris-ia/medica-app/issues/91)) en modo
OpenSpec. Se revisaron los artefactos de propuesta, diseño, spec, tareas e
implementación de las tres fases: migración `0020` + bucket privado, librería de
servicio, rutas de API, pestaña "Archivos" del expediente e integración con la
consulta clínica.

No se creó commit, no se hizo push ni PR, y no se ejecutaron pruebas contra una
base de datos viva.

## Veredicto

**PASS WITH WARNINGS.**

La implementación cumple los criterios de aceptación del issue y los escenarios
de la capability `patient-clinical-files`. Las advertencias son el script `lint`
ausente en `package.json` (brecha ambiental preexistente) y las dos
verificaciones manuales contra la base viva (tareas 8.3 y 10.2), que quedan
abiertas a propósito porque no son verificables en CI.

## Resultados de la fase de verificación (V.1–V.5)

| Tarea | Comando | Resultado | Resumen de evidencia |
|-------|---------|-----------|----------------------|
| V.1 | `npm run typecheck` (`tsc --noEmit`) | ✅ PASS | Sin errores de tipos. |
| V.2 | `npm run lint` | ⚠️ BRECHA AMBIENTAL | `package.json` no define el script `lint`; no se inventó runner. Hueco preexistente, ajeno al cambio. |
| V.3 | `npm run test` (`vitest run`) | ✅ PASS | 128 archivos de prueba / 1137 tests en verde. |
| V.4 | `npm run build` (`next build`) | ✅ PASS | Compila sin errores. |
| V.5 | Verificación estructural de `0020` + textos en español | ✅ PASS | Bucket privado, sin policies `anon`, RLS forzado; mensajes de usuario en español de México. |

## Consistencia con specs y diseño

| Área | Resultado | Evidencia |
|------|-----------|-----------|
| Metadatos en `patient_files` | ✅ Consistente | `supabase/migrations/0020_patient_files.sql` define columnas, CHECK de categoría, `storage_path` UNIQUE y `CHECK (size_bytes > 0)`. |
| Bucket privado sin `anon` | ✅ Consistente | `storage.buckets.public = false`; policies de `storage.objects` solo `TO authenticated`; ninguna referencia a `anon`. |
| RLS en metadatos | ✅ Consistente | `ENABLE` + `FORCE ROW LEVEL SECURITY`, `REVOKE ALL ... FROM anon`, policy `patient_files_admin_all` para `authenticated`. |
| Reverso estructural | ✅ Consistente | `down/0020_patient_files.down.sql` elimina policies, tabla y bucket. |
| Autenticación en rutas | ✅ Consistente | Ambas rutas usan `requireUser()` + `handleAdminRequest`; sin sesión → 401. |
| Aislamiento del service role | ✅ Consistente | La lib usa `getSupabaseAdmin()` solo en el servidor; el cliente llama a la API propia y nunca recibe la llave de servicio. |
| Validación de tipo y tamaño | ✅ Consistente | `validatePatientFileUpload` acepta jpg/png/webp/pdf, rechaza >10 MB con mensaje en español; la ruta devuelve el 400 en español antes de llamar a la lib. |
| Asociación a consulta | ✅ Consistente | `uploadPatientFile` verifica la pertenencia de la visita al paciente; visita ajena → `NotFoundError`. |
| Listado/descarga/eliminación | ✅ Consistente | `listPatientFilesWithUrls` firma en lote (sin N+1); descarga y eliminación cubiertas por tests de lib y ruta. |
| UI expediente | ✅ Consistente | `PatientRecordTabs` incluye `Archivos`; `PatientFilesTab` cubre drag & drop, miniaturas, descarga PDF, categoría, consulta opcional y eliminación. |
| Integración con la consulta | ✅ Consistente | `ClinicalVisitForm` sube archivos **después** de guardar la visitas; los binarios no viajan en el JSON de la consulta. |

## TDD Compliance

| Check | Resultado | Detalles |
|-------|-----------|----------|
| Evidencia TDD reportada | ✅ | `tasks.md` documenta los ciclos RED/GREEN/TRIANGULATE/REFACTOR por tarea, con su comando exacto y resultado. |
| Tareas completadas | ✅ | Todas las tareas de código están `[x]`; solo 8.3 y 10.2 quedan `[ ]` abiertas a propósito. |
| RED confirmado | ⚠️ | La evidencia RED es histórica y vive en `tasks.md`; no se puede reproducir sin revertir la implementación. |
| GREEN confirmado | ✅ | Los tests focales y la suite completa pasan actualmente. |
| Triangulación adecuada | ✅ | Cubre tipo/tamaño inválido, visita ajena, archivo inexistente, sin N+1, modo consulta, cancelación y archivo rechazado. |
| Migración | ➖ Estructural | No hay runner de migraciones en `npm test`; verificación por lectura estructural (tareas 1.1–1.6 y V.5). |

## Pruebas entregadas (conteo por área)

| Área | Archivo | Casos |
|------|---------|-------|
| Librería | `src/lib/admin/__tests__/patient-files.test.ts` | 24 |
| Ruta de colección | `app/api/admin/patients/[id]/files/route.test.ts` | 13 |
| Ruta de archivo | `app/api/admin/patients/[id]/files/[fileId]/route.test.ts` | 6 |
| Pestaña Archivos | `src/components/admin/patient-record/PatientFilesTab.test.tsx` | 11 |
| Formulario de consulta | `src/components/admin/patient-record/ClinicalVisitForm.test.tsx` | 3 |
| Página del expediente | `app/(admin)/patients/[id]/page.test.tsx` | 12 (incluye las adiciones de la pestaña "Archivos") |

Suite completa: 128 archivos / 1137 tests en verde.

## Findings

### CRITICAL

Ninguno.

### WARNING

1. **Lint ausente.** `package.json` no define el script `lint` aunque
   `openspec/config.yaml` lo declara. Es un hueco preexistente de la rama, ajeno
   al cambio; no se inventó runner alternativo. No bloquea el cierre.
2. **Verificación manual pendiente con base viva (8.3).** Subir imagen y PDF,
   ver miniatura, descargar PDF y eliminar un archivo requiere la base real; no
   es verificable en CI. Abierta a propósito.
3. **Verificación manual pendiente con base viva (10.2).** Crear/editar una
   consulta con archivos y confirmar la asociación al `clinical_visit_id`
   requiere la base real; no es verificable en CI. Abierta a propósito.

### SUGGESTION

1. **Riesgo de renumeración de la migración `0020` al merge.** Otra rama pudo
   tomar `0020`; al integrar hay que renumerar y verificar el orden contra
   `supabase/migrations/`. Registrado en `proposal.md` y `design.md`.
2. Agregar el script `lint` a `package.json` para cerrar el hueco ambiental de
   verificación.

## Limitaciones

- No se re-ejecutaron las pruebas contra Supabase real; usan mocks según el
  patrón vigente del repo.
- No se aplicó la migración `0020` en una base real; la revisión fue estructural
  más tests de contrato.
- La evidencia RED es histórica, por artefacto, no reproducida en esta fase.
- No se creó commit, push ni PR.

## Recomendación

Proceder con el archive del cambio registrando las advertencias y limitaciones
anteriores. No se requiere volver a apply salvo que el maintainer decida cerrar
antes las verificaciones manuales 8.3 / 10.2 o agregar el script `lint`.
