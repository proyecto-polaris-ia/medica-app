// @vitest-environment node
/**
 * Contrato estructural de Nora como agente raíz (issue #162, Fase 5).
 *
 * Nora vive en `agents/nora/agent/` con definición de agente, modelo propio,
 * canal Discord, instrucciones y capa de acceso de doctores. La incorporación
 * es aditiva: las superficies de Eva, Mora y Clara no cambian.
 *
 * NOTA DE TDD (tasks.md 1.1): este archivo es el contrato estructural del
 * slice 1. En esta fase NO asevera `tools/` ni `skills/`: llegan en las fases 2
 * y 3 del change. Cubre agent.ts, model.ts, instructions.md, access.ts y el
 * canal Discord.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const NORA_DIR = resolve(ROOT, "agents/nora");
const NORA_AGENT_DIR = resolve(NORA_DIR, "agent");
const NORA_CHANNELS_DIR = resolve(NORA_AGENT_DIR, "channels");
const NORA_INSTRUCTIONS = resolve(NORA_AGENT_DIR, "instructions.md");
const NORA_ACCESS = resolve(NORA_AGENT_DIR, "access.ts");

/** Las 5 tools que la Fase 2 implementará; aquí solo se documentan. */
const NORA_TOOLS = [
  "get-dashboard-summary",
  "get-provider-metrics",
  "get-occupancy",
  "get-no-shows",
  "get-appointment-stats",
] as const;

function read(path: string): string {
  expect(existsSync(path), `${path} must exist`).toBe(true);
  return readFileSync(path, "utf-8");
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
