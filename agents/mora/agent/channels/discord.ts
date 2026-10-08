import { discordChannel } from "eve/channels/discord";

import { resolveDoctorAccess } from "../access";

const DISCORD_CREDENTIAL_KEYS = [
  "DISCORD_APPLICATION_ID",
  "DISCORD_BOT_TOKEN",
  "DISCORD_PUBLIC_KEY",
] as const;

/**
 * Resolve a credential from the environment, falling back to a non-empty
 * placeholder when it is absent. `eve` derives the channel's webhook route
 * from the `discordChannel` call, so the channel MUST always be constructed —
 * a channel with zero routes fails eve's build-time validation. The Discord
 * adapter rejects interactions with invalid credentials at runtime, so
 * credential-less builds (e.g. Vercel preview) still register the route while
 * degrading gracefully, mirroring the WhatsApp channel of Eva.
 */
const credential = (key: (typeof DISCORD_CREDENTIAL_KEYS)[number]): string =>
  process.env[key] || "unconfigured";

export type MoraDiscordCommandResult =
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
 * Inbound command gate for Mora's Discord channel (issue #159).
 *
 * Doctors talk to Mora directly through the registered slash command. The
 * doctor allowlist (`MORA_DISCORD_DOCTOR_IDS`, Discord user IDs) is enforced
 * twice: here (unauthorized users never start a session) and again inside
 * every tool via `resolveDoctorAccess` (defense in depth).
 *
 * Exported for testing; the channel wires it as `onCommand`.
 */
export function handleMoraDiscordCommand(
  interaction: { user: { id: string }; channelId?: string; guildId?: string },
): MoraDiscordCommandResult {
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
    title: "Mora · cobranza",
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
 * Discord channel for Mora, the independent collections agent. Route:
 * `POST /mora/eve/v1/discord` (workspace prefix + eve default path).
 */
export default discordChannel({
  credentials: {
    applicationId: credential("DISCORD_APPLICATION_ID"),
    botToken: credential("DISCORD_BOT_TOKEN"),
    publicKey: credential("DISCORD_PUBLIC_KEY"),
  },
  onCommand: (_ctx, interaction) => handleMoraDiscordCommand(interaction),
});
