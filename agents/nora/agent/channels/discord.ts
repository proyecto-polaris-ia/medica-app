import { discordChannel } from "eve/channels/discord";

import { resolveDoctorAccess } from "../access";

/**
 * Resuelve una credencial del entorno y cae a un placeholder no vacío cuando
 * falta. `eve` deriva la ruta del webhook del canal de la llamada a
 * `discordChannel`, así que el canal SIEMPRE debe construirse: un canal sin
 * rutas rompe la validación de `eve build`. El adaptador de Discord rechaza
 * las interacciones con credenciales inválidas en runtime, de modo que un
 * build sin credenciales (por ejemplo, un preview de Vercel) registra la ruta
 * y degrada de forma explícita a "unconfigured", igual que el canal WhatsApp
 * de Eva.
 */
type DiscordCredentialKey =
  | "DISCORD_APPLICATION_ID"
  | "DISCORD_BOT_TOKEN"
  | "DISCORD_PUBLIC_KEY";

const credential = (key: DiscordCredentialKey): string =>
  process.env[key] || "unconfigured";

export type NoraDiscordCommandResult =
  | {
      title: string;
      auth: {
        principalId: string;
        principalType: "user";
        authenticator: "discord";
        attributes: Record<string, string>;
      };
    }
  | null;

/**
 * Gate del comando entrante del canal Discord de Nora (issue #162, Fase 5).
 *
 * Los doctores hablan con Nora directamente por el slash command registrado.
 * La allowlist de doctores (`NORA_DISCORD_DOCTOR_IDS`, IDs de usuario de
 * Discord) se aplica dos veces: aquí (un usuario no autorizado nunca arranca
 * sesión) y de nuevo dentro de cada tool vía `requireDoctor` (defensa en
 * profundidad).
 *
 * Exportado para test; el canal lo cablea como `onCommand`.
 */
export function handleNoraDiscordCommand(
  interaction: { user: { id: string }; channelId?: string; guildId?: string },
): NoraDiscordCommandResult {
  const access = resolveDoctorAccess({
    session: {
      auth: {
        current: {
          principalId: interaction.user.id,
          principalType: "user",
          authenticator: "discord",
        },
      },
    },
  });

  if ("error" in access) {
    return null;
  }

  return {
    title: "Nora · métricas",
    auth: {
      principalId: interaction.user.id,
      principalType: "user",
      authenticator: "discord",
      attributes: {
        doctor_discord_id: interaction.user.id,
        channel_id: interaction.channelId ?? "",
        guild_id: interaction.guildId ?? "",
      },
    },
  };
}

/**
 * Canal Discord de Nora, la agente raíz de métricas del consultorio. Ruta:
 * `POST /nora/eve/v1/discord` (prefijo del workspace + ruta por defecto de
 * eve). Slash command: `/nora`.
 */
export default discordChannel({
  credentials: {
    applicationId: credential("DISCORD_APPLICATION_ID"),
    botToken: credential("DISCORD_BOT_TOKEN"),
    publicKey: credential("DISCORD_PUBLIC_KEY"),
  },
  onCommand: (_ctx, interaction) => handleNoraDiscordCommand(interaction),
});
