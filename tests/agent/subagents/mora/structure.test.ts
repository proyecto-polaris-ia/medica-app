// @vitest-environment node
/**
 * Structural checks for the separated Mora agent surface (issue #140, fase 1).
 *
 * The collections agent lives at `agent/subagents/mora/` with its own
 * instructions, the three collections tools, and the payment-collection skill.
 * Eva's surface must no longer carry any of them; she delegates instead.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");
const MORA_DIR = resolve(ROOT, "agent/subagents/mora");
const MORA_TOOLS_DIR = resolve(MORA_DIR, "tools");
const MORA_SKILLS_DIR = resolve(MORA_DIR, "skills");
const EVA_TOOLS_DIR = resolve(ROOT, "agent/tools");
const EVA_INSTRUCTIONS = resolve(ROOT, "agent/instructions.md");

const COLLECTIONS_TOOLS = [
  "get-patient-balance",
  "list-overdue-balances",
  "register-payment-intent",
] as const;

const BOOKING_LIKE = /(book|availability|reschedule|appointment|next-available|resolve-patient|catalog|knowledge|reminder)/i;

function read(path: string): string {
  expect(existsSync(path), `${path} must exist`).toBe(true);
  return readFileSync(path, "utf-8");
}

function toolFiles(dir: string): string[] {
  return readdirSync(dir).filter((name) => name.endsWith(".ts"));
}

describe("Mora subagent surface", () => {
  it("declares the subagent config and instructions", () => {
    const agentSource = read(resolve(MORA_DIR, "agent.ts"));
    expect(agentSource).toContain("defineAgent");
    expect(agentSource).toContain("description");
    // Channels and schedules are root-only; Mora must not declare them.
    expect(agentSource).not.toContain("channels/");

    read(resolve(MORA_DIR, "instructions.md"));
  });

  it("owns exactly the three collections tools plus the payment-collection skill", () => {
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

  it("leaves no collections tool in Eva's tool directory", () => {
    const evaTools = toolFiles(EVA_TOOLS_DIR);
    for (const tool of COLLECTIONS_TOOLS) {
      expect(evaTools, `agent/tools must not contain ${tool}.ts`).not.toContain(`${tool}.ts`);
    }
  });
});

describe("Eva front door after extraction", () => {
  it("contains the delegation section and no collections guardrails", () => {
    const text = read(EVA_INSTRUCTIONS).toLowerCase();

    expect(text).toContain("delegación a mora");
    expect(text).toContain("mora");
    expect(text).toContain("subagente `mora`");

    for (const removed of [
      "get-patient-balance",
      "list-overdue-balances",
      "register-payment-intent",
      "payment-collection.md",
      "no negoci",
      "no muev",
      "stripe",
      "listaccountsreceivable",
    ]) {
      expect(text.includes(removed), `Eva must not declare collections detail: ${removed}`).toBe(false);
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
      "contacto verificado",
      "solo del propio paciente",
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
      "contacto verificado",
    ]) {
      expect(text.includes(guardrail), `payment-collection.md must reference: ${guardrail}`).toBe(true);
    }
  });
});
