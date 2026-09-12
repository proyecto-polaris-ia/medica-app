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
    expect(source.includes("buildTrustedContactSendPayload")).toBe(true);
    expect(source.includes("buildTrustedContactAuth")).toBe(true);
    expect(source).toMatch(/send\(buildTrustedContactSendPayload\(message\)/);
  });

  it("always constructs the adapter with credential fallbacks so the route stays registered", () => {
    const source = readFileSync(CHANNEL_FILE, "utf-8");

    // Eve derives the webhook route from the adapter keys, so the WhatsApp
    // adapter must always be constructed (never fully omitted). Credentials are
    // resolved with a placeholder fallback so the adapter factory, which throws
    // on missing values, does not throw in credential-less builds.
    expect(source.includes("WHATSAPP_ACCESS_TOKEN")).toBe(true);
    expect(source.includes("WHATSAPP_APP_SECRET")).toBe(true);
    expect(source.includes("WHATSAPP_PHONE_NUMBER_ID")).toBe(true);
    expect(source.includes("WHATSAPP_VERIFY_TOKEN")).toBe(true);
    expect(source.includes("credential")).toBe(true);
    expect(source).toMatch(/createWhatsAppAdapter\(\{/);
  });

  it("does not hardcode credentials", () => {
    const source = readFileSync(CHANNEL_FILE, "utf-8");
    expect(source).not.toMatch(/\b(EAA[A-Za-z0-9]{10,}|sk-[A-Za-z0-9]{20,})\b/);
  });
});


describe("trusted WhatsApp contact context", () => {
  it("formats sender phone and business number as channel-owned context", async () => {
    const mod = await import("../../../agent/trusted-contact-context");

    const payload = mod.buildTrustedContactSendPayload({
      text: "quiero agendar",
      author: { userId: "527224999206" },
      raw: { phoneNumberId: "1203450929527847" },
    });

    expect(typeof payload).toBe("object");
    if (typeof payload === "string") throw new Error("expected trusted contact payload");
    expect(payload).toEqual({
      message: "quiero agendar",
      context: [expect.stringContaining("trusted_channel_contact")],
    });
    expect(payload.context[0]).toContain("source=whatsapp");
    expect(payload.context[0]).toContain("patientPhone=+527224999206");
    expect(payload.context[0]).toContain("businessPhoneNumberId=1203450929527847");

    expect(mod.buildTrustedContactAuth({
      text: "quiero agendar",
      author: { userId: "527224999206" },
      raw: { phoneNumberId: "1203450929527847" },
    })).toMatchObject({
      attributes: {
        trustedContactSource: "whatsapp",
        trustedPatientPhone: "+527224999206",
        businessPhoneNumberId: "1203450929527847",
      },
      principalId: "+527224999206",
      principalType: "whatsapp_contact",
    });
  });
});
