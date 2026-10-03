# Delta for WCC Command Center

## ADDED Requirements

### Requirement: Indicador de citas sin confirmar en el tab Citas

El panel MUST mostrar en su tab de Citas un indicador de las citas sin confirmar
cuya vigencia cae dentro de la ventana configurada de horas alrededor de su
inicio.

#### Scenario: Hay citas sin confirmar

- GIVEN que existe al menos una cita sin confirmar dentro de la ventana configurada
- WHEN el staff abre el tab de Citas del panel
- THEN el panel MUST listar esas citas sin confirmar

#### Scenario: No hay citas sin confirmar

- GIVEN que no existe ninguna cita sin confirmar dentro de la ventana configurada
- WHEN el staff abre el tab de Citas del panel
- THEN el panel MUST mostrar un estado vacío claro

#### Scenario: Una cita confirmada deja de aparecer

- GIVEN una cita que aparecía como sin confirmar
- WHEN la cita pasa a estado confirmado
- THEN el panel MUST dejar de mostrarla en el indicador de citas sin confirmar

### Requirement: Estado de recordatorio por cita en el tab Citas

El tab de Citas MUST distinguir el estado de recordatorio de cada cita,
incluyendo cuándo se envió el recordatorio y cuándo una cita no tiene
recordatorio.

#### Scenario: Cita con recordatorio enviado

- GIVEN una cita con recordatorio de 24 a 36 horas antes ya enviado
- WHEN el staff revisa el tab de Citas
- THEN el panel MUST mostrar que se envió el recordatorio con su fecha

#### Scenario: Cita sin recordatorio

- GIVEN una cita sin ningún recordatorio enviado
- WHEN el staff revisa el tab de Citas
- THEN el panel MUST mostrar que la cita no tiene recordatorio
