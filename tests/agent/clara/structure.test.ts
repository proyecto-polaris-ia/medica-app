// @vitest-environment node
/**
 * Contrato estructural de Clara como agente raíz (issue #161, Fase 4).
 *
 * Clara vive en `agents/clara/agent/` con definición de agente, modelo, canal
 * Discord propio, instrucciones propias, 7 tools de seguimiento y 2 skills.
 * La incorporación es aditiva: las superficies de Eva y Mora no cambian.
 *
 * NOTA DE TDD (tasks.md 1.1): este archivo es el contrato estructural del
 * change completo, no un caso aislado del slice 1. Permanece ROJO en los puntos
 * que dependen de slices posteriores:
 *   - `instructions.md` (fase 5.2),
 *   - el set exacto de las 7 tools (fases 3 y 4),
 *   - las 2 skills (fase 5.3).
 * El resto (agent.ts, model.ts, canal, ausencia de package.json, ausencia de
 * subagents/) queda verde al cerrar la fase 2.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const CLARA_DIR = resolve(ROOT, "agents/clara");
const CLARA_AGENT_DIR = resolve(CLARA_DIR, "agent");
const CLARA_TOOLS_DIR = resolve(CLARA_AGENT_DIR, "tools");
const CLARA_SKILLS_DIR = resolve(CLARA_AGENT_DIR, "skills");
const CLARA_CHANNELS_DIR = resolve(CLARA_AGENT_DIR, "channels");
const EVA_TOOLS_DIR = resolve(ROOT, "agents/eva/agent/tools");
const MORA_TOOLS_DIR = resolve(ROOT, "agents/mora/agent/tools");

/** Set exacto del design §D4: ni uno más, ni uno menos. */
const CLARA_TOOLS = [
  "list-follow-up-cases",
  "get-follow-up-rules",
  "get-follow-up-draft",
  "draft-follow-up-message",
  "transition-follow-up-draft",
  "mark-contact-attempted",
  "dismiss-follow-up",
] as const;

const CLARA_SKILLS = ["follow-up-workflow.md", "drafting-guidelines.md"] as const;

const CLARA_INSTRUCTIONS = resolve(CLARA_AGENT_DIR, "instructions.md");
const CLARA_FOLLOW_UP_SKILL = resolve(CLARA_SKILLS_DIR, CLARA_SKILLS[0]);
const CLARA_DRAFTING_SKILL = resolve(CLARA_SKILLS_DIR, CLARA_SKILLS[1]);

/**
 * Umbrales y prioridades que SOLO viven en `src/lib/admin/follow-up/` y se
 * leen por `get-follow-up-rules` (design §D13). Ninguna skill los redefine.
 */
const FORBIDDEN_SKILL_THRESHOLDS = [
  "no_show_window_days",
  "stalled_treatment_days",
  "inactive_patient_months",
  "unanswered_quote_days",
  "follow_up_reason_priority",
] as const;

const FOLLOW_UP_THRESHOLD_LITERALS = /\b(90|45|21|180)\b/;

/** El envío queda fuera del set de tools (design §D7). */
const FORBIDDEN_SEND_SYMBOLS = [
  "claimFollowUpDraftForSend",
  "markFollowUpDraftSent",
  "markFollowUpDraftSentFailed",
  "sendFollowUpDraft",
  "insertFollowUpOutboundMessage",
] as const;

/** Superficies de los agentes raíz existentes, congeladas en esta fase. */
const EVA_TOOLS = [
  "book-appointment.ts",
  "check-availability.ts",
  "escalate-to-human.ts",
  "get-next-available.ts",
  "handle-reminder-reply.ts",
  "list-catalog.ts",
  "list-my-appointments.ts",
  "reschedule-appointment.ts",
  "resolve-patient.ts",
  "search-knowledge.ts",
];

const MORA_TOOLS = [
  "find-patient.ts",
  "get-patient-balance.ts",
  "list-overdue-balances.ts",
  "register-payment-intent.ts",
];

function read(path: string): string {
  expect(existsSync(path), `${path} must exist`).toBe(true);
  return readFileSync(path, "utf-8");
}

function listFiles(dir: string, suffix: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(suffix)).sort();
}

describe("Superficie de Clara como agente raíz", () => {
  it("declara su propia definición de agente y su propio modelo", () => {
    const agentSource = read(resolve(CLARA_AGENT_DIR, "agent.ts"));
    expect(agentSource).toContain("defineAgent");
    expect(agentSource).toContain("createDynamicModel");
    expect(agentSource).toMatch(/sessionTimeoutMs:\s*1800000/);
    // No es un subagente ni delega en otro agente raíz.
    expect(agentSource).not.toContain("Delega aquí");
    expect(agentSource).not.toContain("subagente");

    const modelSource = read(resolve(CLARA_AGENT_DIR, "model.ts"));
    expect(modelSource).toContain("resolveModelConfig");
    expect(modelSource).toContain("createDynamicModel");
  });

  it("declara sus propias instrucciones", () => {
    read(resolve(CLARA_AGENT_DIR, "instructions.md"));
  });

  it("expone exactamente las 7 tools del seguimiento", () => {
    const expected = CLARA_TOOLS.map((tool) => `${tool}.ts`).sort();
    expect(listFiles(CLARA_TOOLS_DIR, ".ts")).toEqual(expected);
  });

  it("declara su propio canal Discord con ruta y comando", () => {
    const channelSource = read(resolve(CLARA_CHANNELS_DIR, "discord.ts"));
    expect(channelSource).toContain("discordChannel");
    expect(channelSource).toContain("onCommand");
  });

  it("declara las 2 skills de apoyo", () => {
    for (const skill of CLARA_SKILLS) {
      expect(
        existsSync(resolve(CLARA_SKILLS_DIR, skill)),
        `agents/clara/agent/skills/${skill} must exist`,
      ).toBe(true);
    }
  });

  it("no crea package.json en la raíz del agente", () => {
    // `isWorkspaceOwnedAgentRoot` descarta como miembro de workspace cualquier
    // `agents/<name>` con package.json: el agente dejaría de resolverse.
    expect(existsSync(resolve(CLARA_DIR, "package.json"))).toBe(false);
  });

  it("no crea subagents/", () => {
    expect(existsSync(resolve(CLARA_AGENT_DIR, "subagents"))).toBe(false);
    expect(existsSync(resolve(CLARA_DIR, "subagents"))).toBe(false);
  });

  it("no expone ninguna vía de envío en sus tools", () => {
    for (const file of listFiles(CLARA_TOOLS_DIR, ".ts")) {
      const source = read(resolve(CLARA_TOOLS_DIR, file));
      for (const symbol of FORBIDDEN_SEND_SYMBOLS) {
        expect(
          source.includes(symbol),
          `${file} must not reference ${symbol}`,
        ).toBe(false);
      }
    }
  });
});

describe("Guardrails de Clara en instrucciones y skills", () => {
  it("preserva los guardrails de dominio y el escalamiento en sus instrucciones", () => {
    const text = read(CLARA_INSTRUCTIONS).toLowerCase();

    for (const needle of [
      "no diagnostico",
      "no receto",
      "precio",
      "disponibilidad",
      "dolor fuerte",
      "urgencia",
      "infección",
      "alergia",
      "medicamento",
      "receta",
      "intención ambigua",
      "no envío",
      "español de méxico",
    ]) {
      expect(
        text.includes(needle),
        `Clara instructions must preserve: ${needle}`,
      ).toBe(true);
    }
  });

  it("documenta el routing de las 7 tools en follow-up-workflow.md", () => {
    const text = read(CLARA_FOLLOW_UP_SKILL).toLowerCase();

    for (const tool of CLARA_TOOLS) {
      expect(
        text.includes(tool),
        `follow-up-workflow.md must reference ${tool}`,
      ).toBe(true);
    }
  });

  it("documenta el límite, el fallback y el ciclo del borrador", () => {
    const text = read(CLARA_DRAFTING_SKILL).toLowerCase();

    for (const needle of [
      "max_draft_length",
      "600",
      "fallback",
      "plantilla",
      "draft → approved | rejected",
    ]) {
      expect(
        text.includes(needle),
        `drafting-guidelines.md must document: ${needle}`,
      ).toBe(true);
    }
  });

  it("no introduce umbrales ni prioridades propios en las skills", () => {
    for (const skill of CLARA_SKILLS) {
      const text = read(resolve(CLARA_SKILLS_DIR, skill)).toLowerCase();

      for (const forbidden of FORBIDDEN_SKILL_THRESHOLDS) {
        expect(
          text.includes(forbidden),
          `${skill} must not redefine ${forbidden}`,
        ).toBe(false);
      }

      expect(
        FOLLOW_UP_THRESHOLD_LITERALS.test(text),
        `${skill} must not hardcode follow-up thresholds`,
      ).toBe(false);
    }
  });
});

describe("Regresión de los agentes raíz existentes", () => {
  it("no cambia el set de tools de Eva", () => {
    expect(listFiles(EVA_TOOLS_DIR, ".ts")).toEqual(EVA_TOOLS);
  });

  it("no cambia el set de tools de Mora", () => {
    expect(listFiles(MORA_TOOLS_DIR, ".ts")).toEqual(MORA_TOOLS);
  });
});
