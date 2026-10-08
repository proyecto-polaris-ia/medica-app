# Setup del canal Discord de Mora (issue #159)

Guía manual para crear y conectar la aplicación de Discord que expone a Mora
a los doctores del consultorio. Se hace una sola vez, tras el deploy que
incluye el servicio `eve-mora`.

## 1. Crear la aplicación y el bot

1. Entra a <https://discord.com/developers/applications> con la cuenta del
   consultorio y crea una **New Application** (nombre sugerido: `Mora`).
2. En **Bot**: copia el **token** (es el `DISCORD_BOT_TOKEN`). Activa
   **Requires OAuth2 Code Grant** NO; no necesita intents privilegiados para
   interactions HTTP.
3. En **General Information**: copia **Application ID**
   (`DISCORD_APPLICATION_ID`) y **Public Key** (`DISCORD_PUBLIC_KEY`).

## 2. Registrar el slash command

Con las credenciales del paso 1, registra el comando global (puede tardar
hasta 1 hora en aparecer):

```bash
curl -X PUT "https://discord.com/api/v10/applications/$DISCORD_APPLICATION_ID/commands" \
  -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"name":"mora","description":"Consulta saldos y cobranza con Mora","type":1,
    "options":[{"name":"message","description":"¿Qué necesitas? P. ej. ¿Cuánto debe Ana López?","type":3,"required":true}]}]'
```

La opción `message` (string, requerida) es la que Eve usa como prompt.

## 3. Interactions Endpoint URL

En **General Information → Interactions Endpoint URL**, configura:

```
https://<dominio-del-proyecto>/mora/eve/v1/discord
```

Discord hace un `PING` inicial; el canal de Eve lo responde si las
credenciales (`DISCORD_PUBLIC_KEY`) están bien configuradas en Vercel.
Verificación de firma: el canal valida la firma de Discord con la public key
antes de procesar.

## 4. Variables de entorno en Vercel (servicio `eve-mora`)

| Variable | Valor |
|---|---|
| `DISCORD_APPLICATION_ID` | Application ID del paso 1 |
| `DISCORD_BOT_TOKEN` | Token del bot del paso 1 |
| `DISCORD_PUBLIC_KEY` | Public Key del paso 1 |
| `MORA_DISCORD_DOCTOR_IDS` | User IDs de Discord autorizados, separados por coma (p. ej. `123456789012345678, 234567890123456789`) |

Para obtener un user ID: activa **Modo desarrollador** en Discord (Ajustes →
Avanzado), clic derecho sobre el usuario → **Copiar ID de usuario**.

> **Fail-closed**: si `MORA_DISCORD_DOCTOR_IDS` no está definida o está vacía,
> ningún usuario puede abrir sesión con Mora. Agrega IDs solo de doctores.

Las variables del modelo (`WHATSAPP_AGENT_LLM_*`) se comparten con Eva
(DeepSeek vía OpenCode-compatible); revísalas en el servicio `eve-eva` y
repítelas en `eve-mora`.

## 5. Instalar el bot en el servidor del consultorio

Genera la URL de invitación con el scope `applications.commands` + `bot`
( OAuth2 → URL Generator) e instálala en el servidor del consultorio. El bot
no necesita permisos de administrador; basta con enviar mensajes en el canal
donde se use `/mora`.

## 6. Validación

1. `/mora message:"¿Cuánto debe [paciente]?"` con el usuario de un doctor
   autorizado → Mora responde con el saldo de la BD.
2. Con un usuario NO autorizado → el comando se acepta pero no responde nada
   (no abre sesión; revisa los logs de `eve-mora` si dudas).
3. `find-patient` con un nombre ambiguo → Mora presenta candidatos y pide el
   teléfono registrado.
4. `register-payment-intent` → queda en `payment_intents` con
   `intent_source='discord'` y escala a un humano (visible en el WhatsApp
   Command Center).
5. Eva sigue respondiendo WhatsApp normal; si un paciente pregunta saldo, Eva
   escala a humano (ya no delega en Mora).

## Referencias

- Doc del canal: `node_modules/eve/docs/channels/discord.mdx`.
- Issue: [#159](https://github.com/proyecto-polaris-ia/medica-app/issues/159).
- Runbook: `docs/eve-runbook.md`.
