# Setup del canal Discord de Nora (issue #162)

Guía manual para crear y conectar la aplicación de Discord que expone a Nora
—la analista de métricas del consultorio— a los doctores autorizados. Se hace
una sola vez, tras el deploy que incluye el servicio `eve-nora`.

La app de Nora es **independiente** de las de Mora y Clara: no comparte bot,
token ni public key, porque cada agente raíz valida su propia allowlist y debe
poder iniciar sesiones por separado.

## 1. Crear la aplicación y el bot

1. Entra a <https://discord.com/developers/applications> con la cuenta del
   consultorio y crea una **New Application** (nombre sugerido: `Nora`).
2. En **Bot**: copia el **token** (es el `DISCORD_BOT_TOKEN`). No necesita
   intents privilegiados para interactions HTTP.
3. En **General Information**: copia **Application ID**
   (`DISCORD_APPLICATION_ID`) y **Public Key** (`DISCORD_PUBLIC_KEY`).

## 2. Registrar el slash command

Con las credenciales del paso 1, registra el comando global (puede tardar
hasta 1 hora en aparecer):

```bash
curl -X PUT "https://discord.com/api/v10/applications/$DISCORD_APPLICATION_ID/commands" \
  -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"name":"nora","description":"Consulta métricas del consultorio con Nora","type":1,
    "options":[{"name":"message","description":"¿Qué necesitas? P. ej. ¿cómo va la ocupación esta semana?","type":3,"required":true}]}]'
```

La opción `message` (string, requerida) es la que Eve usa como prompt.

## 3. Interactions Endpoint URL

En **General Information → Interactions Endpoint URL**, configura:

```
https://<dominio-del-proyecto>/nora/eve/v1/discord
```

Discord hace un `PING` inicial; el canal de Eve lo responde si
`DISCORD_PUBLIC_KEY` está bien configurada en el servicio `eve-nora`.
Verificación de firma: el canal valida la firma de Discord con la public key
antes de procesar.

## 4. Variables de entorno en Vercel (servicio `eve-nora`)

| Variable | Valor |
|---|---|
| `DISCORD_APPLICATION_ID` | Application ID del paso 1 |
| `DISCORD_BOT_TOKEN` | Token del bot del paso 1 |
| `DISCORD_PUBLIC_KEY` | Public Key del paso 1 |
| `NORA_DISCORD_DOCTOR_IDS` | User IDs de Discord de los doctores autorizados, separados por coma (p. ej. `111222333444555666,234567890123456789`) |
| `WHATSAPP_AGENT_LLM_API_KEY` / `WHATSAPP_AGENT_LLM_MODEL` / `WHATSAPP_AGENT_LLM_BASE_URL` | Modelo compartido con Eva (DeepSeek vía OpenCode-compatible); repítelas desde `eve-eva` |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Acceso a Supabase con service role (las tools leen métricas con el mismo camino que el panel) |

Para obtener un user ID: activa **Modo desarrollador** en Discord (Ajustes →
Avanzado), clic derecho sobre el usuario → **Copiar ID de usuario**.

> **Fail-closed**: si `NORA_DISCORD_DOCTOR_IDS` no está definida o está vacía,
> ningún usuario puede abrir sesión con Nora. Agrega IDs solo de doctores
> autorizados.

## 5. Instalar el bot en el servidor del consultorio

Genera la URL de invitación con los scopes `applications.commands` + `bot`
(OAuth2 → URL Generator) e instálala en el servidor del consultorio. El bot no
necesita permisos de administrador; basta con enviar mensajes en el canal donde
se use `/nora`.

## 6. Validación

1. `/nora message:"¿cómo va la ocupación esta semana?"` con el usuario de un
   doctor autorizado → Nora responde con las métricas de la BD (mismos números
   que el panel para el mismo rango).
2. Con un usuario **no** autorizado → el comando se acepta pero no responde
   nada (no abre sesión; revisa los logs de `eve-nora` si dudas).
3. Un rango sin citas → Nora reporta un estado vacío explícito, sin cifras
   inventadas.
4. Un proveedor inexistente → Nora responde que no encontró datos de ese
   proveedor, sin devolver métricas ajenas.
5. Confirmar que Eva (WhatsApp), Mora y Clara (Discord) siguen respondiendo
   igual.

## Nota de alcance

Nora es de **solo lectura** y de **doctores**: no reprograma, no cancela, no
escribe en Supabase, no envía WhatsApps y no atiende pacientes. Su salida es
texto en el canal de Discord del consultorio; los reacomodos de agenda viven en
el panel administrativo.

## Referencias

- Doc del canal: `node_modules/eve/docs/channels/discord.mdx`.
- Issue: [#162](https://github.com/proyecto-polaris-ia/medica-app/issues/162).
- Setup equivalente de Mora: `docs/mora-discord-setup.md`.
- Setup equivalente de Clara: `docs/clara-discord-setup.md`.
- Runbook: `docs/eve-runbook.md`.
