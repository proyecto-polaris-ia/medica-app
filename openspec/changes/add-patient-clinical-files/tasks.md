# Tasks

Carga de archivos clínicos del paciente con Supabase Storage (issue
[#91](https://github.com/proyecto-polaris-ia/medica-app/issues/91)). El orden
respeta las dependencias y la estrategia de **PRs apilados**: **Fase 1 (migración
+ bucket + lib + tests) es la base sobre `main`; Fase 2 (pestaña "Archivos") se
apila sobre Fase 1; Fase 3 (integración con la consulta clínica) se apila sobre
Fase 2.** Cada fase es un rebanado de trabajo revisable por separado (una fase =
un PR). Las tareas de código siguen TDD (**RED → GREEN → TRIANGULATE →
REFACTOR**); la migración y el bucket se verifican de forma estructural porque no
hay runner de migraciones en `npm test`.

Convenciones: identificadores de código en inglés y textos de UI en español de
México; runner `npm run test` → `vitest run`; typecheck `npm run typecheck` →
`tsc --noEmit`; build `npm run build` → `next build`.

Riesgo de merge registrado en `design.md` §1: la migración es `0020` porque
`0019` ya está tomado (`supabase/migrations/0019_appointment_transition_columns.sql`).
**Si otra rama tomó `0020`, renumerar al hacer merge** y verificar el orden.

---

## Fase 1 — Modelo de datos + almacenamiento seguro (PR base sobre `main`)

### 1. Migración `0020` (verificación estructural, sin runner de migraciones)

- [x] 1.1 Crear `supabase/migrations/0020_patient_files.sql` con la tabla
  `patient_files` (`id`, `patient_id` FK a `patients`, `clinical_visit_id`
  nullable FK a `clinical_visits`, `category` con CHECK, `storage_path` UNIQUE,
  `file_name`, `mime_type`, `size_bytes` CHECK `> 0`, `uploaded_by`, `created_at`)
  siguiendo el estilo idempotente de `supabase/migrations/0013_clinical_record.sql`.
  - Verificación: lectura estructural; confirmar `CREATE TABLE IF NOT EXISTS`,
    la FK a `clinical_visits` y el `CHECK (size_bytes > 0)`.
- [x] 1.2 Agregar a `0020` los índices
  `idx_patient_files_patient_created (patient_id, created_at DESC)` y
  `idx_patient_files_visit (clinical_visit_id)` con `CREATE INDEX IF NOT EXISTS`.
  - Verificación: `grep -c "CREATE INDEX IF NOT EXISTS" supabase/migrations/0020_patient_files.sql`
    → `2`.
- [x] 1.3 Agregar a `0020` el bloque RLS estilo `0017` / `0018`:
  `ENABLE` + `FORCE ROW LEVEL SECURITY`, `REVOKE ALL ... FROM anon`,
  `REVOKE ALL ... FROM authenticated`, `GRANT ... TO authenticated` y la policy
  `patient_files_admin_all` con `USING ((SELECT auth.uid()) IS NOT NULL)`.
  - Verificación: lectura estructural; la policy solo otorga a `authenticated` y
    no existe ninguna policy para `anon`.
- [x] 1.4 Agregar a `0020` la creación del bucket privado
  `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('patient-files', 'patient-files', false, 10485760,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
  ON CONFLICT (id) DO UPDATE SET ...` y las policies de `storage.objects`
  (`patient_files_objects_select` / `_insert` / `_delete`) para `authenticated`
  únicamente, con `DROP POLICY IF EXISTS` previo.
  - Verificación: `grep -c "bucket_id = 'patient-files'" supabase/migrations/0020_patient_files.sql`
    → `3`; y confirmar por lectura que `public` es `false` y que **no** hay
    policies para `anon`.
- [x] 1.5 Crear `supabase/migrations/down/0020_patient_files.down.sql` con
  `DROP POLICY IF EXISTS` de las policies de storage y de la tabla, `DROP TABLE
  IF EXISTS patient_files` y `DELETE FROM storage.buckets WHERE id =
  'patient-files'` (higiene, patrón `supabase/migrations/down/`).
  - Verificación: lectura estructural; el `down` revierte exactamente lo de
    1.1–1.4 y nada más.
- [x] 1.6 Confirmar que el bucket es privado y que no hay acceso anónimo: buscar
  en `0020_*.sql` las cadenas `TO anon`, `public = true` y `GRANT ... TO anon`.
  - Verificación: las tres búsquedas devuelven **cero** coincidencias.

### 2. Tipos (`src/lib/admin/types.ts`)

- [x] 2.1 Agregar `PatientFileCategory` (`radiograph` | `clinical_photo` |
  `document` | `consent` | `other`), `PatientFile` (camelCase: `patientId`,
  `clinicalVisitId`, `category`, `storagePath`, `fileName`, `mimeType`,
  `sizeBytes`, `uploadedBy`, `createdAt`, `signedUrl?`) y `PatientFileInput`,
  junto a `ClinicalVisit`, sin romper los tipos existentes.
  - Verificación: `npm run typecheck` → sin errores.

### 3. Librería `src/lib/admin/patient-files.ts` (TDD)

Archivo de implementación: `src/lib/admin/patient-files.ts` (nuevo).
Archivo de prueba: `src/lib/admin/__tests__/patient-files.test.ts` (nuevo).

- [x] 3.1 **RED** — Escribir `src/lib/admin/__tests__/patient-files.test.ts`
  (patrón de `src/lib/admin/__tests__/clinical-visits.test.ts`) con:
  `validatePatientFileUpload` acepta `image/jpeg`, `image/png`, `image/webp` y
  `application/pdf`, y rechaza tipo no permitido y tamaño > 10 MB **con mensaje
  en español**; `mapRow` correcto.
  - Verificación: `npx vitest run src/lib/admin/__tests__/patient-files.test.ts`
    → falla (módulo/exports inexistentes).
- [x] 3.2 **GREEN** — Crear `src/lib/admin/patient-files.ts` con las constantes
  `PATIENT_FILES_BUCKET = 'patient-files'`, `MAX_FILE_SIZE_BYTES = 10 * 1024 *
  1024`, `ALLOWED_MIME_TYPES`, `PATIENT_FILE_CATEGORIES`,
  `SIGNED_URL_EXPIRES_SECONDS`; `validatePatientFileUpload` (mensajes en
  español), `mapRow` y `SELECT_COLUMNS`, usando `getSupabaseAdmin()` y los
  validadores de `./validate`.
  - Verificación: `npx vitest run src/lib/admin/__tests__/patient-files.test.ts`
    → pasa.
- [x] 3.3 **GREEN** — Implementar `uploadPatientFile(patientId, input)`:
  valida uuid y categoría (`parseStatus`), verifica que la consulta (si viene)
  pertenece al paciente con una lectura `clinical_visits.select('id')...`, sube
  el objeto a `patient-files` en la ruta `{patientId}/{crypto.randomUUID()}.{ext}`,
  inserta los metadatos y compensa con `storage.remove()` si el insert falla.
  - Verificación: `npx vitest run src/lib/admin/__tests__/patient-files.test.ts`
    → pasa con los casos de subida y compensación.
- [x] 3.4 **GREEN** — Implementar `listPatientFiles(patientId, { clinicalVisitId? })`
  (filtro por `patient_id` y `clinical_visit_id`, orden `created_at DESC`),
  `listPatientFilesWithUrls` (firmas en lote con `createSignedUrls`),
  `getPatientFileDownloadUrl(patientId, fileId)` (firma con `download` y
  `NotFoundError` si no existe) y `deletePatientFile(patientId, fileId)`
  (`storage.remove()` + `delete` de la fila).
  - Verificación: `npx vitest run src/lib/admin/__tests__/patient-files.test.ts`
    → pasa.
- [x] 3.5 **TRIANGULATE** — Cubrir casos negativos que protegen el contrato:
  tipo no permitido no sube nada; tamaño excedido no sube nada; consulta de otro
  paciente → `NotFoundError`; descarga de archivo inexistente → `NotFoundError`;
  sin N+1 en el listado (una sola firma en lote).
  - Verificación: `npx vitest run src/lib/admin/__tests__/patient-files.test.ts`
    → sigue en verde.
- [x] 3.6 **REFACTOR** — Limpiar nombres y la construcción de la ruta del objeto
  y del payload de metadatos manteniendo la prueba en verde.
  - Verificación: `npx vitest run src/lib/admin/__tests__/patient-files.test.ts`
    → sigue en verde.

### 4. API de archivos (rutas co-locadas, TDD)

Archivos de implementación:
`app/api/admin/patients/[id]/files/route.ts` (nuevo) y
`app/api/admin/patients/[id]/files/[fileId]/route.ts` (nuevo).
Archivos de prueba co-locados: `.../files/route.test.ts` y
`.../files/[fileId]/route.test.ts` (nuevos).

- [x] 4.1 **RED** — Escribir `app/api/admin/patients/[id]/files/route.test.ts`:
  `GET` y `POST` sin sesión → 401 (`requireUser` mockeado); `POST` con tipo no
  permitido → 400 `{ error: 'invalid_file', message }` con mensaje en español;
  `POST` con tamaño excedido → 400 con mensaje en español; `POST` válido → 201;
  `GET` devuelve `files` con `signedUrl`.
  - Verificación:
    `npx vitest run "app/api/admin/patients/[id]/files/route.test.ts"` → falla.
- [x] 4.2 **GREEN** — Implementar `app/api/admin/patients/[id]/files/route.ts`
  con `export const dynamic = 'force-dynamic'`, `handleAdminRequest` +
  `requireUser()`, `GET` (`listPatientFilesWithUrls`, query opcional
  `?clinicalVisitId=`) y `POST` (`request.formData()`, valida `file instanceof
  File` y `validatePatientFileUpload`, devuelve el `400` en español dentro del
  handler y luego llama a `uploadPatientFile` con `uploadedBy: user.id`).
  - Verificación:
    `npx vitest run "app/api/admin/patients/[id]/files/route.test.ts"` → pasa.
- [x] 4.3 **RED** — Escribir
  `app/api/admin/patients/[id]/files/[fileId]/route.test.ts`: `GET` sin sesión →
  401; `GET` válido → `{ url, fileName }`; `DELETE` → `{ ok: true }`; `GET` de
  archivo inexistente → 404.
  - Verificación:
    `npx vitest run "app/api/admin/patients/[id]/files/[fileId]/route.test.ts"`
    → falla.
- [x] 4.4 **GREEN** — Implementar
  `app/api/admin/patients/[id]/files/[fileId]/route.ts` con
  `handleAdminRequest` + `requireUser()`: `GET` → `getPatientFileDownloadUrl`;
  `DELETE` → `deletePatientFile` y `{ ok: true }`.
  - Verificación:
    `npx vitest run "app/api/admin/patients/[id]/files/[fileId]/route.test.ts"`
    → pasa.
- [x] 4.5 **TRIANGULATE/REFACTOR** — Verificar que el mapeo de errores de
  `_lib/responses.ts` se respeta (`UnauthorizedError` → 401, `NotFoundError` →
  404, fallo interno → 500) y que el `POST` no llama a la lib cuando la
  validación falla; limpiar sin cambiar el contrato.
  - Verificación:
    `npx vitest run "app/api/admin/patients/[id]/files/route.test.ts" "app/api/admin/patients/[id]/files/[fileId]/route.test.ts"`
    → sigue en verde.

### 5. Verificación de Fase 1

- [x] 5.1 Ejecutar las pruebas focales:
  `npx vitest run src/lib/admin/__tests__/patient-files.test.ts "app/api/admin/patients/[id]/files/route.test.ts" "app/api/admin/patients/[id]/files/[fileId]/route.test.ts"`
  → todo en verde.
- [x] 5.2 Ejecutar el typecheck: `npm run typecheck` → sin errores.
- [x] 5.3 Verificación estructural de 1.1–1.6 (tabla, índices, RLS sin `anon`,
  bucket privado, `down` completo) y confirmación de que la API exige sesión y
  no expone credenciales de servicio al cliente.

---

## Fase 2 — Pestaña "Archivos" en el expediente (PR apilado sobre Fase 1)

### 6. Componente `PatientFilesTab` (TDD)

Archivos: `src/components/admin/patient-record/PatientFilesTab.tsx` (nuevo) y
`src/components/admin/patient-record/PatientFilesTab.test.tsx` (nuevo).

- [x] 6.1 **RED** — Escribir `PatientFilesTab.test.tsx` (patrón
  `PatientPaymentsTab.test.tsx`): estado vacío con `EmptyState`; lista con
  miniatura de imagen y botón de descarga para PDF; subida que llama a la API con
  `FormData` y dispara `onFilesChanged`; error de validación que muestra el
  mensaje en español de la API.
  - Verificación:
    `npx vitest run src/components/admin/patient-record/PatientFilesTab.test.tsx`
    → falla.
- [x] 6.2 **GREEN** — Implementar `PatientFilesTab` (`'use client'`): props
  `patientId`, `clinicalVisits`, `files`, `loading`, `error`, `onFilesChanged`;
  carga por arrastrar y soltar + `<input type="file" multiple accept=...>`;
  selectores de categoría y de consulta opcional (`clinicalVisitId`, con "Sin
  consulta"); miniaturas con `signedUrl`; descarga PDF vía
  `GET /api/admin/patients/${patientId}/files/${file.id}`; eliminar con
  confirmación; estados `LoadingState` / `ErrorState` / `EmptyState`.
  - Verificación:
    `npx vitest run src/components/admin/patient-record/PatientFilesTab.test.tsx`
    → pasa.
- [x] 6.3 **TRIANGULATE/REFACTOR** — Cubrir archivo rechazado (muestra el
  mensaje en español y no actualiza la lista) y lista vacía tras eliminar el
  último archivo; limpiar sin cambiar el contrato.
  - Verificación:
    `npx vitest run src/components/admin/patient-record/PatientFilesTab.test.tsx`
    → sigue en verde.

### 7. Cableado al expediente

Archivos: `src/components/admin/patient-record/PatientRecordTabs.tsx` y
`app/(admin)/patients/[id]/page.tsx` (modificar).

- [x] 7.1 Extender `PatientRecordTabs.tsx`: agregar `'files'` a
  `type TabId`, `{ id: 'files', label: 'Archivos' }` a `TABS`, las props
  `files` / `filesLoading` / `filesError` / `onFilesChanged`, y renderizar
  `PatientFilesTab` en el `tabpanel` pasando `clinicalVisits`.
  - Verificación: `npm run typecheck` → sin errores; lectura de que la pestaña
    existente no cambia de contrato.
- [x] 7.2 Extender `app/(admin)/patients/[id]/page.tsx`: estado `files` /
  `filesLoading` / `filesError`, `loadFiles()` contra
  `GET /api/admin/patients/${patientId}/files` (error no bloquea el expediente,
  patrón `loadMedicalHistory`), llamada en el `useEffect` y paso de props a
  `PatientRecordTabs` con `onFilesChanged={loadFiles}`.
  - Verificación: `npm run typecheck` → sin errores.
- [x] 7.3 **RED/GREEN** — Extender `app/(admin)/patients/[id]/page.test.tsx`:
  la pestaña "Archivos" aparece y carga los archivos del paciente.
  - Verificación: `npx vitest run "app/(admin)/patients/[id]/page.test.tsx"` →
    pasa.

### 8. Verificación de Fase 2

- [x] 8.1 Ejecutar las pruebas focales:
  `npx vitest run src/components/admin/patient-record/PatientFilesTab.test.tsx "app/(admin)/patients/[id]/page.test.tsx"`
  → todo en verde.
- [x] 8.2 Ejecutar el typecheck: `npm run typecheck` → sin errores.
- [ ] 8.3 Verificación manual (no hay DB en CI): con datos reales, subir una
  imagen y un PDF desde la pestaña "Archivos", ver la miniatura, descargar el PDF
  y eliminar un archivo; registrar la evidencia en el PR.
  - **Abierta a propósito (sin marcar)**: pendiente de verificación manual con la
    base viva; no es verificable en CI. Se deja intencionalmente abierta.

---

## Fase 3 — Integración con la consulta clínica (PR apilado sobre Fase 2)

### 9. Subida posterior a crear/actualizar la consulta (TDD)

Archivos: `src/components/admin/patient-record/ClinicalVisitForm.tsx` y
`src/components/admin/patient-record/PatientFilesTab.tsx` (modificar).

- [x] 9.1 **RED** — Extender `PatientFilesTab.test.tsx` (o su test de
  integración) para el modo consulta: con `clinicalVisitId` fijo no muestra el
  selector de consulta y envía ese id en el `FormData`.
  - Verificación:
    `npx vitest run src/components/admin/patient-record/PatientFilesTab.test.tsx`
    → falla.
- [x] 9.2 **GREEN** — Extender `PatientFilesTab` para aceptar un
  `clinicalVisitId` fijo opcional (modo consulta) y usarlo al subir.
  - Verificación:
    `npx vitest run src/components/admin/patient-record/PatientFilesTab.test.tsx`
    → pasa.
- [x] 9.3 **GREEN** — En `ClinicalVisitForm.tsx`, tras
  `onSaved(data.clinicalVisit)` (visita creada/actualizada), ofrecer la carga de
  archivos con el `clinical_visit_id` recién obtenido. **La subida NO viaja
  dentro del JSON de la consulta**: el formulario sigue enviando su JSON actual y
  la carga ocurre después, en `multipart/form-data`.
  - Verificación: `npm run typecheck` → sin errores; lectura de que el cuerpo
    JSON de la consulta no incluye binarios.
- [x] 9.4 **TRIANGULATE/REFACTOR** — Verificar que cancelar la consulta no sube
  archivos, que editar una consulta reusa su id y que un archivo asociado a una
  visita de otro paciente se rechaza; limpiar sin cambiar el contrato.
  - Verificación:
    `npx vitest run src/lib/admin/__tests__/patient-files.test.ts src/components/admin/patient-record/PatientFilesTab.test.tsx`
    → sigue en verde.

### 10. Verificación de Fase 3

- [x] 10.1 Ejecutar las pruebas focales de la fase:
  `npx vitest run src/lib/admin/__tests__/patient-files.test.ts "app/api/admin/patients/[id]/files/route.test.ts" "app/api/admin/patients/[id]/files/[fileId]/route.test.ts" src/components/admin/patient-record/PatientFilesTab.test.tsx "app/(admin)/patients/[id]/page.test.tsx"`
  → todo en verde.
- [ ] 10.2 Verificación manual con datos reales: crear una consulta con archivos
  y editarla con archivos nuevos; confirmar que los archivos quedan asociados a
  la visita; registrar la evidencia en el PR.
  - **Abierta a propósito**: pendiente de verificación manual con la base viva,
    no verificable en CI.

---

## Verify — cierre del cambio

- [ ] V.1 Ejecutar el typecheck: `npm run typecheck` → sin errores.
- [ ] V.2 Ejecutar el lint: `npm run lint` → sin errores. **Nota:** si el script
  `lint` no existe en `package.json` (esta rama no lo define), registrar la
  brecha ambiental en el reporte de verificación y no inventar un runner.
- [ ] V.3 Ejecutar la suite completa: `npm run test` → todo en verde (o registrar
  cualquier fallo preexistente ajeno al cambio).
- [ ] V.4 Ejecutar el build: `npm run build` → compila sin errores.
- [ ] V.5 Verificación estructural final de la migración `0020`, el bucket
  privado y las policies sin `anon`, y revisión de que ningún texto de error
  dirigido al usuario quedó en inglés.

---

## Forecast

- **Tareas:** **41 checkboxes** distribuidas en 3 fases + cierre (Fase 1: 21;
  Fase 2: 9; Fase 3: 6; Verify: 5). Cada tarea de código trae su comando de
  verificación exacto.
- **Archivos únicos estimados: 15** (10 nuevos, 5 modificados), contando cada
  archivo una sola vez aunque una fase lo extienda:
  - **Fase 1 (9):** 9 nuevos —
    `supabase/migrations/0020_patient_files.sql`,
    `supabase/migrations/down/0020_patient_files.down.sql`,
    `src/lib/admin/patient-files.ts`,
    `src/lib/admin/__tests__/patient-files.test.ts`,
    `app/api/admin/patients/[id]/files/route.ts`,
    `app/api/admin/patients/[id]/files/route.test.ts`,
    `app/api/admin/patients/[id]/files/[fileId]/route.ts`,
    `app/api/admin/patients/[id]/files/[fileId]/route.test.ts`; 1 modificado —
    `src/lib/admin/types.ts`.
  - **Fase 2 (5):** 2 nuevos —
    `src/components/admin/patient-record/PatientFilesTab.tsx` (+ su test); 3
    modificados — `src/components/admin/patient-record/PatientRecordTabs.tsx`,
    `app/(admin)/patients/[id]/page.tsx`,
    `app/(admin)/patients/[id]/page.test.tsx`.
  - **Fase 3 (1):** 1 modificado — `ClinicalVisitForm.tsx`
    (`PatientFilesTab.tsx` y `patient-files.ts` ya cuentan).
- **Tamaño de diff aproximado por rebanado (PR):**
  - **Fase 1 (base sobre `main`): ~700–1,000 líneas.** Migración + `down`
    ~120–180, lib ~200–280, tests de lib ~180–280, rutas + tests ~250–350.
    **Riesgo de tamaño de review: medio-alto** (supera el umbral de ~400 líneas
    de `chained-pr`); es el precio de dejar el modelo, el bucket y la API
    probados antes de tocar la UI.
  - **Fase 2 (apilada sobre Fase 1): ~350–550 líneas.** Pestaña + test
    ~250–380, cableado de tabs y página ~100–170. **Riesgo: medio.**
  - **Fase 3 (apilada sobre Fase 2): ~150–250 líneas.** Modo consulta de la
    pestaña + botón en el formulario de visita + ampliaciones de test.
    **Riesgo: bajo-medio.**
- **Riesgo de runner:** no hay runner de migraciones en `npm test`; la migración
  `0020` y el bucket se verifican de forma estructural (tareas 1.1–1.6 y V.5).
  `npm run lint` está declarado en `openspec/config.yaml` pero **no aparece** en
  los scripts de `package.json` de esta rama; si sigue ausente, se registra como
  brecha ambiental en V.2.
- **Riesgo de merge:** colisión del número `0020` con otra rama; renumerar al
  hacer merge y verificar contra `supabase/migrations/`.
- **Dependencia entre PRs:** Fase 2 requiere Fase 1 (API y tipos); Fase 3
  requiere Fase 2 (`PatientFilesTab` montado en el expediente).

## Decision needed before apply

**Decision needed before apply: No.**

Las decisiones quedaron resueltas en `design.md`: bucket privado `patient-files`
con URLs firmadas; tipos `jpg`/`png`/`webp`/`pdf` y tope de 10 MB; ruta de objeto
`{patientId}/{uuid}.{ext}`; categorías fijas; API autenticada por `requireUser()`
con service role en el servidor y RLS como defensa en profundidad; integración
con la consulta clínica subiendo **después** de crear/actualizar la visita; y la
nota de renumerar `0020` al merge. El visor DICOM, el OCR y la migración masiva
del archivo físico están explícitamente fuera de alcance.
