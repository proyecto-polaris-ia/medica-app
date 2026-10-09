// @vitest-environment node
/**
 * Contrato estructural de Nora como agente raíz (issue #162, Fase 5).
 *
 * Nora vive en `agents/nora/agent/` con definición de agente, modelo propio,
 * canal Discord, instrucciones y capa de acceso de doctores. La incorporación
 * es aditiva: las superficies de Eva, Mora y Clara no cambian.
 *
 * NOTA DE TDD (tasks.md 1.1 y 2.6): este archivo es el contrato estructural
 * del change completo. Cubre agent.ts, model.ts, instructions.md, access.ts,
 * el canal Discord, el set exacto de las 5 tools de métricas (fase 2) y las 2
 * skills (fase 3).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const NORA_DIR = resolve(ROOT, "agents/nora");
const NORA_AGENT_DIR = resolve(NORA_DIR, "agent");
const NORA_CHANNELS_DIR = resolve(NORA_AGENT_DIR, "channels");
const NORA_TOOLS_DIR = resolve(NORA_AGENT_DIR, "tools");
const NORA_SKILLS_DIR = resolve(NORA_AGENT_DIR, "skills");
const NORA_INSTRUCTIONS = resolve(NORA_AGENT_DIR, "instructions.md");
const NORA_ACCESS = resolve(NORA_AGENT_DIR, "access.ts");

/** Set exacto del design §Estructura de archivos: ni uno más, ni uno menos. */
const NORA_TOOLS = [
  "get-dashboard-summary",
  "get-provider-metrics",
  "get-occupancy",
  "get-no-shows",
  "get-appointment-stats",
] as const;

const NORA_SKILLS = ["metrics-reporting.md", "data-interpretation.md"] as const;

function read(path: string): string {
  expect(existsSync(path), `${path} must exist`).toBe(true);
  return readFileSync(path, "utf-8");
}

function listFiles(dir: string, suffix: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(suffix)).sort();
}

describe("Superficie de Nora como agente raíz", () => {
  it("declara su propia definición de agente y su propio modelo", () => {
    const agentSource = read(resolve(NORA_AGENT_DIR, "agent.ts"));
    expect(agentSource).toContain("defineAgent");
    expect(agentSource).toContain("createDynamicModel");
    expect(agentSource).toMatch(/sessionTimeoutMs:\s*1800000/);
    // No es un subagente ni delega en otro agente raíz.
    expect(agentSource).not.toContain("Delega aquí");
    expect(agentSource).not.toContain("subagente");

    const modelSource = read(resolve(NORA_AGENT_DIR, "model.ts"));
    expect(modelSource).toContain("resolveModelConfig");
    expect(modelSource).toContain("createDynamicModel");
  });

  it("declara sus propias instrucciones", () => {
    read(NORA_INSTRUCTIONS);
  });

  it("declara su propio canal Discord con la ruta y el comando", () => {
    const channelSource = read(resolve(NORA_CHANNELS_DIR, "discord.ts"));
    expect(channelSource).toContain("discordChannel");
    expect(channelSource).toContain("onCommand");
    expect(channelSource).toContain("handleNoraDiscordCommand");
  });

  it("expone exactamente las 5 tools de métricas", () => {
    const expected = NORA_TOOLS.map((tool) => `${tool}.ts`).sort();
    expect(listFiles(NORA_TOOLS_DIR, ".ts")).toEqual(expected);
  });

  it("declara las 2 skills de apoyo", () => {
    expect(listFiles(NORA_SKILLS_DIR, ".md")).toEqual([...NORA_SKILLS].sort());
  });

  it("declara la capa de acceso con la allowlist de doctores y requireDoctor", () => {
    const accessSource = read(NORA_ACCESS);
    expect(accessSource).toContain("NORA_DISCORD_DOCTOR_IDS");
    expect(accessSource).toContain("resolveDoctorAccess");
    expect(accessSource).toContain("requireDoctor");
  });

  it("no crea package.json en la raíz del agente", () => {
    // `isWorkspaceOwnedAgentRoot` descarta como miembro de workspace cualquier
    // `agents/<name>` con package.json: el agente dejaría de resolverse.
    expect(existsSync(resolve(NORA_DIR, "package.json"))).toBe(false);
  });

  it("no crea subagents/", () => {
    expect(existsSync(resolve(NORA_AGENT_DIR, "subagents"))).toBe(false);
    expect(existsSync(resolve(NORA_DIR, "subagents"))).toBe(false);
  });
});

describe("Guardrails de Nora en sus instrucciones", () => {
  it("preserva los guardrails de dominio, de datos y de solo lectura", () => {
    const text = read(NORA_INSTRUCTIONS).toLowerCase();

    for (const needle of [
      // Solo lectura: no toca agenda, BD ni WhatsApp.
      "solo lectura",
      "no reprogram",
      "no cancel",
      "no escribo",
      "whatsapp",
      "panel",
      // Guardrails de dominio.
      "no diagnostic",
      "no recet",
      "precio",
      "dolor fuerte",
      "urgencia",
      "infección",
      "alergia",
      "medicamento",
      "receta",
      "intención ambigua",
      // Guardrails de datos.
      "motor de métricas",
      "no invent",
      // Idioma e identidad.
      "español de méxico",
      "doctores autorizados",
    ]) {
      expect(
        text.includes(needle),
        `Nora instructions must preserve: ${needle}`,
      ).toBe(true);
    }
  });

  it("documenta las 5 tools en la sección Herramientas", () => {
    const text = read(NORA_INSTRUCTIONS).toLowerCase();
    expect(text).toContain("herramientas");
    for (const tool of NORA_TOOLS) {
      expect(text.includes(tool), `instructions must document ${tool}`).toBe(true);
    }
  });
});

describe("Skills de Nora", () => {
  const METRICS_SKILL = resolve(NORA_SKILLS_DIR, NORA_SKILLS[0]);
  const INTERPRETATION_SKILL = resolve(NORA_SKILLS_DIR, NORA_SKILLS[1]);

  it("enruta las 5 tools en metrics-reporting.md", () => {
    const text = read(METRICS_SKILL).toLowerCase();
    for (const tool of NORA_TOOLS) {
      expect(text.includes(tool), `metrics-reporting.md must reference ${tool}`).toBe(
        true,
      );
    }
  });

  it("prohíbe inventar cifras y exige declarar el rango en metrics-reporting.md", () => {
    const text = read(METRICS_SKILL).toLowerCase();
    for (const needle of ["nunca invent", "rango", "periodo anterior", "vacío"]) {
      expect(
        text.includes(needle),
        `metrics-reporting.md must document: ${needle}`,
      ).toBe(true);
    }
  });

  it("marca los límites clínicos en data-interpretation.md", () => {
    const text = read(INTERPRETATION_SKILL).toLowerCase();
    for (const needle of [
      "no diagnóstico",
      "consejo clínico",
      "no reprogram",
      "escalar",
      "no-show",
      "ocupación",
    ]) {
      expect(
        text.includes(needle),
        `data-interpretation.md must document: ${needle}`,
      ).toBe(true);
    }
  });
});
