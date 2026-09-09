// @vitest-environment node
/**
 * Credential-free structural checks for the Eve stage-4 skills.
 *
 * Asserts the three skill files exist under agent/skills/ with their defining
 * markers, and that agent/instructions.md references them while preserving the
 * existing clinical guardrails. No env vars and no server are required.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const SKILLS_DIR = resolve(__dirname, "../../agent/skills");
const INSTRUCTIONS_FILE = resolve(__dirname, "../../agent/instructions.md");

function read(rel: string): string {
  const p = resolve(SKILLS_DIR, rel);
  expect(existsSync(p), `${rel} must exist`).toBe(true);
  return readFileSync(p, "utf-8");
}

describe("Eve stage-4 skills", () => {
  it("creates the booking-flow skill with ordered tool guidance", () => {
    const text = read("booking-flow.md").toLowerCase();

    for (const marker of ["check-availability", "book-appointment", "get-next-available", "reschedule-appointment"]) {
      expect(text.includes(marker), `booking-flow.md must reference ${marker}`).toBe(true);
    }
    for (const marker of ["paso 1", "paso 2", "inventes horarios", "reprogramación"]) {
      expect(text.includes(marker), `booking-flow.md must include ${marker}`).toBe(true);
    }
  });

  it("creates the clinical-escalation skill with triggers and a no-advice rule", () => {
    const text = read("clinical-escalation.md").toLowerCase();

    for (const trigger of ["dolor fuerte", "hinchazón", "sangrado", "infección", "trauma", "alergia"]) {
      expect(text.includes(trigger), `clinical-escalation.md must list ${trigger}`).toBe(true);
    }
    expect(text.includes("no diagnostiques")).toBe(true);
    expect(text.includes("no intentes dar consejos clínicos")).toBe(true);
  });

  it("creates the knowledge-answers skill guiding search-knowledge usage", () => {
    const text = read("knowledge-answers.md").toLowerCase();

    expect(text.includes("search-knowledge")).toBe(true);
    expect(text.includes("no inventes")).toBe(true);
  });

  it("updates instructions to reference the three skills and preserve guardrails", () => {
    expect(existsSync(INSTRUCTIONS_FILE), "agent/instructions.md must exist").toBe(true);
    const text = readFileSync(INSTRUCTIONS_FILE, "utf-8").toLowerCase();

    for (const skill of ["booking-flow.md", "clinical-escalation.md", "knowledge-answers.md"]) {
      expect(text.includes(skill), `instructions.md must reference ${skill}`).toBe(true);
    }

    const guardrails = ["no diagnostic", "no recet", "no invent", "precio", "humano"];
    for (const needle of guardrails) {
      expect(text.includes(needle), `instructions.md must preserve guardrail: ${needle}`).toBe(true);
    }
  });
});
