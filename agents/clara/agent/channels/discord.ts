import { discordChannel } from "eve/channels/discord";

import { resolveClaraAccess } from "../access";

/**
 * Resolve a credential from the environment, falling back to a non-empty
 * placeholder when it is absent. `eve` derives the channel's webhook route
 * from the `discordChannel` call, so the channel MUST always be constructed —
 * a channel with zero routes fails eve's build-time validation. The Discord
 * adapter rejects interactions with invalid credentials at runtime, so
 * credential-less builds (e.g. Vercel preview) still register the route while
 * degrading gracefully, mirroring Mora's channel.
 */
type DiscordCredentialKey =
  | "DISCORD_APPLICATION_ID"
  | "DISCORD_BOT_TOKEN"
  | "DISCORD_PUBLIC_KEY";

const credential = (key: DiscordCredentialKey): string =>
  process.env[key] || "unconfigured";

export type ClaraDiscordCommandResult =
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
 * Inbound command gate for Clara's Discord channel (issue #161, Fase 4).
 *
 * Staff administrativo y doctores autorizados hablan con Clara por el comando
 * `/clara`. La allowlist (`CLARA_DISCORD_STAFF_IDS`, Discord user IDs) se
 * aplica dos veces: aquí (un usuario no autorizado nunca abre sesión) y otra
 * vez dentro de cada tool vía `resolveClaraAccess` (defensa en profundidad).
 *
 * Exportado para test; el canal lo conecta como `onCommand`.
 */
export function handleClaraDiscordCommand(interaction: {
  user: { id: string };
  channelId?: string;
  guildId?: string;
}): ClaraDiscordCommandResult {
  const access = resolveClaraAccess({
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
    title: "Clara · seguimiento",
    auth: {
      principalId: access.discordId,
      principalType: "user",
      authenticator: "discord",
      attributes: {
        staff_discord_id: access.discordId,
        channel_id: interaction.channelId ?? "",
        guild_id: interaction.guildId ?? "",
      },
    },
  };
}

/**
 * Discord channel de Clara, el agente de seguimiento del consultorio. App de
 * Discord propia e independiente (sin compartir bot, token ni llave pública):
 * ruta `POST /clara/eve/v1/discord` (prefijo del workspace + ruta por defecto
 * de eve).
 */
export default discordChannel({
  credentials: {
    applicationId: credential("DISCORD_APPLICATION_ID"),
    botToken: credential("DISCORD_BOT_TOKEN"),
    publicKey: credential("DISCORD_PUBLIC_KEY"),
  },
  onCommand: (_ctx, interaction) => handleClaraDiscordCommand(interaction),
});
