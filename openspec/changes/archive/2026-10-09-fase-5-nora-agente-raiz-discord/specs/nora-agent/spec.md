# Delta para nora-agent (issue #162, Fase 5)

Capability extendida: además de la sección de panel "agenda productiva" (#149),
Nora existe como agente raíz conversacional independiente. En esta fase su
superficie conversacional es de **solo lectura de métricas**: no reprograma
citas, no comunica por WhatsApp, no diagnostica, no cotiza. Sus operaciones de
lectura viven en la capability `nora-metrics-tools` y su canal entrante en
`nora-discord-channel`.

## ADDED Requirements

### Requirement: Agente raíz conversacional de Nora

El sistema MUST exponer a Nora como un agente raíz independiente de Eve, con su
propia definición de agente, su propio modelo y sus propias instrucciones. La
incorporación MUST ser aditiva: MUST NOT modificar el comportamiento de los
agentes raíz existentes (Eva, Mora y Clara) ni la sección de panel de Nora (#149).

#### Scenario: Nora existe como cuarto agente raíz

- GIVEN el workspace de agentes con Eva, Mora y Clara
- WHEN se inspecciona la topología de agentes raíz
- THEN Nora MUST existir como agente raíz propio con definición, modelo e instrucciones propios
- AND el workspace MUST reportar cuatro agentes raíz (eva, mora, clara, nora)

#### Scenario: Eva, Mora y Clara permanecen sin cambios

- GIVEN Eva, Mora y Clara funcionando antes de habilitar a Nora
- WHEN se habilita Nora
- THEN el comportamiento funcional de Eva, Mora y Clara MUST permanecer sin cambios

### Requirement: Superficie conversacional de solo lectura

Nora MUST exponer únicamente tools de lectura de métricas definidas en
`nora-metrics-tools`. Nora MUST NOT escribir en Supabase, MUST NOT reprogramar
o cancelar citas, MUST NOT enviar WhatsApps y MUST NOT diagnosticar, recetar o
cotizar. Toda disponibilidad y todo dato MUST provenir de la base de datos a
través del motor de métricas.

#### Scenario: Pregunta de métrica respondida con datos reales

- GIVEN un doctor autorizado que pregunta la ocupación de la semana
- WHEN Nora responde
- THEN la respuesta MUST derivar de datos del motor de métricas de la BD
- AND MUST NOT incluir valores inventados o estimados

#### Scenario: Solicitud de escritura rechazada

- GIVEN un doctor autorizado que pide mover o cancelar una cita
- WHEN Nora recibe la solicitud
- THEN MUST declinar y explicar que los reacomodos se hacen en el panel
- AND MUST NOT invocar ninguna tool de escritura (no existe tal tool)

#### Scenario: Consulta clínica escalada

- GIVEN cualquier consulta de diagnóstico, medicamento, receta o urgencia
- WHEN Nora recibe la solicitud
- THEN MUST escalar a humano según los guardrails del consultorio
- AND MUST NOT responder con orientación clínica

### Requirement: Toda aritmética proviene del motor de métricas

Las respuestas de Nora MUST usar el motor de `dashboard-metrics`
(`getDashboardMetrics` y sus componentes). Nora MUST NOT implementar una segunda
aritmética de ocupación, no-show ni conteos de status.

#### Scenario: Consistencia con el panel

- GIVEN un rango con citas y `business_hours`
- WHEN Nora reporta ocupación o tasa de no-show
- THEN los valores MUST coincidir con los que produce el motor para el mismo rango
- AND MUST NOT existir una segunda implementación de esos cálculos
