// @vitest-environment node
/**
 * Pruebas de la puerta de entrada del canal Discord de Clara (issue #161,
 * Fase 4).
 *
 * Guardrail (spec `clara-discord-channel` → "Allowlist fail-closed de staff y
 * doctores autorizados" y "Canal Discord propio con ruta y comando propios"):
 *   - Un usuario de la allowlist de Clara abre sesión con principal de Discord.
 *   - Un usuario no autorizado, o una allowlist ausente/vacía, se descarta con
 *     `null`: no se abre sesión ni se revela ningún dato.
 *   - La app de Discord de Clara es independiente: los IDs de la allowlist de
 *     Mora no autorizan a Clara ni comparten credenciales.
 *   - Clara no registra binding de WhatsApp.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const CLARA_CHANNELS_DIR = resolve(__dirname, "../../../../agents/clara/agent/channels");

const { default: claraChannel, handleClaraDiscordCommand } = await import(
  "../../../../agents/clara/agent/channels/discord"
);

type Interaction = {
  user: { id: string };
  channelId?: string;
  guildId?: string;
};

const STAFF_DISCORD_ID = "111222333444555666";
const MORA_DOCTOR_DISCORD_ID = "999888777666555444";

function interaction(userId: string): Interaction {
  return { user: { id: userId }, channelId: "chan-1", guildId: "guild-1" };
}

describe("Canal Discord de Clara", () => {
  beforeEach(() => {
    process.env.CLARA_DISCORD_STAFF_IDS = STAFF_DISCORD_ID;
  });

  afterEach(() => {
    delete process.env.CLARA_DISCORD_STAFF_IDS;
  });

  it("despacha a un usuario autorizado con principal de Discord", () => {
    const result = handleClaraDiscordCommand(interaction(STAFF_DISCORD_ID)) as {
      title?: string;
      auth?: {
        principalId: string;
        principalType: string;
        authenticator: string;
        attributes: Record<string, string>;
      };
    } | null;

    expect(result).not.toBeNull();
    expect(result?.title).toBe("Clara · seguimiento");
    expect(result?.auth).toMatchObject({
      principalId: STAFF_DISCORD_ID,
      principalType: "user",
      authenticator: "discord",
    });
    expect(result?.auth?.attributes).toMatchObject({
      staff_discord_id: STAFF_DISCORD_ID,
      channel_id: "chan-1",
      guild_id: "guild-1",
    });
  });

  it("descarta a un usuario fuera de la allowlist", () => {
    expect(handleClaraDiscordCommand(interaction("000000000000000000"))).toBeNull();
  });

  it("falla cerrado cuando la allowlist no está configurada", () => {
    delete process.env.CLARA_DISCORD_STAFF_IDS;
    expect(handleClaraDiscordCommand(interaction(STAFF_DISCORD_ID))).toBeNull();
  });

  it("falla cerrado cuando la allowlist está vacía o en blanco", () => {
    process.env.CLARA_DISCORD_STAFF_IDS = "  , , ";
    expect(handleClaraDiscordCommand(interaction(STAFF_DISCORD_ID))).toBeNull();
  });

  it("no autoriza con los IDs de la allowlist de Mora", () => {
    process.env.CLARA_DISCORD_STAFF_IDS = undefined;
    process.env.MORA_DISCORD_DOCTOR_IDS = MORA_DOCTOR_DISCORD_ID;
    try {
      expect(handleClaraDiscordCommand(interaction(MORA_DOCTOR_DISCORD_ID))).toBeNull();
    } finally {
      delete process.env.MORA_DISCORD_DOCTOR_IDS;
    }
  });

  it("no adopta las credenciales de Discord de Mora", () => {
    const source = readFileSync(resolve(CLARA_CHANNELS_DIR, "discord.ts"), "utf-8");
    for (const credential of [
      "DISCORD_APPLICATION_ID",
      "DISCORD_BOT_TOKEN",
      "DISCORD_PUBLIC_KEY",
    ]) {
      expect(source).toContain(credential);
    }
    expect(source).not.toContain("MORA_");
    expect(source).not.toContain("connectDiscordCredentials");
  });

  it("no registra binding de WhatsApp", () => {
    expect(existsSync(resolve(CLARA_CHANNELS_DIR, "whatsapp.ts"))).toBe(false);
    const source = readFileSync(resolve(CLARA_CHANNELS_DIR, "discord.ts"), "utf-8");
    expect(source).not.toContain("whatsappChannel");
  });

  it("construye el canal sin credenciales (degradación graceful del build)", () => {
    delete process.env.DISCORD_APPLICATION_ID;
    delete process.env.DISCORD_BOT_TOKEN;
    delete process.env.DISCORD_PUBLIC_KEY;
    expect(claraChannel).toBeDefined();
    // Sin credenciales el canal sigue despachando al principal autorizado; el
    // rechazo con credenciales inválidas ocurre en el adapter en runtime.
    expect(handleClaraDiscordCommand(interaction(STAFF_DISCORD_ID))).not.toBeNull();
  });

  it("normaliza espacios y mayúsculas del ID de Discord", () => {
    process.env.CLARA_DISCORD_STAFF_IDS = "AbC123";
    const result = handleClaraDiscordCommand(interaction("  abc123  ")) as {
      auth?: { principalId: string };
    } | null;

    expect(result).not.toBeNull();
    expect(result?.auth?.principalId).toBe("abc123");
  });

  it("acepta una allowlist compuesta por comas y espacios", () => {
    process.env.CLARA_DISCORD_STAFF_IDS = ` , ${MORA_DOCTOR_DISCORD_ID} , ${STAFF_DISCORD_ID} ,`;
    expect(handleClaraDiscordCommand(interaction(STAFF_DISCORD_ID))).not.toBeNull();
    expect(handleClaraDiscordCommand(interaction(MORA_DOCTOR_DISCORD_ID))).not.toBeNull();
  });
});
