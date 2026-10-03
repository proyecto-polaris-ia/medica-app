# Diseño: Carga de archivos clínicos del paciente con Supabase Storage

## Contexto y objetivos

Este diseño implementa la capacidad nueva `patient-clinical-files` descrita en
`proposal.md` y especificada en
`specs/patient-clinical-files/spec.md` (9 requisitos / 28 escenarios), y resuelve
el issue [#91](https://github.com/proyecto-polaris-ia/medica-app/issues/91). El
problema operativo es concreto: Jorge abre el expediente en su laptop durante la
consulta y hoy los estudios llegan dispersos por WhatsApp y correo, así que no
los tiene donde los necesita. Este cambio pone los archivos clínicos dentro del
expediente, en un bucket privado, accesibles solo para staff autenticado.

Objetivos técnicos:

- **Metadatos en Postgres, bytes en Storage.** Tabla `patient_files` para
  metadatos y bucket privado `patient-files` para binarios. Nunca URL pública.
- **Autenticación en la ruta, RLS como defensa en profundidad.** La API usa
  `requireUser()`; la lib usa `getSupabaseAdmin()` (convención del repo). El
  cliente nunca recibe la llave de servicio.
- **Validación de tipo y tamaño en el servidor**, con mensaje claro en español.
- **Reutilizar patrones existentes**: archivo plano de servicio estilo
  `src/lib/admin/medical-history.ts`, `mapRow` + validadores de
  `src/lib/admin/validate.ts`, respuestas con `app/api/admin/_lib/responses.ts`,
  componentes de estado del panel admin.
- **Entrega en 3 fases con PRs apilados.** Fase 1 (migración + bucket + lib +
  tests) es la base; Fase 2 (pestaña "Archivos") consume la API; Fase 3
  (integración con la consulta) sube archivos después de crear/editar la visita.

Base reutilizada (leída para este diseño):

- `supabase/migrations/0013_clinical_record.sql` — convención de migración
  idempotente (`IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`), tabla
  `clinical_visits`, `REVOKE ... FROM anon`, y estilo de índices
  `(patient_id, created_at DESC)`.
- `supabase/migrations/0017_payment_intents_reminders.sql` y
  `supabase/migrations/0018_appointment_reminders.sql` — estilo RLS de referencia:
  `ENABLE` + `FORCE ROW LEVEL SECURITY`, `REVOKE ALL ... FROM anon/authenticated`,
  `GRANT ... TO authenticated` y policy `*_admin_all` con
  `USING ((SELECT auth.uid()) IS NOT NULL)`.
- `supabase/migrations/0019_appointment_transition_columns.sql` — confirma que
  `0019` **ya está tomado** en esta rama; por eso la migración de este cambio es
  `0020`.
- `src/lib/admin/medical-history.ts` — patrón de archivo plano de servicio:
  `SELECT_COLUMNS`, `mapRow`, `validate*Input` y `getSupabaseAdmin()`.
- `src/lib/admin/clinical-visits.ts` — patrón de `list*` / `create*` /
  `update*` / `delete*` y `parseUuid` / `NotFoundError`.
- `src/lib/admin/validate.ts` — `parseUuid`, `parseNonEmptyString`,
  `parseStatus`, `ValidationError`.
- `src/lib/admin/errors.ts` — `NotFoundError`.
- `src/lib/supabase/server.ts` — `getSupabaseAdmin()` (service role).
- `src/lib/supabase/auth.ts` — `requireUser()` / `UnauthorizedError`.
- `app/api/admin/_lib/responses.ts` — `handleAdminRequest` (mapea
  `UnauthorizedError` → 401, `ValidationError` → 400, `NotFoundError` → 404,
  `ConflictError` → 409, resto → 500) y `parseJsonBody`.
- `app/api/admin/_lib/auth.ts` — reexporta `requireUser`.
- `app/api/admin/patients/[id]/clinical-visits/route.ts` — patrón de ruta
  (`export const dynamic = 'force-dynamic'`, `context.params` como `Promise`).
- `src/components/admin/patient-record/PatientRecordTabs.tsx` — `TabId`, `TABS`
  y render por pestaña.
- `src/components/admin/patient-record/PatientVisitsTab.tsx` y
  `PatientPaymentsTab.tsx` — patrones de pestaña (fetch a la API, estados
  `LoadingState` / `ErrorState` / `EmptyState`, `on*Changed`).
- `src/components/admin/patient-record/ClinicalVisitForm.tsx` — formulario
  JSON de la consulta (`FormModal`, `onSaved(visit)`).
- `app/(admin)/patients/[id]/page.tsx` — estado del expediente y cableado de
  `PatientRecordTabs`.
- `src/lib/admin/__tests__/clinical-visits.test.ts` y
  `src/components/admin/patient-record/PatientPaymentsTab.test.tsx` — patrones
  de test de lib y de componente.

---

## 1. Decisiones de arquitectura

| # | Decisión | Valor | Razón / alternativa descartada |
|---|---|---|---|
| 1 | Almacenamiento | Bucket privado `patient-files` (`public = false`) + URL firmada | Datos clínicos confidenciales; se descarta bucket público y URL permanente. |
| 2 | Número de migración | `0020_patient_files.sql` | `0019` ya existe en `supabase/migrations/0019_appointment_transition_columns.sql`. **Riesgo de colisión:** otra rama activa pudo tomar `0020`; **renumerar al hacer merge** verificando `ls supabase/migrations/` y el orden respecto a los ya aplicados. |
| 3 | Tabla | `patient_files` con `clinical_visit_id` nullable | Un archivo puede pertenecer al paciente sin visita o a una visita concreta. |
| 4 | Ruta del objeto | `{patient_id}/{file_id}.{ext}` con `file_id` = `crypto.randomUUID()` | Única, no colisiona entre pacientes y no depende del nombre original; se guarda como `storage_path`. |
| 5 | Tipos permitidos | `image/jpeg`, `image/png`, `image/webp`, `application/pdf` | Fotos/radiografías exportadas + PDF; se descarta aceptar `*` o formatos médicos especiales (fuera de alcance DICOM). |
| 6 | Tope de tamaño | `MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024` (10 MB) | Suficiente para foto de celular o PDF; se aplica en la lib **y** en el bucket. |
| 7 | Autenticación | `requireUser()` en cada ruta; lib con service role | Convención vigente del repo: auth en la capa de ruta, RLS como segunda barrera. La llave de servicio sólo existe en el servidor. |
| 8 | Motivo del service role | Escritura de Storage + metadatos sin depender de la sesión de Storage del navegador | Evita exponer credenciales al cliente y centraliza la validación en el servidor; RLS/policies siguen denegando `anon`. |
| 9 | Listado | `createSignedUrls(paths, expiresIn)` en lote | Evita N+1 firmando un objeto por vez. |
| 10 | Descarga | `createSignedUrl(path, expiresIn, { download })` | Fuerza `Content-Disposition: attachment` en la descarga. |
| 11 | Delete | Borrar objeto y luego fila | Si falla el borrado de la fila, el objeto ya no existe y queda una fila inconsistente; se documenta la compensación. Alternativa considerada: borrar fila y luego objeto (deja bytes huérfanos si falla lo segundo). |
| 12 | Asociación de visita | Validar que la visita pertenece al paciente | Evita asociar archivos a consultas ajenas. |
| 13 | Integración con la visita | Subir **después** de crear/actualizar la consulta | El formulario de consulta es JSON; el archivo es `multipart/form-data` y necesita el `clinical_visit_id`. Se descarta meter el binario en el JSON. |
| 14 | Feature flag | No aplica | Capacidad aditiva para staff autenticado; no cambia flujos públicos. |
| 15 | Números de migración del `down` | `down/0020_patient_files.down.sql` | Patrón vigente de `supabase/migrations/down/`. |

---

## 2. Migración `supabase/migrations/0020_patient_files.sql`

Aditiva e idempotente, en el estilo de `0013` (tabla/índices con
`IF NOT EXISTS`, `DROP ... IF EXISTS` antes de recrear) y con RLS estilo
`0017` / `0018`.

```sql
-- Archivos clínicos del paciente (issue #91).
-- Idempotente: tabla, índices, policies y bucket con guardas.

-- 1) Metadatos.
CREATE TABLE IF NOT EXISTS patient_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinical_visit_id uuid REFERENCES clinical_visits(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'document'
    CHECK (category IN ('radiograph', 'clinical_photo', 'document', 'consent', 'other')),
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_files_patient_created
  ON patient_files (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_files_visit
  ON patient_files (clinical_visit_id);

-- 2) RLS de metadatos (estilo 0017/0018).
ALTER TABLE patient_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_files FORCE ROW LEVEL SECURITY;

REVOKE ALL ON patient_files FROM anon;
REVOKE ALL ON patient_files FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON patient_files TO authenticated;

DROP POLICY IF EXISTS "patient_files_admin_all" ON patient_files;
CREATE POLICY "patient_files_admin_all" ON patient_files
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
```

Notas:

- `uploaded_by uuid` sin FK, igual que `clinical_visits.created_by` en `0013`
  (no se referencia `auth.users` para mantener el patrón existente).
- `file_name` guarda el nombre original sólo para mostrarlo; la ruta real es
  `storage_path`.
- `category` usa identificadores en inglés y etiquetas en español en la UI.

### 2.1 Bucket privado y policies de `storage.objects`

```sql
-- 3) Bucket privado (segunda barrera de tipo/tamaño).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'patient-files',
  'patient-files',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 4) Policies de storage: solo authenticated, nunca anon.
DROP POLICY IF EXISTS "patient_files_objects_select" ON storage.objects;
CREATE POLICY "patient_files_objects_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'patient-files');

DROP POLICY IF EXISTS "patient_files_objects_insert" ON storage.objects;
CREATE POLICY "patient_files_objects_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'patient-files');

DROP POLICY IF EXISTS "patient_files_objects_delete" ON storage.objects;
CREATE POLICY "patient_files_objects_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'patient-files');
```

No se crea ninguna policy para `anon` (queda denegado por defecto en
`storage.objects`, que ya tiene RLS habilitado por Supabase).

### 2.2 Down migration

`supabase/migrations/down/0020_patient_files.down.sql` (higiene, patrón
`down/`), revirtiendo exactamente lo creado:

```sql
DROP POLICY IF EXISTS "patient_files_objects_select" ON storage.objects;
DROP POLICY IF EXISTS "patient_files_objects_insert" ON storage.objects;
DROP POLICY IF EXISTS "patient_files_objects_delete" ON storage.objects;
DROP POLICY IF EXISTS "patient_files_admin_all" ON patient_files;
DROP TABLE IF EXISTS patient_files;
DELETE FROM storage.buckets WHERE id = 'patient-files';
```

Advertencia documentada: el `down` **no** borra los objetos ya almacenados por sí
solo; si se decide eliminar la capacidad, respaldar el bucket antes de aplicar el
`down`.

---

## 3. Librería de servicio `src/lib/admin/patient-files.ts`

Archivo plano, patrón `src/lib/admin/medical-history.ts`: `SELECT_COLUMNS`,
`mapRow`, `validate*` y `getSupabaseAdmin()`. Sin clases ni directorio nuevo.

```ts
import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { PatientFile, PatientFileCategory, PatientFileInput } from './types';
import { NotFoundError } from './errors';
import { parseNonEmptyString, parseStatus, parseUuid } from './validate';

export const PATIENT_FILES_BUCKET = 'patient-files';
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export const PATIENT_FILE_CATEGORIES: readonly PatientFileCategory[] = [
  'radiograph', 'clinical_photo', 'document', 'consent', 'other',
];
export const SIGNED_URL_EXPIRES_SECONDS = 60 * 5; // 5 min

const SELECT_COLUMNS = [
  'id', 'patient_id', 'clinical_visit_id', 'category', 'storage_path',
  'file_name', 'mime_type', 'size_bytes', 'uploaded_by', 'created_at',
].join(', ');
```

### 3.1 Validación con mensaje en español

```ts
export type FileValidationResult =
  | { ok: true }
  | { ok: false; message: string };

/** Valida tipo MIME y tamaño. El mensaje es el que ve el usuario. */
export function validatePatientFileUpload(file: {
  type: string;
  size: number;
}): FileValidationResult {
  if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    return {
      ok: false,
      message: 'Solo se permiten archivos JPG, PNG, WEBP o PDF.',
    };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      message: 'El archivo no debe superar 10 MB.',
    };
  }
  return { ok: true };
}
```

Los mensajes viven en la lib para que la ruta los devuelva tal cual y el
componente no duplique textos.

### 3.2 Superficie pública

```ts
export async function listPatientFiles(
  patientId: string,
  options?: { clinicalVisitId?: string | null }
): Promise<PatientFile[]>;

export async function uploadPatientFile(
  patientId: string,
  input: { file: { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };
           category?: string | null;
           clinicalVisitId?: string | null;
           uploadedBy?: string | null }
): Promise<PatientFile>;

export async function getPatientFileDownloadUrl(
  patientId: string,
  fileId: string
): Promise<{ url: string; fileName: string }>;

export async function deletePatientFile(
  patientId: string,
  fileId: string
): Promise<void>;
```

Reglas internas:

- **`listPatientFiles`**: `.eq('patient_id', parsedId)` y, si viene
  `clinicalVisitId`, `.eq('clinical_visit_id', parsedVisitId)`; orden
  `.order('created_at', { ascending: false })`; `mapRow` por fila.
- **`uploadPatientFile`**:
  1. `validatePatientFileUpload(input.file)`; si falla, lanza `ValidationError`
     (la ruta ya devolvió el 400 en español antes de llamar, ver §4).
  2. `parseUuid(patientId)`; `parseStatus(category ?? 'document',
     PATIENT_FILE_CATEGORIES)`.
  3. Si `clinicalVisitId` viene, `parseUuid` y verificar pertenencia con una
     lectura `clinical_visits.select('id').eq('id', visitId).eq('patient_id',
     parsedId).maybeSingle()`; si no existe, `NotFoundError`.
  4. `const objectId = crypto.randomUUID()`; `const ext = extensionFor(mime)`;
     `const storagePath = \`${parsedId}/${objectId}.${ext}\``.
  5. `storage.from(PATIENT_FILES_BUCKET).upload(storagePath, bytes, { contentType: mime, upsert: false })`.
  6. `patient_files.insert({ patient_id, clinical_visit_id, category,
     storage_path, file_name, mime_type, size_bytes, uploaded_by }).select(...).single()`.
  7. Si el `insert` falla, intentar `storage.remove([storagePath])` como
     compensación y lanzar el error.
- **`getPatientFileDownloadUrl`**: leer la fila por `id` + `patient_id`; si no
  existe, `NotFoundError`; `createSignedUrl(storage_path,
  SIGNED_URL_EXPIRES_SECONDS, { download: file_name })`.
- **`deletePatientFile`**: leer la fila (para el `storage_path`) por `id` +
  `patient_id`; `storage.remove([storage_path])`; luego
  `patient_files.delete().eq('id', ...).eq('patient_id', ...)`.
- **`mapRow`** sigue la convención camelCase (`patientId`, `clinicalVisitId`,
  `storagePath`, `fileName`, `mimeType`, `sizeBytes`, `uploadedBy`, `createdAt`).
- **`listPatientFilesWithUrls`** (usado por el `GET` de la colección):
  `listPatientFiles` + `storage.from(bucket).createSignedUrls(paths,
  SIGNED_URL_EXPIRES_SECONDS)` **en un solo lote** (sin N+1); devuelve cada
  archivo con `signedUrl`.

### 3.3 Tipos en `src/lib/admin/types.ts`

Se agregan junto a `ClinicalVisit` (sin romper los existentes):

```ts
export type PatientFileCategory =
  | 'radiograph' | 'clinical_photo' | 'document' | 'consent' | 'other';

export type PatientFile = {
  id: string;
  patientId: string;
  clinicalVisitId: string | null;
  category: PatientFileCategory;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string | null;
  createdAt: string;
  signedUrl?: string;
};

export type PatientFileInput = {
  category?: PatientFileCategory | null;
  clinicalVisitId?: string | null;
};
```

---

## 4. API routes

Ambas rutas usan `requireUser()` + `handleAdminRequest` de
`app/api/admin/_lib/responses.ts` y `export const dynamic = 'force-dynamic'`, con
`context.params` como `Promise` (patrón Next 15 de
`app/api/admin/patients/[id]/clinical-visits/route.ts`).

### 4.1 `app/api/admin/patients/[id]/files/route.ts`

- **`GET`** — lista archivos del paciente; query opcional `?clinicalVisitId=`.
  Devuelve `{ files }` con `signedUrl` por archivo (URLs firmadas en lote).
- **`POST`** — subida multipart:

  ```ts
  export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    return handleAdminRequest(async () => {
      const user = await requireUser();
      const { id } = await context.params;

      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) {
        return Response.json(
          { error: 'invalid_file', message: 'Selecciona un archivo.' },
          { status: 400 }
        );
      }
      const validation = validatePatientFileUpload(file);
      if (!validation.ok) {
        return Response.json(
          { error: 'invalid_file', message: validation.message },
          { status: 400 }
        );
      }

      const patientFile = await uploadPatientFile(id, {
        file,
        category: (form.get('category') as string | null) ?? null,
        clinicalVisitId: (form.get('clinicalVisitId') as string | null) ?? null,
        uploadedBy: user.id,
      });
      return Response.json({ file: patientFile }, { status: 201 });
    });
  }
  ```

  El `400` en español se devuelve **antes** de llamar a la lib, dentro del
  handler de `handleAdminRequest`, así que no depende del mapeo genérico de
  `ValidationError`. El resto de errores (sesión, uuid inválido, visita ajena,
  fallo interno) siguen el mapeo estándar de `_lib/responses.ts`
  (`401` / `400` / `404` / `500`).

### 4.2 `app/api/admin/patients/[id]/files/[fileId]/route.ts`

- **`GET`** — devuelve `{ url, fileName }` con la URL firmada de descarga
  (`getPatientFileDownloadUrl`).
- **`DELETE`** — `deletePatientFile(id, fileId)` y responde
  `{ ok: true }`.

**Por qué service role:** la lib usa `getSupabaseAdmin()` porque el repo define
la autenticación en la capa de ruta (`requireUser()`) y reserva la llave de
servicio para el servidor. Así el navegador nunca maneja credenciales de Storage
y toda la validación vive en un solo lugar. Las policies RLS de `patient_files`
y `storage.objects` se mantienen como defensa en profundidad: si alguien usara
la llave anónima, `anon` seguiría denegado.

---

## 5. Componentes cliente

### 5.1 `src/components/admin/patient-record/PatientFilesTab.tsx` (nuevo)

`'use client'`. Patrón de `PatientVisitsTab.tsx` / `PatientPaymentsTab.tsx`.

Props:

```ts
type PatientFilesTabProps = {
  patientId: string;
  clinicalVisits: ClinicalVisit[]; // para el select opcional de consulta
  files: PatientFile[];
  loading: boolean;
  error: string | null;
  onFilesChanged: () => void;
};
```

Comportamiento:

- **Listado** con categoría (etiquetas en español), tipo, tamaño formateado
  (`Intl.NumberFormat('es-MX')`), fecha y autor.
- **Subida por arrastrar y soltar** (`onDragOver` / `onDrop` sobre un
  `div` con `aria-label`) o **selector** `<input type="file" multiple
  accept="image/jpeg,image/png,image/webp,application/pdf">`.
- **Selectores antes de subir**: categoría (`radiograph`, `clinical_photo`,
  `document`, `consent`, `other`) y consulta clínica opcional
  (`clinicalVisitId`, con opción "Sin consulta").
- **Miniatura** para imágenes (`<img src={file.signedUrl} />`) y **descarga**
  para PDF (botón que pide `GET /api/admin/patients/${patientId}/files/${file.id}`
  y navega a la URL firmada).
- **Eliminar** con confirmación; luego `onFilesChanged()`.
- Estados: `LoadingState` mientras `loading`, `ErrorState` con `onRetry`, y
  `EmptyState` ("Sin archivos. Sube el primer estudio del paciente.") cuando la
  lista está vacía.
- Mensaje de error de validación tal cual lo devuelva la API (`message`).

### 5.2 `src/components/admin/patient-record/PatientRecordTabs.tsx` (modificar)

- Extender `type TabId = 'data' | 'history' | 'visits' | 'appointments' |
  'plans' | 'payments' | 'files';`.
- Agregar `{ id: 'files', label: 'Archivos' }` a `TABS`.
- Agregar props `files`, `filesLoading`, `filesError`, `onFilesChanged` y
  pasar `clinicalVisits` a `PatientFilesTab`.
- Render en el `tabpanel`:
  `{activeTab === 'files' && <PatientFilesTab patientId={patient.id}
  clinicalVisits={clinicalVisits} files={files} loading={filesLoading}
  error={filesError} onFilesChanged={onFilesChanged} />}`.

### 5.3 `app/(admin)/patients/[id]/page.tsx` (modificar)

- Nuevo estado `files`, `filesLoading`, `filesError`.
- `loadFiles()`: `GET /api/admin/patients/${patientId}/files` →
  `setFiles(data.files ?? [])`, con manejo de error que no bloquea el expediente
  (patrón `loadMedicalHistory`).
- Llamar `loadFiles()` en el `useEffect` junto a `loadClinicalVisits()`.
- Pasar `files` / `filesLoading` / `filesError` / `onFilesChanged={loadFiles}` a
  `<PatientRecordTabs>`.

### 5.4 `src/components/admin/patient-record/ClinicalVisitForm.tsx` (modificar)

- Mantener el `POST`/`PATCH` JSON actual de la consulta (no se toca su
  contrato).
- Tras `onSaved(data.clinicalVisit)` (visita creada/actualizada), abrir un
  panel/sección de carga que use `PatientFilesTab` con
  `clinicalVisitId` fijo a `data.clinicalVisit.id`, o mostrar un botón
  "Adjuntar archivos a esta consulta" que monte la carga con ese id.
- **Razón de la secuencia**: el archivo es `multipart/form-data` y necesita un
  `clinical_visit_id` que sólo existe después del `POST`/`PATCH`; por eso la
  subida ocurre **después** de guardar la consulta, nunca dentro del JSON.

---

## 6. Flujo de datos

```text
Fase 1
POST /api/admin/patients/:id/files   (multipart/form-data)
  │  requireUser() ──▶ 401 si no hay sesión
  │  formData(): file, category, clinicalVisitId
  │  validatePatientFileUpload(file) ──▶ 400 { error, message en español } si falla
  ▼
uploadPatientFile()
  │  valida uuid/categoría; verifica que la visita sea del paciente
  │  storage.from('patient-files').upload('{patientId}/{uuid}.{ext}', bytes)
  │  patient_files.insert(metadatos)   (compensa remove() si falla)
  └─▶ 201 { file }

GET /api/admin/patients/:id/files?clinicalVisitId=:vid
  │  requireUser()
  │  listPatientFiles() + createSignedUrls(paths) en lote
  └─▶ 200 { files: [{ ...metadatos, signedUrl }] }

GET /api/admin/patients/:id/files/:fileId
  │  requireUser()
  │  getPatientFileDownloadUrl() ──▶ createSignedUrl(download: fileName)
  └─▶ 200 { url, fileName }

DELETE /api/admin/patients/:id/files/:fileId
  │  requireUser()
  │  deletePatientFile(): storage.remove() + patient_files.delete()
  └─▶ 200 { ok: true }

Fase 2/3 (UI)
PatientRecordTabs ──"Archivos"──▶ PatientFilesTab
  │  drag & drop / selector + categoría + visita opcional
  │  imágenes: <img src={signedUrl}>   PDF: descarga firmada
  └─ onFilesChanged() ──▶ page.tsx loadFiles()
ClinicalVisitForm ── guardar consulta (JSON) ──▶ clinical_visit_id
  └─ adjuntar archivos (multipart) DESPUÉS, con ese id
```

---

## 7. Estrategia de pruebas

Runner: `npm run test` → `vitest run` (`package.json`). `environmentMatchGlobs`
usa jsdom para `app/**/*.test.ts*` y `src/components/**`. Política test-first
(RED → GREEN → TRIANGULATE → REFACTOR) por fase.

### 7.1 Lib (`src/lib/admin/__tests__/patient-files.test.ts`, nuevo)

Patrón de `src/lib/admin/__tests__/clinical-visits.test.ts`:

- `validatePatientFileUpload`: acepta los 4 MIME; rechaza tipo no permitido con
  mensaje en español; rechaza tamaño > 10 MB con mensaje en español.
- `uploadPatientFile`: sube al bucket con la ruta `{patientId}/{uuid}.{ext}` y
  `contentType` correcto; inserta metadatos; compensa `remove()` si el `insert`
  falla; rechaza visita que no pertenece al paciente (`NotFoundError`).
- `listPatientFiles`: filtra por `patient_id` y por `clinical_visit_id`; orden
  `created_at DESC`; `mapRow` correcto.
- `getPatientFileDownloadUrl`: `NotFoundError` si no existe; llama
  `createSignedUrl` con `download`.
- `deletePatientFile`: `storage.remove` + `delete` de la fila.

### 7.2 API (rutas co-locadas, nuevos)

- `app/api/admin/patients/[id]/files/route.test.ts`: `GET` sin sesión → 401;
  `POST` sin sesión → 401; `POST` con tipo/tamaño inválido → 400 con `message`;
  `POST` válido → 201; `GET` devuelve `signedUrl`.
- `app/api/admin/patients/[id]/files/[fileId]/route.test.ts`: `GET` sin sesión →
  401; `GET` válido → `{ url, fileName }`; `DELETE` → `{ ok: true }`.

### 7.3 Componentes

- `src/components/admin/patient-record/PatientFilesTab.test.tsx` (nuevo,
  co-locado, patrón `PatientPaymentsTab.test.tsx`): estado vacío con
  `EmptyState`; lista con miniatura y botón de descarga; subida llama a la API
  con `FormData` y dispara `onFilesChanged`; error de validación muestra el
  mensaje en español.
- `app/(admin)/patients/[id]/page.test.tsx` (extender): la pestaña "Archivos"
  aparece en el expediente y carga los archivos del paciente.

### 7.4 Comandos de validación

```bash
npx vitest run src/lib/admin/__tests__/patient-files.test.ts
npx vitest run "app/api/admin/patients/[id]/files/route.test.ts" "app/api/admin/patients/[id]/files/[fileId]/route.test.ts"
npx vitest run src/components/admin/patient-record/PatientFilesTab.test.tsx
npm run typecheck   # tsc --noEmit
npm run test        # vitest run — suite completa al cierre
npm run build       # next build — verificación de la fase
```

No hay runner de migraciones en `npm test`; la migración `0020` se verifica de
forma estructural (tabla, columnas, índices, RLS y bucket) y de forma manual
contra la base viva en la verificación de la fase.

---

## 8. Open Questions

Ninguna. Quedan resueltos: tipos y tamaño (jpg/png/webp/pdf, 10 MB), bucket
privado con URLs firmadas, ruta de objeto `{patientId}/{uuid}.{ext}`, categorías
fijas, renumber-at-merge de `0020` como nota de merge y subida de archivos
**después** de guardar la consulta. El visor DICOM, el OCR y la migración masiva
del archivo físico quedan explícitamente **fuera de alcance** en `proposal.md`.

---

## 9. Cambios de archivos

### Fase 1 — Modelo de datos + almacenamiento seguro

| Archivo | Acción | Propósito |
|---|---|---|
| `supabase/migrations/0020_patient_files.sql` | Nuevo | Tabla `patient_files`, índices, RLS, bucket privado y policies de `storage.objects`. |
| `supabase/migrations/down/0020_patient_files.down.sql` | Nuevo | Reverso estructural (policies, tabla, bucket). |
| `src/lib/admin/types.ts` | Modificar | `PatientFile`, `PatientFileCategory`, `PatientFileInput`. |
| `src/lib/admin/patient-files.ts` | Nuevo | Servicio: constantes, validación, subir/listar/firmar/eliminar y `mapRow`. |
| `src/lib/admin/__tests__/patient-files.test.ts` | Nuevo | Tests de la lib. |
| `app/api/admin/patients/[id]/files/route.ts` | Nuevo | `GET` (lista + URLs firmadas) y `POST` (subida multipart). |
| `app/api/admin/patients/[id]/files/route.test.ts` | Nuevo | Tests de la ruta de colección. |
| `app/api/admin/patients/[id]/files/[fileId]/route.ts` | Nuevo | `GET` URL firmada de descarga y `DELETE`. |
| `app/api/admin/patients/[id]/files/[fileId]/route.test.ts` | Nuevo | Tests de la ruta de archivo. |

### Fase 2 — Pestaña "Archivos" en el expediente

| Archivo | Acción | Propósito |
|---|---|---|
| `src/components/admin/patient-record/PatientFilesTab.tsx` | Nuevo | Drag & drop, miniaturas, descarga PDF, categoría y consulta. |
| `src/components/admin/patient-record/PatientFilesTab.test.tsx` | Nuevo | Tests del componente. |
| `src/components/admin/patient-record/PatientRecordTabs.tsx` | Modificar | Entrada `files`/`Archivos` y props de archivos. |
| `app/(admin)/patients/[id]/page.tsx` | Modificar | Estado, carga y cableado de archivos. |
| `app/(admin)/patients/[id]/page.test.tsx` | Modificar | Cobertura de la pestaña "Archivos". |

### Fase 3 — Integración con la consulta clínica

| Archivo | Acción | Propósito |
|---|---|---|
| `src/components/admin/patient-record/ClinicalVisitForm.tsx` | Modificar | Adjuntar archivos después de crear/actualizar la consulta. |
| `src/components/admin/patient-record/PatientFilesTab.tsx` | Modificar | Soportar `clinicalVisitId` fijo (modo consulta). |
| `src/lib/admin/patient-files.ts` | Modificar | Reforzar la validación de pertenencia de visita si hace falta. |

### Sin cambios

- `supabase/migrations/0013_clinical_record.sql` y `0019_*.sql`.
- `src/lib/admin/clinical-visits.ts` y su contrato JSON de consulta.
- El agente de WhatsApp, la reserva pública y `travelhub-app`.
