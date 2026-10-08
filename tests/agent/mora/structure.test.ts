// @vitest-environment node
/**
 * Structural checks for Mora as an independent root agent (issue #159, fase 2).
 *
 * The collections agent lives at `agents/mora/agent/` with its own channel
 * (Discord), instructions, the collections tools, and the payment-collection
 * skill. Eva must no longer carry any collections behavior nor a Mora
 * subagent: patients' WhatsApp collections intents escalate to a human.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const MORA_DIR = resolve(ROOT, "agents/mora/agent");
const MORA_TOOLS_DIR = resolve(MORA_DIR, "tools");
const MORA_SKILLS_DIR = resolve(MORA_DIR, "skills");
const MORA_CHANNELS_DIR = resolve(MORA_DIR, "channels");
const EVA_DIR = resolve(ROOT, "agents/eva/agent");
const EVA_INSTRUCTIONS = resolve(ROOT, "agents/eva/agent/instructions.md");

const COLLECTIONS_TOOLS = [
  "get-patient-balance",
  "list-overdue-balances",
  "register-payment-intent",
  "find-patient",
] as const;

const BOOKING_LIKE = /(book|availability|reschedule|appointment|next-available|resolve-patient|catalog|knowledge|reminder)/i;

function read(path: string): string {
  expect(existsSync(path), `${path} must exist`).toBe(true);
  return readFileSync(path, "utf-8");
}

function toolFiles(dir: string): string[] {
  return readdirSync(dir).filter((name) => name.endsWith(".ts"));
}

describe("Mora root agent surface", () => {
  it("declares the root agent config and instructions", () => {
    const agentSource = read(resolve(MORA_DIR, "agent.ts"));
    expect(agentSource).toContain("defineAgent");
    // Subagent-only description contract is gone with the promotion.
    expect(agentSource).not.toContain("Delega aquí");
    expect(agentSource).not.toContain("subagente");

    read(resolve(MORA_DIR, "instructions.md"));
    read(resolve(MORA_DIR, "model.ts"));
  });

  it("owns exactly the collections tools plus the payment-collection skill", () => {
    const tools = toolFiles(MORA_TOOLS_DIR);
    for (const tool of COLLECTIONS_TOOLS) {
      expect(tools, `mora/tools must contain ${tool}.ts`).toContain(`${tool}.ts`);
    }
    expect(existsSync(resolve(MORA_SKILLS_DIR, "payment-collection.md"))).toBe(true);
  });

  it("does not expose any booking, availability, or appointment tool", () => {
    for (const file of toolFiles(MORA_TOOLS_DIR)) {
      expect(BOOKING_LIKE.test(file), `mora must not expose booking tool ${file}`).toBe(false);
    }
  });

  it("declares its own Discord channel", () => {
    expect(existsSync(resolve(MORA_CHANNELS_DIR, "discord.ts"))).toBe(true);
    const channel = read(resolve(MORA_CHANNELS_DIR, "discord.ts"));
    expect(channel).toContain("discordChannel");
    expect(channel).toContain("onCommand");
  });

  it("leaves no collections tool in Eva's tool directory", () => {
    const evaTools = toolFiles(resolve(EVA_DIR, "tools"));
    for (const tool of COLLECTIONS_TOOLS) {
      expect(evaTools, `agents/eva/agent/tools must not contain ${tool}.ts`).not.toContain(`${tool}.ts`);
    }
  });

  it("leaves no Mora subagent behind", () => {
    expect(existsSync(resolve(EVA_DIR, "subagents"))).toBe(false);
  });
});

describe("Eva front door after the promotion", () => {
  it("no longer mentions delegating to Mora and escalates collections intents", () => {
    const text = read(EVA_INSTRUCTIONS).toLowerCase();

    expect(text.includes("delegación a mora")).toBe(false);
    expect(text.includes("subagente `mora`")).toBe(false);

    for (const needle of [
      "get-patient-balance",
      "list-overdue-balances",
      "register-payment-intent",
      "payment-collection.md",
      "listaccountsreceivable",
    ]) {
      expect(text.includes(needle), `Eva must not declare collections detail: ${needle}`).toBe(false);
    }
  });
});

describe("Mora instructions and skill keep the collections guardrails", () => {
  it("preserves the guardrails in Mora's own instructions", () => {
    const text = read(resolve(MORA_DIR, "instructions.md")).toLowerCase();

    for (const needle of [
      "no negocio",
      "no muevo dinero",
      "links de pago",
      "listaccountsreceivable",
      "doctores autorizados",
      "valoración",
    ]) {
      expect(text.includes(needle), `Mora instructions must preserve: ${needle}`).toBe(true);
    }
  });

  it("keeps the payment-collection skill with its tool routing and no-money guardrails", () => {
    const text = read(resolve(MORA_SKILLS_DIR, "payment-collection.md")).toLowerCase();

    for (const tool of COLLECTIONS_TOOLS) {
      expect(text.includes(tool), `payment-collection.md must reference ${tool}`).toBe(true);
    }
    for (const guardrail of [
      "no negoci",
      "descuento",
      "waiver",
      "links de pago",
      "stripe",
      "mercado pago",
      "saldo",
      "doctores autorizados",
    ]) {
      expect(text.includes(guardrail), `payment-collection.md must reference: ${guardrail}`).toBe(true);
    }
  });
});
