// @vitest-environment node
/**
 * Credential-free structural test for the Eve WhatsApp channel.
 *
 * The channel module deep-links `eve/channels/chat-sdk` and the `chat` package,
 * both of which use Node subpath `#` imports that the Vitest/Vite resolver does
 * not externalize the same way the real Eve runtime does. Rather than dynamic-
 * import through Vite, we assert the channel's source shape (bridge export and
 * both handlers), mirroring the defensive branch in `tests/agent/setup.test.ts`.
 * The real runtime resolution is still exercised by `npx tsc --noEmit`.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const CHANNEL_FILE = resolve(__dirname, "../../../agent/channels/whatsapp.ts");

describe("Eve WhatsApp channel", () => {
  it("declares a chatSdkChannel bridge and both message handlers", () => {
    expect(existsSync(CHANNEL_FILE), "agent/channels/whatsapp.ts must exist").toBe(true);
    const source = readFileSync(CHANNEL_FILE, "utf-8");

    expect(source.includes("chatSdkChannel")).toBe(true);
    expect(source).toMatch(/export\s+const\s*\{\s*bot,\s*channel,\s*send\s*\}/);
    // Eve resolves an authored channel by its default export.
    expect(source).toMatch(/export\s+default\s+channel/);
    expect(source.includes("onNewMention")).toBe(true);
    expect(source.includes("onSubscribedMessage")).toBe(true);
    expect(source.includes("createWhatsAppAdapter")).toBe(true);
    expect(source.includes("streaming")).toBe(true);
  });

  it("degrades gracefully by gating the adapter behind complete credentials", () => {
    const source = readFileSync(CHANNEL_FILE, "utf-8");

    // The build must not throw without credentials, so the adapter creation is
    // guarded behind a completeness check over all four WHATSAPP_* variables.
    expect(source.includes("WHATSAPP_ACCESS_TOKEN")).toBe(true);
    expect(source.includes("WHATSAPP_APP_SECRET")).toBe(true);
    expect(source.includes("WHATSAPP_PHONE_NUMBER_ID")).toBe(true);
    expect(source.includes("WHATSAPP_VERIFY_TOKEN")).toBe(true);
    expect(source.includes("hasWhatsAppCredentials")).toBe(true);
  });

  it("does not hardcode credentials", () => {
    const source = readFileSync(CHANNEL_FILE, "utf-8");
    expect(source).not.toMatch(/\b(EAA[A-Za-z0-9]{10,}|sk-[A-Za-z0-9]{20,})\b/);
  });
});
