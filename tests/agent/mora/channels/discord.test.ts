// @vitest-environment node
/**
 * Unit tests for Mora's Discord channel command gate (issue #159).
 *
 * Guardrail ("Authorized Doctor Access via Discord"):
 *   - An allowlisted Discord user dispatches with a Discord principal.
 *   - An unauthorized user (or an unconfigured allowlist) is dropped with
 *     `null` — no session starts.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const { handleMoraDiscordCommand } = await import(
  "../../../../../agents/mora/agent/channels/discord"
);

const onCommand = handleMoraDiscordCommand;

const DOCTOR_DISCORD_ID = "111222333444555666";

function interaction(userId: string): Interaction {
  return { user: { id: userId }, channelId: "chan-1", guildId: "guild-1" };
}

describe("mora discord channel onCommand", () => {
  beforeEach(() => {
    process.env.MORA_DISCORD_DOCTOR_IDS = DOCTOR_DISCORD_ID;
  });

  afterEach(() => {
    delete process.env.MORA_DISCORD_DOCTOR_IDS;
  });

  it("dispatches an authorized doctor with a Discord principal", () => {
    const result = onCommand(interaction(DOCTOR_DISCORD_ID)) as {
      auth?: { principalId: string; authenticator: string };
      title?: string;
    } | null;

    expect(result).not.toBeNull();
    expect(result?.auth).toMatchObject({
      principalId: DOCTOR_DISCORD_ID,
      authenticator: "discord",
    });
    expect(typeof result?.title).toBe("string");
  });

  it("drops an unauthorized Discord user", () => {
    expect(onCommand(interaction("000000000000000000"))).toBeNull();
  });

  it("fails closed when the allowlist is not configured", () => {
    delete process.env.MORA_DISCORD_DOCTOR_IDS;
    expect(onCommand(interaction(DOCTOR_DISCORD_ID))).toBeNull();
  });
});
