# Patient Clinical Files Specification

## Purpose

Permitir que el staff autenticado del consultorio cargue y consulte los archivos
clínicos de un paciente —radiografías, fotos clínicas, documentos,
consentimientos y resultados de laboratorio— directamente dentro de su
expediente, para que durante la consulta presencial el dentista no dependa de
fotos sueltas en WhatsApp o correo. Los archivos MUST almacenarse en un bucket
privado de Supabase Storage y su acceso MUST restringirse a sesiones de
administrador válidas; `anon` MUST NOT acceder ni a los metadatos ni a los
objetos. La tabla `patient_files` conserva los metadatos (categoría, ruta, tipo
MIME, tamaño, autor y fecha) y MAY vincular cada archivo con una consulta
clínica.

## Requirements

### Requirement: Registro de metadatos de archivos del paciente

El sistema MUST persistir cada archivo clínico como una fila de `patient_files`
con: `patient_id` (obligatorio), `clinical_visit_id` (opcional), `category`,
`storage_path`, `mime_type`, `size_bytes`, `uploaded_by` y `created_at`. La fila
MUST referenciar al paciente dueño y MUST NOT existir sin `patient_id`. El
`storage_path` MUST identificar de forma única al objeto dentro del bucket
privado.

#### Scenario: Archivo registrado con metadatos completos

- GIVEN un administrador autenticado y un paciente existente
- WHEN sube un archivo clínico válido
- THEN el sistema MUST crear una fila en `patient_files` con `patient_id`, `category`, `storage_path`, `mime_type`, `size_bytes`, `uploaded_by` y `created_at`
- AND la fila MUST quedar asociada al paciente correspondiente

#### Scenario: Archivo sin paciente es rechazado

- GIVEN una petición de subida sin un `patient_id` válido
- WHEN el sistema intenta registrar el archivo
- THEN el sistema MUST rechazar la operación
- AND MUST NOT crear una fila huérfana en `patient_files`

#### Scenario: Archivo sin consulta clínica asociada

- GIVEN un administrador autenticado que sube un archivo sin elegir consulta clínica
- WHEN el sistema registra el archivo
- THEN el sistema MUST persistir la fila con `clinical_visit_id` nulo
- AND el archivo MUST quedar disponible a nivel del paciente

### Requirement: Bucket privado sin acceso anónimo

El sistema MUST almacenar los bytes de los archivos en un bucket **privado**
(`patient-files`, `public = false`). El sistema MUST NOT exponer una URL pública
permanente de ningún objeto. Las descargas MUST servirse mediante URLs firmadas
de vida corta generadas en el servidor. El rol `anon` MUST NOT poder leer ni
escribir objetos del bucket.

#### Scenario: Bucket privado configurado

- GIVEN la migración de storage aplicada
- WHEN se inspecciona el bucket `patient-files`
- THEN el bucket MUST figurar como privado (`public = false`)

#### Scenario: URL pública no disponible

- GIVEN un archivo clínico almacenado
- WHEN un cliente intenta acceder al objeto por su ruta directa sin firma válida
- THEN el sistema MUST denegar el acceso
- AND MUST NOT devolver el contenido del archivo

#### Scenario: Descarga mediante URL firmada

- GIVEN un administrador autenticado y un archivo del paciente
- WHEN solicita la descarga
- THEN el sistema MUST devolver una URL firmada de vida corta para ese objeto
- AND MUST NOT exponer credenciales del servidor

### Requirement: Validación de tipo y tamaño con mensaje claro

El sistema MUST aceptar únicamente archivos `jpg` (`image/jpeg`), `png`
(`image/png`), `webp` (`image/webp`) y `pdf` (`application/pdf`). El sistema MUST
rechazar cualquier archivo de otro tipo o que exceda el tope de tamaño
permitido. Todo rechazo MUST devolver un mensaje claro en español que indique
qué tipos y qué tamaño se aceptan, y MUST NOT almacenar el archivo.

#### Scenario: Tipo permitido aceptado

- GIVEN un archivo `image/jpeg`, `image/png`, `image/webp` o `application/pdf` dentro del tope de tamaño
- WHEN un administrador autenticado lo sube
- THEN el sistema MUST aceptar la subida
- AND MUST registrar sus metadatos

#### Scenario: Tipo no permitido rechazado con mensaje en español

- GIVEN un archivo de un tipo no permitido (por ejemplo, un ejecutable o un video)
- WHEN un administrador autenticado intenta subirlo
- THEN el sistema MUST rechazar la subida
- AND MUST devolver un mensaje en español que indique los tipos permitidos
- AND MUST NOT almacenar el archivo

#### Scenario: Archivo demasiado grande rechazado con mensaje en español

- GIVEN un archivo del tipo permitido que excede el tope de tamaño
- WHEN un administrador autenticado intenta subirlo
- THEN el sistema MUST rechazar la subida
- AND MUST devolver un mensaje en español que indique el tamaño máximo permitido
- AND MUST NOT almacenar el archivo

### Requirement: Carga y lectura autenticadas por sesión

Toda operación de subida, listado, descarga y eliminación de archivos clínicos
MUST requerir una sesión de administrador válida y MUST NOT aceptarse sin
autenticación. Las operaciones MUST ejecutarse a través de la API propia del
sistema; el cliente MUST NOT recibir ni usar credenciales de service role. Los
bytes MUST subirse a Storage y los metadatos a la base de datos como parte de la
misma operación de negocio.

#### Scenario: Subida autenticada

- GIVEN un administrador con sesión válida
- WHEN sube un archivo válido de un paciente
- THEN el sistema MUST almacenar el objeto en el bucket privado
- AND MUST registrar los metadatos del archivo

#### Scenario: Petición sin sesión rechazada

- GIVEN una petición sin sesión de administrador válida
- WHEN intenta subir, listar, descargar o eliminar un archivo clínico
- THEN el sistema MUST responder no autorizado (401)
- AND MUST NOT devolver ni almacenar datos del archivo

#### Scenario: El cliente no recibe credenciales de servicio

- GIVEN un administrador autenticado usando la interfaz del expediente
- WHEN sube o descarga un archivo
- THEN la operación MUST pasar por la API propia del sistema
- AND el cliente MUST NOT recibir la llave de servicio ni la llave anónima de escritura

### Requirement: Asociación opcional a la consulta clínica

Cada archivo MAY asociarse a una consulta clínica del mismo paciente mediante
`clinical_visit_id` (`NULL` cuando no aplica). El sistema MUST rechazar la
asociación de un archivo a una consulta que no pertenezca al mismo paciente.

#### Scenario: Asociar archivo a una consulta del mismo paciente

- GIVEN un administrador autenticado, un paciente y una consulta clínica de ese paciente
- WHEN sube un archivo indicando esa consulta
- THEN el sistema MUST registrar el archivo con ese `clinical_visit_id`

#### Scenario: Consulta de otro paciente rechazada

- GIVEN una consulta clínica que pertenece a un paciente distinto
- WHEN un administrador intenta asociar un archivo de este paciente a esa consulta
- THEN el sistema MUST rechazar la operación
- AND MUST NOT vincular el archivo a la consulta ajena

### Requirement: Listado y descarga por paciente y por consulta

El sistema MUST permitir listar los archivos de un paciente y MUST permitir
filtrarlos por consulta clínica. El listado MUST devolver los metadatos de cada
archivo y MUST poder entregar, para cada uno, una forma de obtener su contenido
(URL firmada o descarga explícita). El sistema MUST permitir eliminar un archivo
del paciente, removiendo tanto el objeto almacenado como su fila de metadatos.

#### Scenario: Listado por paciente

- GIVEN un administrador autenticado y un paciente con archivos cargados
- WHEN solicita el listado de archivos del paciente
- THEN el sistema MUST devolver los metadatos de esos archivos

#### Scenario: Listado filtrado por consulta

- GIVEN un paciente con archivos asociados a distintas consultas
- WHEN un administrador solicita los archivos de una consulta concreta
- THEN el sistema MUST devolver únicamente los archivos de esa consulta

#### Scenario: Descarga de un archivo

- GIVEN un administrador autenticado y un archivo existente del paciente
- WHEN solicita la descarga de ese archivo
- THEN el sistema MUST entregar el contenido mediante una URL firmada de vida corta

#### Scenario: Eliminación de un archivo

- GIVEN un administrador autenticado y un archivo existente del paciente
- WHEN solicita eliminarlo
- THEN el sistema MUST remover el objeto del bucket
- AND MUST remover la fila de metadatos correspondiente

### Requirement: RLS deniega el acceso no autenticado

Las tablas y las policies de storage MUST habilitar Row Level Security y
MUST NOT otorgar acceso al rol `anon`. Solo los usuarios `authenticated` MAY leer
o escribir archivos del bucket `patient-files` y las filas de `patient_files`. Un
acceso no autenticado MUST ser rechazado a nivel de base de datos, con
independencia de la capa de API.

#### Scenario: Rol anónimo denegado en metadatos

- GIVEN un rol `anon` sobre la tabla `patient_files`
- WHEN intenta consultarla directamente
- THEN la consulta MUST ser rechazada por control de acceso a nivel fila

#### Scenario: Rol anónimo denegado en storage

- GIVEN un rol `anon` sobre `storage.objects` para el bucket `patient-files`
- WHEN intenta leer o escribir un objeto
- THEN la operación MUST ser rechazada por las policies del bucket

#### Scenario: Usuario autenticado permitido

- GIVEN un usuario `authenticated`
- WHEN lee o escribe un archivo dentro del bucket `patient-files`
- THEN las policies MUST permitir la operación

### Requirement: Pestaña "Archivos" en el expediente del paciente

El expediente del paciente MUST ofrecer una pestaña "Archivos" que liste los
archivos del paciente con su categoría, tipo, tamaño y fecha. La pestaña MUST
permitir subir archivos por arrastrar y soltar o mediante selector, MUST mostrar
miniatura para las imágenes, MUST ofrecer descarga para los PDF, MUST permitir
elegir la categoría y MUST permitir eliminar archivos. La pestaña MUST mostrar un
estado vacío cuando no haya archivos y un estado de error cuando la carga falle.

#### Scenario: Pestaña con archivos

- GIVEN un paciente con archivos cargados
- WHEN el administrador abre la pestaña "Archivos"
- THEN el sistema MUST listar los archivos con su categoría, tipo, tamaño y fecha
- AND MUST mostrar miniatura para las imágenes y descarga para los PDF

#### Scenario: Subida por arrastrar y soltar o selector

- GIVEN el administrador en la pestaña "Archivos"
- WHEN suelta un archivo válido o lo elige con el selector
- THEN el sistema MUST subir el archivo y reflejarlo en el listado

#### Scenario: Estado vacío sin archivos

- GIVEN un paciente sin archivos cargados
- WHEN el administrador abre la pestaña "Archivos"
- THEN el sistema MUST mostrar un estado vacío que invite a subir el primer archivo
- AND MUST NOT mostrar una lista inválida

#### Scenario: Eliminación desde la pestaña

- GIVEN el administrador viendo un archivo en la pestaña "Archivos"
- WHEN confirma su eliminación
- THEN el sistema MUST eliminar el archivo
- AND MUST actualizar el listado mostrado

### Requirement: Integración con la consulta clínica

El formulario de consulta clínica MUST ofrecer la carga de archivos asociada a la
consulta. Como la subida requiere `multipart/form-data` y el identificador de la
consulta sólo existe después de crearla o actualizarla, el sistema MUST subir los
archivos **después** de registrar la consulta y MUST usar el
`clinical_visit_id` resultante. El sistema MUST NOT intentar enviar los archivos
dentro del cuerpo JSON de la consulta.

#### Scenario: Subida posterior a crear la consulta

- GIVEN un administrador creando una nueva consulta clínica
- WHEN guarda la consulta y adjunta archivos
- THEN el sistema MUST registrar primero la consulta
- AND MUST subir los archivos usando el `clinical_visit_id` recién creado

#### Scenario: Subida posterior a actualizar la consulta

- GIVEN un administrador editando una consulta clínica existente
- WHEN guarda los cambios y adjunta archivos
- THEN el sistema MUST actualizar la consulta
- AND MUST subir los archivos asociados al `clinical_visit_id` de la consulta

#### Scenario: Archivos fuera del cuerpo JSON

- GIVEN el formulario de consulta clínica con archivos adjuntos
- WHEN el sistema envía la consulta
- THEN el cuerpo JSON de la consulta MUST NOT incluir los binarios
- AND la subida de archivos MUST realizarse por separado en formato multipart
