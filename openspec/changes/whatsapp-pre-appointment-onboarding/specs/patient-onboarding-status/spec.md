# Delta for Patient Onboarding Status

## ADDED Requirements

### Requirement: Derivación determinista del estado de onboarding

El sistema MUST derivar de forma determinista el estado de onboarding del
paciente: `pendiente` cuando el paciente es nuevo o no tiene fila en
`patient_medical_history`, y `completo` cuando existe la fila con procedencia de
autoreporte del paciente. La derivación MUST basarse en datos existentes y MUST
ser reproducible para la misma entrada.

#### Scenario: Paciente nuevo o sin historia queda pendiente

- GIVEN un paciente sin fila en `patient_medical_history`
- WHEN el sistema deriva su estado de onboarding
- THEN el estado MUST ser `pendiente`

#### Scenario: Paciente con historia de autoreporte queda completo

- GIVEN un paciente con fila en `patient_medical_history` marcada con procedencia de autoreporte del paciente
- WHEN el sistema deriva su estado de onboarding
- THEN el estado MUST ser `completo`

### Requirement: Nudge de onboarding pendiente como mensaje separado

Cuando un paciente con onboarding pendiente recibe un recordatorio de cita, el
sistema MAY enviar un mensaje de nudge de onboarding. El nudge MUST ser un
mensaje o plantilla separado y MUST NOT alterar la plantilla congelada
`recordatorio_cita` ni su orden de parámetros. El nudge MUST respetar las mismas
reglas de opt-out y de deduplicación que rige el sistema de recordatorios.

#### Scenario: Onboarding pendiente junto al recordatorio

- GIVEN un paciente con onboarding `pendiente`
- WHEN el paciente recibe un recordatorio de cita
- THEN el sistema MAY enviar un nudge de onboarding como mensaje separado

#### Scenario: Onboarding completo no recibe nudge

- GIVEN un paciente con onboarding `completo`
- WHEN el paciente recibe un recordatorio de cita
- THEN el sistema MUST NOT enviar un nudge de onboarding

#### Scenario: La plantilla congelada no cambia

- GIVEN el envío de un nudge de onboarding
- WHEN el sistema construye los mensajes salientes
- THEN la plantilla `recordatorio_cita` y su orden de parámetros MUST permanecer sin cambios
- AND el nudge MUST enviarse como mensaje o plantilla separado

#### Scenario: El nudge respeta opt-out y deduplicación

- GIVEN un paciente que pidió no recibir mensajes o que ya recibió el nudge vigente
- WHEN el sistema evalúa enviar el nudge de onboarding
- THEN el sistema MUST NOT enviar el nudge
- AND MUST respetar las mismas reglas de opt-out y deduplicación del sistema de recordatorios

### Requirement: Badge de onboarding en el expediente

El expediente del paciente MUST mostrar un badge de estado de onboarding
(`pendiente` o `completo`) como superficie aditiva. Este badge MUST NOT alterar
el comportamiento del badge de advertencia clínica existente ni el resto de las
superficies del expediente.

#### Scenario: Paciente pendiente muestra badge pendiente

- GIVEN un paciente con onboarding `pendiente`
- WHEN se renderiza su expediente
- THEN el sistema MUST mostrar el badge de onboarding `pendiente`

#### Scenario: Paciente completo muestra badge completo

- GIVEN un paciente con onboarding `completo`
- WHEN se renderiza su expediente
- THEN el sistema MUST mostrar el badge de onboarding `completo`

#### Scenario: El badge de advertencia clínica no cambia

- GIVEN un paciente cuya historia clínica tiene alergias o condiciones sistémicas
- WHEN se renderiza su expediente con el badge de onboarding
- THEN el badge de advertencia clínica MUST seguir renderizándose como antes

### Requirement: Vinculación de Fase 2 para datos generales faltantes

Cuando falten datos generales del paciente (principalmente email), la derivación
de estado y el flujo MAY solicitar esos datos dentro de la misma conversación. La
escritura de los datos generales MUST realizarse sobre el registro del paciente y
MUST NOT tocar la historia clínica.

#### Scenario: Falta el email y se solicita en el mismo flujo

- GIVEN un paciente al que le falta el email
- WHEN el flujo atiende al paciente
- THEN el sistema MAY solicitar el email dentro de la misma conversación

#### Scenario: El email se escribe solo en el registro del paciente

- GIVEN un paciente que proporciona su email faltante
- WHEN el sistema persiste el dato
- THEN el email MUST escribirse en el registro del paciente
- AND el sistema MUST NOT modificar la historia clínica

## Notes

- El estado de onboarding es un estado derivado; no introduce un campo propio de
  estado.
- El nudge es aditivo y aguas abajo del recordatorio; no modifica la plantilla
  `recordatorio_cita` ni el cron ya entregado (#86).
- Anclas de implementación (solo referencia):
  `src/components/admin/patient-record/OnboardingStatusBadge.tsx`,
  `src/components/admin/patient-record/PatientRecordTabs.tsx`.
