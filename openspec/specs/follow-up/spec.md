# Follow-Up Specification

## Purpose

Convertir los datos ya existentes del consultorio dental (citas en estado `no_show`, planes de tratamiento, visitas clínicas y pacientes) en una lista diaria determinista de pacientes a contactar, con acciones manuales y borradores de mensaje que solo se envían tras aprobación humana explícita. El LLM no participa: las reglas de segmentación son puras, sin I/O ni relojes implícitos, el estado de contacto se persiste por ronda y ningún proceso automático envía mensajes.

## Requirements

### Requirement: Segmento de no-shows recuperables

El sistema MUST incluir en el segmento de no-shows recuperables toda cita en
estado `no_show` cuyo `start_at` esté dentro de los últimos 90 días, incluyendo
el límite exacto de 90 días, y para la cual el paciente MUST NOT tener ninguna
cita posterior no cancelada. Una cita posterior MUST contar como cita posterior
solo cuando su `start_at` sea posterior al `start_at` del no-show y su estado sea
distinto de `cancelled`. Los no-shows con más de 90 días de antigüedad MUST NOT
incluirse.

**Criterio explícito:** una cita posterior cancelada NO excluye al no-show; si el
paciente solo tiene citas canceladas posteriores, el no-show permanece
recuperable. Una cita posterior `rescheduled` cuenta como cita posterior porque
su estado es distinto de `cancelled`.

#### Scenario: No-show dentro de la ventana sin cita posterior

- GIVEN una cita en estado `no_show` con `start_at` hace 30 días
- AND el paciente no tiene ninguna cita posterior
- WHEN el sistema calcula el segmento de no-shows recuperables
- THEN la cita MUST incluirse en el segmento

#### Scenario: Límite exacto de 90 días

- GIVEN una cita en estado `no_show` con `start_at` exactamente hace 90 días
- AND el paciente no tiene ninguna cita posterior
- WHEN el sistema calcula el segmento de no-shows recuperables
- THEN la cita MUST incluirse en el segmento

#### Scenario: No-show con cita posterior no cancelada

- GIVEN una cita en estado `no_show` con `start_at` hace 20 días
- AND el paciente tiene una cita atendida con `start_at` hace 5 días
- WHEN el sistema calcula el segmento de no-shows recuperables
- THEN la cita MUST NOT incluirse en el segmento

#### Scenario: No-show con solo citas canceladas posteriores

- GIVEN una cita en estado `no_show` con `start_at` hace 20 días
- AND el paciente solo tiene una cita `cancelled` con `start_at` hace 5 días
- WHEN el sistema calcula el segmento de no-shows recuperables
- THEN la cita MUST incluirse en el segmento

### Requirement: Segmento de tratamientos inconclusos

El sistema MUST incluir en el segmento de tratamientos inconclusos todo plan de
tratamiento en estado `in_progress` cuya última visita clínica del paciente,
medida como el máximo `clinical_visits.created_at`, tenga más de 45 días de
antigüedad. Los planes `in_progress` con una visita clínica de 45 días o menos
MUST NOT incluirse.

**Criterio explícito:** si el paciente no tiene ninguna visita clínica, el
sistema MUST usar `treatment_plans.created_at` como fecha de referencia y aplicar
el mismo umbral de 45 días. Así el plan no se descarta silenciosamente cuando
falta el registro de visitas.

#### Scenario: Plan con última visita mayor a 45 días

- GIVEN un plan en estado `in_progress`
- AND la última visita clínica del paciente (`clinical_visits.created_at` máxima) es hace 60 días
- WHEN el sistema calcula el segmento de tratamientos inconclusos
- THEN el plan MUST incluirse en el segmento

#### Scenario: Plan con visita reciente no se incluye

- GIVEN un plan en estado `in_progress`
- AND la última visita clínica del paciente es hace 30 días
- WHEN el sistema calcula el segmento de tratamientos inconclusos
- THEN el plan MUST NOT incluirse en el segmento

#### Scenario: Plan sin visitas usa la fecha de creación del plan

- GIVEN un plan en estado `in_progress` creado hace 60 días
- AND el paciente no tiene ninguna visita clínica
- WHEN el sistema calcula el segmento de tratamientos inconclusos
- THEN el plan MUST incluirse usando `treatment_plans.created_at` como referencia

### Requirement: Segmento de pacientes inactivos

El sistema MUST incluir en el segmento de pacientes inactivos todo paciente con
al menos una cita histórica, es decir una cita atendida o con `start_at` en el
pasado, cuya cita más reciente (máximo `start_at` entre las citas no canceladas)
tenga más de 6 meses. Un paciente con una cita futura programada MUST NOT
considerarse inactivo.

#### Scenario: Paciente sin cita reciente

- GIVEN un paciente con una cita atendida con `start_at` hace 8 meses
- AND el paciente no tiene ninguna cita posterior
- WHEN el sistema calcula el segmento de pacientes inactivos
- THEN el paciente MUST incluirse en el segmento

#### Scenario: Paciente con cita reciente

- GIVEN un paciente con una cita atendida con `start_at` hace 2 meses
- WHEN el sistema calcula el segmento de pacientes inactivos
- THEN el paciente MUST NOT incluirse en el segmento

#### Scenario: Paciente con cita futura programada

- GIVEN un paciente cuya cita más reciente pasada fue hace 8 meses
- AND el paciente tiene una cita futura programada
- WHEN el sistema calcula el segmento de pacientes inactivos
- THEN el paciente MUST NOT incluirse en el segmento

### Requirement: Segmento de presupuestos sin respuesta

El sistema MUST incluir en el segmento de presupuestos sin respuesta todo plan de
tratamiento en estado `presented` cuyo `updated_at` tenga más de 21 días. Los
planes que ya no estén en `presented` (por ejemplo `accepted` o `cancelled`)
MUST NOT incluirse.

**Limitación documentada:** el esquema no tiene `presented_at`, por lo que la
antigüedad se aproxima con `treatment_plans.updated_at`. Esa fecha MUST
interpretarse como último cambio del plan y MUST NOT presentarse como la fecha
exacta de presentación al paciente.

#### Scenario: Plan presentado con más de 21 días sin respuesta

- GIVEN un plan en estado `presented` con `updated_at` hace 30 días
- WHEN el sistema calcula el segmento de presupuestos sin respuesta
- THEN el plan MUST incluirse en el segmento

#### Scenario: Plan presentado reciente no se incluye

- GIVEN un plan en estado `presented` con `updated_at` hace 10 días
- WHEN el sistema calcula el segmento de presupuestos sin respuesta
- THEN el plan MUST NOT incluirse en el segmento

#### Scenario: Plan que ya no está presentado no se incluye

- GIVEN un plan con `updated_at` hace 30 días
- AND el plan está en estado `accepted` o `cancelled`
- WHEN el sistema calcula el segmento de presupuestos sin respuesta
- THEN el plan MUST NOT incluirse en el segmento

### Requirement: Deduplicación por paciente con motivo principal

Un paciente MUST aparecer a lo sumo una vez en la lista del día, con un único
motivo principal. Cuando un paciente califique para varios segmentos, el motivo
MUST determinarse por la prioridad `no-show` > `tratamiento inconcluso` >
`presupuesto` > `inactivo`, de mayor a menor.

#### Scenario: Paciente en varios segmentos aparece una sola vez

- GIVEN un paciente que califica a la vez para no-show recuperable y presupuesto sin respuesta
- WHEN el sistema construye la lista del día
- THEN el paciente MUST aparecer exactamente una vez
- AND su motivo principal MUST ser no-show recuperable

#### Scenario: Precedencia de tratamiento inconcluso

- GIVEN un paciente que califica a la vez para tratamiento inconcluso, presupuesto sin respuesta y paciente inactivo
- WHEN el sistema construye la lista del día
- THEN el paciente MUST aparecer exactamente una vez
- AND su motivo principal MUST ser tratamiento inconcluso

#### Scenario: Paciente en un solo segmento conserva su motivo

- GIVEN un paciente que solo califica para paciente inactivo
- WHEN el sistema construye la lista del día
- THEN el paciente MUST aparecer una vez con motivo paciente inactivo

### Requirement: Determinismo y umbrales configurables

Las reglas de segmentación MUST ser puras: MUST NOT hacer I/O ni leer relojes
implícitos, y la fecha de referencia MUST recibirse como parámetro explícito. La
lista del día MUST ser determinista dada la misma fecha de referencia y los
mismos datos. Los umbrales (90 días para no-shows, 45 días para tratamientos
inconclusos, 6 meses para pacientes inactivos y 21 días para presupuestos) y el
orden de prioridad de motivos MUST definirse como constantes configurables en
código.

#### Scenario: Misma entrada produce la misma salida

- GIVEN los mismos datos de citas, planes, visitas y pacientes
- AND la misma fecha de referencia
- WHEN el sistema calcula la lista del día dos veces
- THEN ambas listas MUST ser idénticas en contenido y orden

#### Scenario: Umbrales configurables

- GIVEN las constantes de umbrales del módulo de seguimiento
- WHEN el sistema evalúa un caso justo en el límite de cada umbral
- THEN el resultado MUST derivarse de esas constantes y MUST ser reproducible

#### Scenario: Fecha de referencia explícita

- GIVEN una ejecución de las reglas con una fecha de referencia distinta
- WHEN el sistema recalcula los segmentos
- THEN el resultado MUST depender únicamente de la fecha recibida y de los datos, sin usar el reloj del sistema de forma implícita

### Requirement: Exclusión de pacientes ya contactados o descartados en la ronda

El sistema MUST excluir de la lista del día a todo paciente con estado contactado
o descartado en la ronda actual. La ronda MUST definirse como el día calendario
en `America/Mexico_City`. El estado de una ronda anterior MUST NOT excluir al
paciente de una ronda nueva.

#### Scenario: Paciente contactado no reaparece en la misma ronda

- GIVEN un paciente marcado como contactado en la ronda actual
- WHEN el sistema construye la lista del día
- THEN el paciente MUST NOT aparecer en la lista

#### Scenario: Paciente descartado no reaparece en la misma ronda

- GIVEN un paciente descartado en la ronda actual
- WHEN el sistema construye la lista del día
- THEN el paciente MUST NOT aparecer en la lista

#### Scenario: El estado de otra ronda no excluye la ronda actual

- GIVEN un paciente contactado en la ronda de ayer
- AND el paciente sigue calificando para un segmento hoy
- WHEN el sistema construye la lista de la ronda actual
- THEN el paciente MAY aparecer en la lista de hoy

### Requirement: Página de lista diaria protegida

El sistema MUST exponer la lista del día en la ruta `app/(admin)/follow-up/`,
protegida por sesión mediante `requireUser()` y `handleAdminRequest()`. La página
MUST mostrar los casos agrupados por motivo y MUST incluir, como mínimo, el
nombre del paciente, su teléfono y la fecha o estado relevante del motivo.

#### Scenario: Acceso sin sesión

- GIVEN una petición a `app/(admin)/follow-up/` sin sesión válida
- WHEN el sistema procesa la petición
- THEN el acceso MUST rechazarse o redirigirse como cualquier ruta admin
- AND el sistema MUST NOT exponer datos de pacientes a `anon`

#### Scenario: Acceso con sesión muestra la lista agrupada

- GIVEN una sesión válida de usuario autenticado
- WHEN el usuario abre `app/(admin)/follow-up/`
- THEN el sistema MUST mostrar la lista del día
- AND los casos MUST estar agrupados por motivo

#### Scenario: La lista muestra los datos mínimos del paciente

- GIVEN un paciente en la lista del día
- WHEN el sistema renderiza su caso
- THEN el caso MUST mostrar nombre, teléfono y la fecha o estado relevante del motivo

### Requirement: Acción marcar como contactado

El sistema MUST permitir marcar un caso como contactado. La acción MUST persistir
`contacted_at` como `timestamptz` y MUST registrar quién la ejecutó. Un paciente
contactado en la ronda actual MUST NOT reintentarse en esa misma ronda.

#### Scenario: Marcar contactado persiste el instante y el usuario

- GIVEN un paciente en la lista del día
- WHEN el usuario autenticado marca el caso como contactado
- THEN el sistema MUST persistir `contacted_at` como `timestamptz`
- AND MUST registrar quién ejecutó la acción

#### Scenario: Paciente contactado sale de la lista de la ronda

- GIVEN un paciente marcado como contactado en la ronda actual
- WHEN el sistema vuelve a construir la lista del día
- THEN el paciente MUST NOT aparecer en la lista de esa ronda

### Requirement: Acción descartar

El sistema MUST permitir descartar un caso. La acción MUST persistir el estado
descartado y MUST registrar quién la ejecutó. Un paciente descartado en la ronda
actual MUST NOT reintentarse en esa misma ronda.

#### Scenario: Descartar persiste el estado y el usuario

- GIVEN un paciente en la lista del día
- WHEN el usuario autenticado descarta el caso
- THEN el sistema MUST persistir el estado descartado
- AND MUST registrar quién ejecutó la acción

#### Scenario: Paciente descartado sale de la lista de la ronda

- GIVEN un paciente descartado en la ronda actual
- WHEN el sistema vuelve a construir la lista del día
- THEN el paciente MUST NOT aparecer en la lista de esa ronda

### Requirement: Acción agendar cita enlaza al wizard existente

El sistema MUST ofrecer, por paciente, una acción "agendar cita" que enlace al
wizard existente `/appointments/new` con el paciente preseleccionable. Esta
acción MUST limitarse a navegar: MUST NOT crear la cita por sí misma ni MUST NOT
alterar el estado de contacto del caso.

#### Scenario: El enlace dirige al wizard con el paciente preseleccionado

- GIVEN un paciente en la lista del día
- WHEN el usuario elige la acción "agendar cita"
- THEN el sistema MUST dirigir a `/appointments/new`
- AND el paciente MUST quedar preseleccionable en el wizard

#### Scenario: Agendar no crea la cita ni cambia el estado de contacto

- GIVEN un paciente en la lista del día
- WHEN el usuario elige la acción "agendar cita"
- THEN el sistema MUST NOT crear ninguna cita por sí mismo
- AND el estado de contacto del caso MUST permanecer sin cambios

### Requirement: Persistencia del estado de contacto con RLS

El estado de contacto MUST persistirse en la tabla nueva `follow_up_contacts`
creada por la migración `0019`, con el instante persistido como `timestamptz`. La
tabla MUST seguir el patrón de RLS de la migración `0018`: `ENABLE ROW LEVEL
SECURITY` y `FORCE ROW LEVEL SECURITY`, `REVOKE ALL` de `anon` y `authenticated`,
`GRANT` a `authenticated`, y policy `follow_up_contacts_admin_all FOR ALL TO
authenticated USING (auth.uid() IS NOT NULL)`.

#### Scenario: La migración crea la tabla con el patrón de RLS 0018

- GIVEN la migración `0019`
- WHEN el sistema aplica la migración
- THEN `follow_up_contacts` MUST existir con `ENABLE` y `FORCE ROW LEVEL SECURITY`
- AND MUST tener `REVOKE ALL` de `anon` y `authenticated`, `GRANT` a `authenticated` y la policy `follow_up_contacts_admin_all`

#### Scenario: El rol anon no accede a la tabla

- GIVEN el rol `anon`
- WHEN intenta leer o escribir `follow_up_contacts`
- THEN el acceso MUST ser denegado

#### Scenario: Los instantes se persisten como timestamptz

- GIVEN un caso marcado como contactado
- WHEN el sistema persiste el estado
- THEN `contacted_at` MUST almacenarse como `timestamptz`

### Requirement: Generación de borrador determinista

El sistema MUST generar un borrador de mensaje de seguimiento por paciente
mediante redacción determinista por plantilla, con tono amable y en español de
México. El borrador MUST NOT contener diagnósticos, consejos clínicos, presión
comercial ni precios.

#### Scenario: El borrador se genera desde plantilla según el motivo

- GIVEN un paciente con un motivo principal en la lista del día
- WHEN el sistema genera el borrador de seguimiento
- THEN el texto MUST producirse de forma determinista por plantilla
- AND MUST corresponder al motivo del caso

#### Scenario: El borrador no incluye diagnósticos ni consejos clínicos

- GIVEN un borrador de seguimiento generado
- WHEN el sistema construye su texto
- THEN el texto MUST NOT contener diagnósticos ni consejos clínicos

#### Scenario: El borrador no incluye precios ni presión comercial

- GIVEN un borrador de seguimiento generado
- WHEN el sistema construye su texto
- THEN el texto MUST NOT contener precios ni presión comercial

### Requirement: Aprobación humana explícita del borrador

El borrador MUST requerir aprobación humana explícita y MUST seguir el ciclo de
vida `draft → approved/rejected → sent/sent_failed`, persistido en la tabla nueva
`follow_up_message_drafts`. El sistema MUST NOT enviar ningún borrador de forma
automática ni mediante cron mientras esté en `draft`.

#### Scenario: Un borrador nuevo queda en draft sin envío

- GIVEN un borrador de seguimiento recién generado
- WHEN el sistema lo persiste
- THEN el borrador MUST quedar en estado `draft`
- AND el sistema MUST NOT enviarlo

#### Scenario: La aprobación humana lleva a approved

- GIVEN un borrador en estado `draft`
- WHEN el usuario autenticado lo aprueba explícitamente
- THEN el borrador MUST transicionar a `approved`

#### Scenario: El rechazo humano lleva a rejected

- GIVEN un borrador en estado `draft`
- WHEN el usuario autenticado lo rechaza explícitamente
- THEN el borrador MUST transicionar a `rejected`
- AND el sistema MUST NOT enviarlo

#### Scenario: Ningún cron ni envío automático

- GIVEN un borrador en estado `draft`
- WHEN transcurre el tiempo o se ejecuta cualquier proceso programado
- THEN el sistema MUST NOT enviar el borrador
- AND el borrador MUST permanecer en `draft` hasta una decisión humana

### Requirement: Envío solo tras aprobación por el transporte existente

El envío de un borrador MUST ocurrir únicamente tras la aprobación humana
explícita y MUST realizarse por el transporte saliente de WhatsApp existente:
plantilla server-only, idempotente por clave, insertando el envío como un mensaje
`direction = 'outbound'` en `whatsapp_messages`. Un envío fallido MUST quedar
registrado como `sent_failed` y ser visible en la interfaz.

#### Scenario: El envío aprobado produce un mensaje outbound

- GIVEN un borrador en estado `approved`
- WHEN el usuario confirma el envío
- THEN el sistema MUST enviar el mensaje por el transporte de WhatsApp existente
- AND MUST insertar el envío con `direction = 'outbound'` en `whatsapp_messages`
- AND el borrador MUST transicionar a `sent`

#### Scenario: El envío es idempotente por clave

- GIVEN un borrador aprobado con una clave de idempotencia ya usada
- WHEN el sistema reintenta el envío
- THEN el sistema MUST NOT duplicar el mensaje saliente
- AND MUST NOT registrar un segundo envío para la misma clave

#### Scenario: El envío fallido queda registrado y visible

- GIVEN un borrador en estado `approved`
- WHEN el transporte de WhatsApp falla al enviar
- THEN el borrador MUST transicionar a `sent_failed`
- AND el fallo MUST quedar registrado y ser visible en la interfaz

#### Scenario: Un borrador no aprobado no se envía

- GIVEN un borrador en estado `draft` o `rejected`
- WHEN el sistema intenta el envío
- THEN el sistema MUST NOT enviar el mensaje

### Requirement: Tono y guardrails de los textos

Los textos de seguimiento MUST tener tono de recordatorio amable y MUST estar en
español de México. MUST NOT contener diagnósticos, prescripciones, precios ni
disponibilidad inventada.

#### Scenario: Tono amable en español de México

- GIVEN un texto de seguimiento generado
- WHEN el sistema lo redacta
- THEN el texto MUST usar español de México
- AND MUST mantener un tono de recordatorio amable

#### Scenario: Sin diagnósticos ni prescripciones

- GIVEN un texto de seguimiento generado
- WHEN el sistema lo redacta
- THEN el texto MUST NOT contener diagnósticos ni prescripciones de medicamentos

#### Scenario: Sin precios ni disponibilidad inventada

- GIVEN un texto de seguimiento generado
- WHEN el sistema lo redacta
- THEN el texto MUST NOT contener precios
- AND MUST NOT ofrecer disponibilidad de horarios no leída de la base de datos
