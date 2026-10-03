# Change: Carga de archivos clínicos del paciente con Supabase Storage

## Why

En la consulta presencial, Jorge (el dentista / cliente del consultorio) abre el
expediente en su laptop para revisar el caso **mientras atiende al paciente**. Hoy
los estudios y documentos que necesita ver —radiografías, fotos clínicas,
consentimientos, resultados de laboratorio— llegan **dispersos**: por WhatsApp en
el teléfono, por correo, o como foto suelta en la galería. El expediente digital
no los contiene, así que durante la consulta tiene que saltar entre apps y
dispositivos para encontrar la imagen correcta. Esto rompe el flujo de trabajo,
pierde tiempo y hace que el expediente no sea la fuente única de verdad del
caso.

Este cambio agrega la capacidad de **subir y consultar archivos clínicos del
paciente dentro de su expediente**, almacenados de forma segura y privada en
Supabase Storage, con acceso exclusivo para staff autenticado. Cubre el issue
[#91](https://github.com/proyecto-polaris-ia/medica-app/issues/91) y materializa
la necesidad de MVP-3 descrita en el mismo.

## What Changes

Entrega incremental en **tres fases con PRs apilados**, cada una revisable por
separado.

### Fase 1 — Modelo de datos + almacenamiento seguro

- Migración `0020_patient_files.sql` aditiva e idempotente que crea la tabla
  `patient_files` (metadatos: `patient_id`, `clinical_visit_id` nullable,
  `category`, `storage_path`, `mime_type`, `size_bytes`, `uploaded_by`,
  `created_at`) con RLS habilitado y sin acceso `anon`.
- Bucket **privado** `patient-files` en Supabase Storage
  (`storage.buckets.public = false`) con límite de tamaño y tipos MIME
  permitidos, más policies de `storage.objects` alineadas al estilo RLS vigente
  (solo `authenticated`, nunca `anon`).
- Librería de servicio `src/lib/admin/patient-files.ts` (archivo plano, patrón
  `medical-history.ts`) con `getSupabaseAdmin()` y validadores: valida tipo y
  tamaño, sube el objeto al bucket, inserta metadatos y lista/elimina/firma
  descargas.
- API autenticada por sesión: `GET/POST` en
  `app/api/admin/patients/[id]/files/route.ts` y `GET/DELETE` en
  `app/api/admin/patients/[id]/files/[fileId]/route.ts`, con `requireUser()` +
  `handleAdminRequest`.

### Fase 2 — Pestaña "Archivos" en el expediente

- Componente cliente `PatientFilesTab.tsx` agregado al arreglo `TabId` / `TABS`
  de `PatientRecordTabs.tsx`, con callback `onFilesChanged`.
- Carga por **arrastrar y soltar** o selector de archivo; miniatura para
  imágenes y descarga para PDF; selector de categoría; selector opcional de
  consulta clínica al subir.
- Estados de carga, vacío y error reutilizando `LoadingState` / `EmptyState` /
  `ErrorState`.

### Fase 3 — Integración con la consulta clínica

- Botón en `ClinicalVisitForm.tsx` que, **después** de crear o actualizar la
  consulta, dispara la carga de archivos asociada al `clinical_visit_id` recién
  obtenido. La carga **no** viaja dentro del formulario JSON de la consulta: el
  archivo requiere `multipart/form-data` y necesita primero el id de la visita.
- Vista por consulta: el listado de archivos puede filtrarse por
  `clinical_visit_id` para revisar los estudios de una visita concreta.

### Fuera de alcance

- **Visor DICOM** o cualquier renderizado de imágenes médicas especializado.
- **OCR** o extracción automática de texto de los archivos.
- **Migración masiva del archivo físico** existente del consultorio (los
  archivos históricos se suben manualmente cuando haga falta).
- Compartir archivos con el paciente por WhatsApp/correo, enlaces públicos o
  cualquier acceso fuera del staff autenticado.
- Diagnóstico asistido, precios o disponibilidad derivados del contenido.

## Capabilities

### New Capabilities

- `patient-clinical-files`: Carga, almacenamiento privado y consulta de archivos
  clínicos de un paciente (radiografías, fotos clínicas, documentos,
  consentimientos, laboratorio y otros). Incluye la tabla de metadatos
  `patient_files`, el bucket privado `patient-files` con sus policies, la API
  autenticada por sesión para listar/subir/descargar/eliminar, la pestaña
  "Archivos" del expediente y la integración con la consulta clínica. Todo el
  acceso MUST requerir sesión de administrador válida; `anon` queda fuera.

### Modified Capabilities

- Ninguna. La pestaña "Archivos" es una superficie **aditiva** dentro del
  expediente del paciente y todo su comportamiento (metadatos, bucket, API y UI)
  queda encapsulado en la capability nueva `patient-clinical-files`.
  - Se evaluaron las capabilities existentes `clinical-record` y
    `patient-record-summary` (dueñas del expediente y de sus pestañas) y **no se
    modifican**: no se altera ningún requisito de historia clínica ni de notas
    SOAP, y la navegación de pestañas sólo **agrega** una entrada sin cambiar el
    contrato de las existentes. Es el mismo criterio que usó
    `dashboard-agenda-metrics` al declarar `Modified Capabilities: Ninguna` para
    una superficie de lectura autocontenida.

## Approach

- **Metadatos en Postgres, bytes en Storage.** La tabla `patient_files` guarda
  ruta, tipo MIME, tamaño y categoría; los bytes viven en el bucket privado
  `patient-files`. Nunca se guarda el binario en la base de datos ni se expone
  una URL pública.
- **Bucket privado + URL firmada.** El objeto se sirve con
  `createSignedUrl` de vida corta generada en el servidor; el cliente nunca
  recibe credenciales de servicio. El bucket tiene `public = false`.
- **Autenticación en la ruta, RLS como defensa en profundidad.** Las rutas de
  API usan `requireUser()`; la lib usa `getSupabaseAdmin()` (service role)
  siguiendo la convención del repo (auth en la capa de ruta, RLS al nivel de
  base como segunda barrera). La llave `SUPABASE_SERVICE_ROLE_KEY` **nunca**
  viaja al navegador.
- **Validación de tipo y tamaño antes de subir.** Solo `jpg`, `png`, `webp` y
  `pdf`, con un tope de tamaño por archivo. Un archivo rechazado devuelve un
  mensaje claro en español.
- **Reutilización de patrones existentes.** Archivo plano de servicio como
  `medical-history.ts`, `mapRow` + validadores de `validate.ts`, contrato de
  respuestas con `handleAdminRequest` + `_lib/responses`, y componentes de
  estado del panel admin.
- **Fases apiladas.** Fase 1 (migración + bucket + lib + tests) es la base; Fase
  2 (pestaña) consume la API; Fase 3 (visita clínica) integra la subida tras
  crear/editar la consulta.

## Decisions

| Decisión | Valor | Razón |
|---|---|---|
| Almacenamiento | Bucket privado `patient-files` + URL firmada | Los datos clínicos son confidenciales; nunca URL pública. |
| Tipos permitidos | `image/jpeg`, `image/png`, `image/webp`, `application/pdf` | Cubre fotos, radiografías exportadas y documentos sin abrir la puerta a formatos arbitrarios. |
| Tope de tamaño | 10 MB por archivo | Suficiente para fotos/radiografías de celular y PDFs; se rechaza con mensaje en español. |
| Número de migración | `0020` (`NNNN_nombre.sql`) | `0019` ya está ocupado por `dashboard-agenda-metrics`; **revisar colisión al hacer merge** y renumerar si otra rama tomó `0020`. |
| Autenticación | `requireUser()` en la ruta; RLS en la base | Convención vigente del repo; la llave de servicio sólo existe en el servidor. |
| Asociación a consulta | `clinical_visit_id` nullable | Un archivo puede pertenecer al paciente sin visita, o a una visita concreta. |
| Entrega | 3 fases con PRs apilados | Revisión incremental y riesgo acotado por fase. |
| Feature flag | No aplica | Capacidad aditiva para staff autenticado; no cambia flujos públicos. |

## Impacto

Archivos esperados (sin modificar `travelhub-app`):

| Área | Impacto | Descripción |
|---|---|---|
| `supabase/migrations/0020_patient_files.sql` | New | Tabla `patient_files` + bucket + policies RLS/storage. |
| `supabase/migrations/down/0020_patient_files.down.sql` | New | Reverso estructural (tabla, policies, bucket). |
| `src/lib/admin/patient-files.ts` | New | Servicio: validar, subir, listar, firmar descarga y eliminar. |
| `src/lib/admin/types.ts` | Modified | Tipo `PatientFile` y `PatientFileInput` / categorías. |
| `src/lib/admin/__tests__/patient-files.test.ts` | New | Tests de la lib (validación, mapRow, rutas de storage). |
| `app/api/admin/patients/[id]/files/route.ts` | New | `GET` lista + `POST` subida (`request.formData()`). |
| `app/api/admin/patients/[id]/files/[fileId]/route.ts` | New | `GET` URL firmada de descarga + `DELETE`. |
| `app/api/admin/patients/[id]/files/route.test.ts` | New | Tests de la ruta de colección. |
| `app/api/admin/patients/[id]/files/[fileId]/route.test.ts` | New | Tests de la ruta de archivo. |
| `src/components/admin/patient-record/PatientFilesTab.tsx` | New | Pestaña de archivos: drag & drop, miniaturas, descarga. |
| `src/components/admin/patient-record/PatientFilesTab.test.tsx` | New | Test de componente. |
| `src/components/admin/patient-record/PatientRecordTabs.tsx` | Modified | Nueva entrada `files`/`Archivos` + `onFilesChanged`. |
| `src/components/admin/patient-record/ClinicalVisitForm.tsx` | Modified | Botón de carga posterior a crear/actualizar la consulta. |
| `app/(admin)/patients/[id]/page.tsx` | Modified | Estado y carga de archivos, cableado a `PatientRecordTabs`. |
| `app/(admin)/patients/[id]/page.test.tsx` | Modified | Cobertura de la nueva pestaña en el expediente. |

## Rollback plan

- **Revertir los PRs.** La capacidad es aditiva: revertir Fase 3, Fase 2 y Fase 1
  restaura el expediente previo sin afectar historia clínica, consultas, citas,
  planes ni pagos.
- **La migración es aditiva.** `0020` crea una tabla y un bucket nuevos; no
  altera tablas existentes ni borra datos. El `down` propuesto revierte tabla,
  policies y bucket.
- **Los bytes subidos no se pierden al revertir código.** Si se revierte el
  código con archivos ya cargados, los objetos permanecen en el bucket y las
  filas en `patient_files`; son un dato histórico válido. La migración `down`
  sólo se usa si se decide eliminar por completo la capacidad (con respaldo
  previo del bucket).
- **Sin efecto en rutas públicas.** Nada de este cambio toca el agente de
  WhatsApp, la reserva pública ni la autenticación del staff.

## Riesgos

- **Colisión de número de migración.** Otra rama pudo tomar `0020`; al hacer
  merge hay que renumerar y verificar el orden. Mitigación: nota explícita en
  `design.md` y en las tareas.
- **Archivos demasiado grandes o de tipo equivocado.** Se rechazan en el
  servidor con mensaje claro; el bucket también aplica límite y tipos MIME como
  segunda barrera. No basta la validación del navegador.
- **Fuga de acceso.** La llave de servicio nunca se expone al cliente y el
  bucket es privado; RLS y policies de `storage.objects` deniegan `anon`.
  Mitigación: tests de RLS/rutas sin sesión y revisión de que el cliente sólo
  usa la API propia.
- **Objetos huérfanos.** Un fallo entre subir el objeto e insertar la fila deja
  bytes sin metadatos (o al revés). Mitigación: subir primero el objeto, insertar
  después, y en el `DELETE` borrar objeto y fila; documentar la compensación si
  una de las dos operaciones falla.
- **Rendimiento del listado.** Generar una URL firmada por archivo en un loop
  sería N+1. Mitigación: firmar en lote (`createSignedUrls`) en el `GET` de la
  lista.
- **Migración física pendiente.** El archivo histórico del consultorio no se
  migra en este cambio; queda como carga manual. Es una decisión explícita, no un
  defecto.

## Criterios de éxito

- [ ] Existe la migración `0020` con la tabla `patient_files`, sus columnas,
      índices y RLS; el bucket es privado y `anon` no tiene acceso.
- [ ] La API exige sesión válida y nunca expone credenciales de servicio al
      cliente.
- [ ] Solo se aceptan `jpg`, `png`, `webp` y `pdf` dentro del tope de tamaño;
      un rechazo devuelve un mensaje claro en español.
- [ ] Un archivo puede asociarse opcionalmente a una consulta clínica.
- [ ] Se pueden listar y descargar archivos por paciente y por consulta.
- [ ] El expediente muestra la pestaña "Archivos" con carga por drag & drop,
      miniaturas de imagen y descarga de PDF.
- [ ] El cambio está especificado con SDD/OpenSpec.
