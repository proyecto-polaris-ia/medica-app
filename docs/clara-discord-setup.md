# Setup del canal Discord de Clara (issue #161)

Guía manual para crear y conectar la aplicación de Discord que expone a Clara
—el agente de seguimiento de pacientes— al staff administrativo y a los
doctores autorizados del consultorio. Se hace una sola vez, tras el deploy que
incluye el servicio `eve-clara`.

La app de Clara es **independiente** de la de Mora: no comparte bot, token ni
public key, porque cada agente raíz valida su propia allowlist y debe poder
iniciar sesiones por separado.

## 1. Crear la aplicación y el bot

1. Entra a <https://discord.com/developers/applications> con la cuenta del
   consultorio y crea una **New Application** (nombre sugerido: `Clara`).
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
  -d '[{"name":"clara","description":"Seguimiento de pacientes con Clara","type":1,
    "options":[{"name":"message","description":"¿Qué necesitas? P. ej. muéstrame la lista de seguimiento de hoy","type":3,"required":true}]}]'
```

La opción `message` (string, requerida) es la que Eve usa como prompt.

## 3. Interactions Endpoint URL

En **General Information → Interactions Endpoint URL**, configura:

```
https://<dominio-del-proyecto>/clara/eve/v1/discord
```

Discord hace un `PING` inicial; el canal de Eve lo responde si
`DISCORD_PUBLIC_KEY` está bien configurada en el servicio `eve-clara`.
Verificación de firma: el canal valida la firma de Discord con la public key
antes de procesar.

## 4. Variables de entorno en Vercel (servicio `eve-clara`)

| Variable | Valor |
|---|---|
| `DISCORD_APPLICATION_ID` | Application ID del paso 1 |
| `DISCORD_BOT_TOKEN` | Token del bot del paso 1 |
| `DISCORD_PUBLIC_KEY` | Public Key del paso 1 |
| `CLARA_DISCORD_STAFF_IDS` | User IDs de Discord autorizados (staff y doctores), separados por coma (p. ej. `111222333444555666,234567890123456789`) |
| `CLARA_DISCORD_ACTOR_MAP` | Pares `<user-id>=<uuid-de-supabase>` separados por coma, para atribuir las escrituras (auditoría) |
| `WHATSAPP_AGENT_LLM_API_KEY` / `WHATSAPP_AGENT_LLM_MODEL` / `WHATSAPP_AGENT_LLM_BASE_URL` | Modelo compartido con Eva (DeepSeek vía OpenCode-compatible); repítelas desde `eve-eva` |
| `CLARA_DRAFTING_ENABLED` | `false` (o vacía) fuerza la plantilla determinista; `true` habilita la redacción por LLM |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Acceso a Supabase con service role (las tools leen y escriben seguimiento) |

Para obtener un user ID: activa **Modo desarrollador** en Discord (Ajustes →
Avanzado), clic derecho sobre el usuario → **Copiar ID de usuario**.

> **Fail-closed**: si `CLARA_DISCORD_STAFF_IDS` no está definida o está vacía,
> ningún usuario puede abrir sesión con Clara. Agrega IDs solo de staff y
> doctores autorizados.
>
> La ausencia de `CLARA_DISCORD_ACTOR_MAP` **no** rompe el arranque: el canal
> abre sesión y las lecturas funcionan, pero las escrituras (borradores y
> marcas de contacto) se niegan con un mensaje propio hasta que exista el
> mapeo del user ID a un UUID de Supabase.

## 5. Instalar el bot en el servidor del consultorio

Genera la URL de invitación con los scopes `applications.commands` + `bot`
(OAuth2 → URL Generator) e instálala en el servidor del consultorio. El bot no
necesita permisos de administrador; basta con enviar mensajes en el canal donde
se use `/clara`.

## 6. Validación

Verificación manual post-deploy (§13.2 del design). Ejecútala fuera del repo,
como responsable del despliegue:

1. `/clara message:"muéstrame la lista de seguimiento de hoy"` con un usuario
   de la allowlist → Clara responde con la lista de la BD.
2. Con un usuario **no** autorizado → el comando se acepta pero no responde
   nada (no abre sesión; revisa los logs de `eve-clara` si dudas).
3. Pedir el borrador de un paciente de la lista → fila en
   `follow_up_message_drafts` con `created_by` = UUID del mapa; aprobarla →
   `status = approved` y **cero** filas nuevas en `whatsapp_messages` (ningún
   envío).
4. Marcar un caso como contactado → fila en `follow_up_contacts` con `status =
   contacted` y `created_by` = UUID del mapa; el paciente desaparece de la
   lista de la ronda.
5. Con `CLARA_DRAFTING_ENABLED` vacío → el borrador sigue saliendo (plantilla)
   y la lectura sigue funcionando.
6. Con `CLARA_DISCORD_STAFF_IDS` vacío → nadie abre sesión.
7. Confirmar que Eva (WhatsApp) y Mora (Discord) siguen respondiendo igual.

## Nota de alcance

Este canal es de **staff y doctores**, no de pacientes. Clara no atiende
pacientes, no atiende WhatsApp y no envía mensajes: su salida es texto en el
canal de Discord del consultorio. El envío del mensaje al paciente sigue siendo
una acción humana por el flujo de WhatsApp.

## Referencias

- Doc del canal: `node_modules/eve/docs/channels/discord.mdx`.
- Issue: [#161](https://github.com/proyecto-polaris-ia/medica-app/issues/161).
- Setup equivalente de Mora: `docs/mora-discord-setup.md`.
- Runbook: `docs/eve-runbook.md`.
