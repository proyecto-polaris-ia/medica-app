# Capability nora-discord-channel (issue #162, Fase 5)

Capability nueva: canal Discord propio del agente raíz Nora. Los actores son
**doctores autorizados** por allowlist de variables de entorno, fail-closed. El
canal valida la identidad de Discord y entrega a la sesión los atributos del
principal; cada tool revalida (defensa en profundidad, patrón mora/clara).

## ADDED Requirements

### Requirement: Canal Discord de Nora

El sistema MUST registrar un canal Discord para el agente raíz Nora que reciba
interacciones en la ruta `POST /nora/eve/v1/discord` y exponga el slash command
`/nora`. El canal MUST construirse siempre (aun sin credenciales configuradas)
de modo que `eve build` nunca se rompa, y MUST degradar a un estado
"unconfigured" explícito cuando falten credenciales.

#### Scenario: Ruta del canal

- GIVEN el workspace con Nora habilitada
- WHEN se despliega el servicio de Nora
- THEN el endpoint MUST responder en `/nora/eve/v1/discord`
- AND MUST NOT interferir con las rutas de eva, mora ni clara

#### Scenario: Build sin credenciales

- GIVEN un entorno sin credenciales de Discord de Nora
- WHEN se ejecuta `eve build`
- THEN el build MUST pasar
- AND el canal MUST quedar en estado unconfigured sin rutas faltantes

### Requirement: Autorización fail-closed por allowlist de doctores

El canal MUST autorizar solo a los usuarios de Discord listados en
`NORA_DISCORD_DOCTOR_IDS`. Si la variable está ausente o vacía, el acceso MUST
quedar denegado para todos. Cada sesión MUST llevar los atributos
`doctor_discord_id`, `channel_id` y `guild_id` del principal autorizado.

#### Scenario: Doctor en la allowlist

- GIVEN un usuario de Discord cuyo ID está en `NORA_DISCORD_DOCTOR_IDS`
- WHEN invoca `/nora` o escribe al bot
- THEN la sesión MUST autorizarse con su identidad de Discord
- AND las tools de métricas MUST estar disponibles

#### Scenario: Usuario fuera de la allowlist

- GIVEN un usuario de Discord cuyo ID no está en `NORA_DISCORD_DOCTOR_IDS`
- WHEN invoca `/nora`
- THEN el acceso MUST denegarse con un mensaje de refusal en español
- AND MUST NOT consultarse la base de datos ni exponerse datos

#### Scenario: Allowlist ausente o vacía

- GIVEN `NORA_DISCORD_DOCTOR_IDS` ausente o vacía en el entorno
- WHEN cualquier usuario invoca `/nora`
- THEN el acceso MUST denegarse para todos, incluidos administradores
