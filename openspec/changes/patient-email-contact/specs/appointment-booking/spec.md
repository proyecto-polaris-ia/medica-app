# Delta para Appointment Booking

## MODIFIED Requirements

### Requirement: Patient resolution from contact
El sistema MUST resolver o crear un paciente al reservar. Una reserva interna
iniciada en `/appointments/new` MUST aceptar un `patientId` existente o al
menos un contacto válido: teléfono E.164, correo normalizado o ambos. Cuando se
proporcione `patientId`, MUST devolverse ese paciente sin crear otro registro;
sin `patientId`, el sistema MUST resolver por los contactos recibidos. WhatsApp
SHALL conservar la resolución phone-first y el booking público SHALL conservar
su contrato telefónico y CAPTCHA. El sistema MUST completar solo contactos
faltantes, MUST NOT sobrescribir contactos existentes y MUST NOT fusionar fichas.

(Previously: La resolución aceptaba `patientId` o el par `{ phone_e164, fullName }`, y solo podía resolver o crear por teléfono cuando no había `patientId`.)

#### Scenario: First booking creates a patient
- GIVEN un contacto de WhatsApp con teléfono y sin paciente vinculado
- WHEN se realiza una reserva para ese contacto
- THEN MUST crearse un paciente con ese teléfono y vincularse al contacto

#### Scenario: Resolve by patientId
- GIVEN una reserva interna con `patientId = P1`
- WHEN el sistema resuelve al paciente
- THEN MUST devolver el paciente `P1`
- AND MUST NOT crear un registro nuevo

#### Scenario: Resolve by phone when patientId is absent
- GIVEN una reserva interna con nombre y teléfono, sin `patientId`
- WHEN el sistema resuelve al paciente
- THEN MUST encontrar al paciente por teléfono o crear uno nuevo

#### Scenario: Resolve an internal booking by email only
- GIVEN una reserva interna en `/appointments/new` con nombre y correo válidos, sin teléfono ni `patientId`
- WHEN se confirma la reserva
- THEN MUST resolverse o crearse el paciente usando el correo

#### Scenario: Both contacts identify the same patient
- GIVEN teléfono y correo que pertenecen al mismo paciente
- WHEN se confirma la reserva interna
- THEN MUST usarse ese único paciente sin crear una ficha adicional

#### Scenario: Matching patient is enriched only when a field is missing
- GIVEN un contacto identifica un paciente cuyo otro medio está vacío
- WHEN se confirma una reserva con ambos medios
- THEN MUST completarse únicamente el medio faltante
- AND el medio ya guardado MUST conservarse sin cambios

#### Scenario: Contacts identify different patients
- GIVEN el teléfono y el correo pertenecen a pacientes distintos
- WHEN se intenta confirmar la reserva interna
- THEN MUST rechazarse como conflicto de identidad sin fusionar ni modificar fichas

#### Scenario: Internal booking without contact is rejected
- GIVEN una reserva interna sin `patientId`, teléfono ni correo
- WHEN se valida la solicitud
- THEN MUST rechazarse antes de crear o modificar paciente o cita

#### Scenario: Public booking remains phone-first
- GIVEN una persona sin sesión solicita `/booking`
- WHEN envía una reserva sin teléfono o sin CAPTCHA válido
- THEN MUST rechazarse y MUST conservarse el contrato público telefónico protegido
