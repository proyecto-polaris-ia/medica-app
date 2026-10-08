// @vitest-environment node
/**
 * Pruebas unitarias del gate de comando del canal Discord de Nora (issue #162,
 * Fase 5).
 *
 * Guardrail ("Autorización fail-closed por allowlist de doctores"):
 *   - Un doctor de la allowlist despacha con principal de Discord y los
 *     atributos `doctor_discord_id`, `channel_id` y `guild_id`.
 *   - Un usuario no autorizado (o una allowlist sin configurar) se descarta
 *     con `null`: no arranca ninguna sesión.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const { handleNoraDiscordCommand } = await import(
  "../../../../agents/nora/agent/channels/discord"
);

const onCommand = handleNoraDiscordCommand;

type Interaction = {
  user: { id: string };
  channelId?: string;
  guildId?: string;
};

const DOCTOR_DISCORD_ID = "111222333444555666";

function interaction(userId: string): Interaction {
  return { user: { id: userId }, channelId: "chan-1", guildId: "guild-1" };
}

describe("nora discord channel onCommand", () => {
  beforeEach(() => {
    process.env.NORA_DISCORD_DOCTOR_IDS = DOCTOR_DISCORD_ID;
  });

  afterEach(() => {
    delete process.env.NORA_DISCORD_DOCTOR_IDS;
  });

  it("dispatches an authorized doctor with a Discord principal", () => {
    const result = onCommand(interaction(DOCTOR_DISCORD_ID)) as {
      auth?: {
        principalId: string;
        authenticator: string;
        attributes: Record<string, string>;
      };
      title?: string;
    } | null;

    expect(result).not.toBeNull();
    expect(result?.auth).toMatchObject({
      principalId: DOCTOR_DISCORD_ID,
      authenticator: "discord",
      attributes: {
        doctor_discord_id: DOCTOR_DISCORD_ID,
        channel_id: "chan-1",
        guild_id: "guild-1",
      },
    });
    expect(typeof result?.title).toBe("string");
  });

  it("fills empty channel_id and guild_id when Discord omits them", () => {
    const result = onCommand({ user: { id: DOCTOR_DISCORD_ID } }) as {
      auth?: { attributes: Record<string, string> };
    } | null;

    expect(result?.auth?.attributes).toEqual({
      doctor_discord_id: DOCTOR_DISCORD_ID,
      channel_id: "",
      guild_id: "",
    });
  });

  it("drops an unauthorized Discord user", () => {
    expect(onCommand(interaction("000000000000000000"))).toBeNull();
  });

  it("fails closed when the allowlist is not configured", () => {
    delete process.env.NORA_DISCORD_DOCTOR_IDS;
    expect(onCommand(interaction(DOCTOR_DISCORD_ID))).toBeNull();
  });
});
