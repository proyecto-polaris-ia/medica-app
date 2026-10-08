# Delta para clara-discord-channel (issue #161, Fase 4)

Capability nueva: canal Discord propio de Clara, independiente del de Mora, con
credenciales de una aplicación de Discord propia y autorización fail-closed por
allowlist. Es la puerta de entrada de la superficie conversacional de Clara:
staff administrativo y doctores autorizados, nunca pacientes.

## ADDED Requirements

### Requirement: Canal Discord propio con ruta y comando propios

Clara MUST ser alcanzable como agente raíz a través de un canal Discord propio,
distinto e independiente del canal de Mora. El canal MUST registrar la ruta
`POST /clara/eve/v1/discord` y MUST responder al comando de barra `/clara`.

#### Scenario: La ruta del canal de Clara existe

- GIVEN el workspace de agentes compilado
- WHEN se inspeccionan las rutas del canal de Clara
- THEN MUST existir la ruta `POST /clara/eve/v1/discord`

#### Scenario: Un usuario autorizado abre una sesión con el comando

- GIVEN un usuario de Discord autorizado
- WHEN el usuario invoca el comando `/clara` con un mensaje
- THEN MUST iniciarse una sesión de Clara con identidad de principal de Discord
- AND Clara MUST responder a la solicitud

#### Scenario: El canal de Clara es independiente del de Mora

- GIVEN los canales Discord de Clara y de Mora
- WHEN se comparan sus aplicaciones y credenciales
- THEN MUST ser aplicaciones de Discord independientes
- AND MUST NOT compartir bot, token ni llave pública

### Requirement: Credenciales por entorno con degradación graceful

Las credenciales del canal de Clara MUST provenir de variables de entorno propias
de su aplicación de Discord. Su ausencia MUST NOT impedir la compilación del
workspace: el canal MUST registrar su ruta igualmente y MUST rechazar en tiempo de
ejecución las interacciones con credenciales inválidas. Clara MUST NOT usar las
credenciales de Mora como respaldo.

#### Scenario: Sin credenciales el build no falla

- GIVEN las credenciales de Discord de Clara ausentes
- WHEN se compila el workspace de agentes
- THEN la compilación MUST completar
- AND la ruta del canal de Clara MUST quedar registrada

#### Scenario: Una interacción sin credenciales válidas se rechaza

- GIVEN las credenciales de Discord de Clara ausentes o inválidas
- WHEN llega una interacción al canal
- THEN el canal MUST rechazarla
- AND MUST NOT iniciar ninguna sesión

#### Scenario: Clara no adopta las credenciales de Mora

- GIVEN las credenciales de Discord de Mora configuradas
- WHEN Clara no tiene credenciales propias configuradas
- THEN Clara MUST NOT usar las credenciales de Mora
- AND MUST permanecer degradada

### Requirement: Allowlist fail-closed de staff y doctores autorizados

Solo los usuarios de Discord cuyo ID esté presente en la allowlist configurada
(`CLARA_DISCORD_STAFF_IDS`) MUST poder iniciar sesiones con Clara. La allowlist
MUST cubrir tanto al staff administrativo como a los doctores autorizados. Un
usuario de Discord no autorizado MUST NOT iniciar ninguna sesión y MUST NOT
recibir ningún dato de pacientes. Sin allowlist configurada o con la allowlist
vacía, el canal MUST fallar cerrado.

#### Scenario: Un usuario autorizado inicia sesión

- GIVEN un usuario de Discord cuyo ID está en la allowlist de Clara
- WHEN el usuario invoca el comando `/clara`
- THEN MUST iniciarse una sesión de Clara con identidad de principal de Discord

#### Scenario: Un usuario no autorizado se rechaza

- GIVEN un usuario de Discord cuyo ID NO está en la allowlist de Clara
- WHEN el usuario invoca el comando `/clara`
- THEN MUST NOT iniciarse ninguna sesión
- AND MUST NOT revelarse ningún dato de pacientes

#### Scenario: Sin allowlist configurada el canal falla cerrado

- GIVEN la variable de allowlist de Clara ausente o vacía
- WHEN cualquier usuario de Discord invoca el comando `/clara`
- THEN MUST NOT iniciarse ninguna sesión
- AND MUST NOT revelarse ningún dato de pacientes

### Requirement: Re-verificación de autorización en cada tool

La autorización MUST re-verificarse dentro de cada tool a partir del principal
autenticado de la sesión, nunca a partir del texto del modelo ni de argumentos
proporcionados en la conversación. Una tool invocada sin un principal autorizado
MUST negarse sin leer ni escribir datos.

#### Scenario: La tool confirma la autorización desde el principal

- GIVEN una sesión con un principal de Discord autorizado
- WHEN una tool de Clara consulta datos de seguimiento
- THEN la tool MUST confirmar la autorización desde el principal de la sesión
- AND MUST proceder solo si el principal está autorizado

#### Scenario: Sin principal autorizado la tool se niega

- GIVEN una invocación sin un principal de Discord autorizado
- WHEN se ejecuta una tool de Clara
- THEN la tool MUST negarse
- AND MUST NOT leer ni escribir datos de pacientes

#### Scenario: El texto del modelo no otorga autorización

- GIVEN el texto de la conversación afirma que el usuario está autorizado
- WHEN se ejecuta una tool de Clara
- THEN la tool MUST ignorar ese texto
- AND MUST resolver la autorización únicamente desde el principal de la sesión

### Requirement: Superficie de staff, no canal de paciente

El canal Discord de Clara MUST ser una superficie de consulta y preparación para
staff administrativo y doctores autorizados. MUST NOT ser un canal
paciente-facing, MUST NOT aceptar mensajes de pacientes y MUST NOT usarse para
enviar comunicaciones a pacientes.

#### Scenario: El canal no acepta mensajes de pacientes

- GIVEN un usuario de Discord no autorizado que se identifica como paciente
- WHEN intenta usar el canal de Clara
- THEN MUST NOT iniciarse ninguna sesión
- AND MUST NOT procesarse su mensaje como una conversación de atención al paciente

#### Scenario: El canal no es un medio de envío

- GIVEN una sesión de Clara con staff autorizado
- WHEN el staff solicita preparar un borrador de seguimiento
- THEN el canal MUST limitarse a la consulta y la preparación
- AND MUST NOT emitir un mensaje hacia el paciente

### Requirement: Desactivación de la superficie conversacional sin cambios de código

La superficie conversacional de Clara MUST poder desactivarse por configuración:
vaciar la allowlist MUST deshabilitar todas las sesiones por fallo cerrado y
desinstalar el bot MUST bastar para detener la superficie. El kill switch
existente de redacción MUST conservar su alcance actual sobre el camino LLM y
MUST NOT ser el único mecanismo de desactivación de la superficie.

#### Scenario: Allowlist vacía deshabilita la superficie

- GIVEN la allowlist de Clara vacía
- WHEN cualquier usuario de Discord invoca el comando `/clara`
- THEN MUST NOT iniciarse ninguna sesión

#### Scenario: El kill switch de redacción no deshabilita la lectura

- GIVEN el kill switch de redacción en estado activo
- WHEN el staff autorizado solicita la lista de casos
- THEN la lectura de casos MUST seguir funcionando
- AND solo la redacción por LLM MUST degradar a la plantilla determinista
