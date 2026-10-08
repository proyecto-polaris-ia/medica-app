// @vitest-environment node
/**
 * Pruebas de la tool `list-follow-up-cases` (issue #161, Fase 4).
 *
 * Guardrails (spec `clara-follow-up-tools` → "Tool de lectura de la lista
 * diaria" y "Tools de escritura deterministas con autorización fail-closed"):
 *   - Devuelve los casos de la ronda con su motivo principal (`reason`,
 *     `reasonLabel`) y la fecha de la ronda.
 *   - Sin autorización no consulta la base ni la capa de datos.
 *   - Una falla de lectura se reporta como `{ success: false, error }` sin
 *     inventar pacientes ni motivos.
 *   - La lista es la del módulo determinista: los contactados/descartados ya
 *     no vienen en el resultado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyEnv,
  discordCtx,
  resetClaraEnv,
  STAFF_DISCORD_ID,
  mockTablesByQueue,
} from "./support";

const from = vi.fn();
const listDailyFollowUpCases = vi.fn();
const loadFollowUpContactsForRound = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({ from }),
}));

vi.mock("@/lib/admin/follow-up/follow-up", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/admin/follow-up/follow-up")>();
  return {
    ...actual,
    listDailyFollowUpCases: (...args: unknown[]) => listDailyFollowUpCases(...args),
    loadFollowUpContactsForRound: (...args: unknown[]) =>
      loadFollowUpContactsForRound(...args),
  };
});

const { default: tool } = await import(
  "../../../../agents/clara/agent/tools/list-follow-up-cases"
);
const { CLARA_ACCESS_REFUSAL } = await import(
  "../../../../agents/clara/agent/access"
);

const execute = tool.execute as (input: unknown, ctx?: unknown) => Promise<unknown>;

const ROUND_DATE = "2026-10-01";
const PATIENT_ID = "6f9619ff-8b86-d011-b42d-00cf4fc964ff";
const OTHER_PATIENT_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

function followUpCase(overrides: Record<string, unknown> = {}) {
  return {
    patientId: PATIENT_ID,
    patientName: "Ana López",
    patientPhoneE164: "+5215511111111",
    reason: "no_show",
    reasonLabel: "Cita no atendida",
    reasonDate: "2026-09-20T12:00:00.000Z",
    roundDate: ROUND_DATE,
    sourceAppointmentId: "appt-1",
    sourcePlanId: null,
    ...overrides,
  };
}

type ListResult = {
  success: boolean;
  roundDate?: string;
  count?: number;
  cases?: Array<Record<string, unknown>>;
  error?: string;
  message?: string;
};

describe("list-follow-up-cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetClaraEnv();
    applyEnv({ CLARA_DISCORD_STAFF_IDS: STAFF_DISCORD_ID });
    mockTablesByQueue(from, {});
  });

  it("devuelve los casos de la ronda con motivo y etiqueta, sin tocar la base", async () => {
    listDailyFollowUpCases.mockResolvedValue([followUpCase()]);

    const result = (await execute({}, discordCtx())) as ListResult;

    expect(result.success).toBe(true);
    expect(result.roundDate).toBe(ROUND_DATE);
    expect(result.count).toBe(1);
    expect(result.cases).toEqual([
      {
        patientId: PATIENT_ID,
        patientName: "Ana López",
        patientPhoneE164: "+5215511111111",
        reason: "no_show",
        reasonLabel: "Cita no atendida",
        reasonDate: "2026-09-20T12:00:00.000Z",
      },
    ]);
    // La tool solo lee a través del módulo determinista.
    expect(listDailyFollowUpCases).toHaveBeenCalledTimes(1);
  });

  it("sin autorización falla cerrado sin consultar Supabase ni la capa de datos", async () => {
    from.mockImplementation(() => {
      throw new Error("Supabase no debe consultarse sin autorización");
    });

    const result = (await execute({}, discordCtx("000000000000000000"))) as ListResult;

    expect(result).toMatchObject({ success: false, error: CLARA_ACCESS_REFUSAL });
    expect(from).not.toHaveBeenCalled();
    expect(listDailyFollowUpCases).not.toHaveBeenCalled();
  });

  it("falla cerrado cuando la allowlist no está configurada", async () => {
    resetClaraEnv();

    const result = (await execute({}, discordCtx())) as ListResult;

    expect(result).toMatchObject({ success: false, error: CLARA_ACCESS_REFUSAL });
    expect(from).not.toHaveBeenCalled();
    expect(listDailyFollowUpCases).not.toHaveBeenCalled();
  });

  it("reporta una falla de lectura sin inventar datos", async () => {
    listDailyFollowUpCases.mockRejectedValue(new Error("connection refused"));

    const result = (await execute({}, discordCtx())) as ListResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain("connection refused");
    expect(result.cases).toBeUndefined();
  });

  it("la ronda no incluye a los pacientes ya contactados o descartados", async () => {
    // La exclusión la resuelve `listDailyFollowUpCases`; la tool MUST respetar
    // la salida y no reintroducir contactados con criterios propios.
    listDailyFollowUpCases.mockResolvedValue([
      followUpCase({ patientId: OTHER_PATIENT_ID, patientName: "Beto Ruiz" }),
    ]);

    const result = (await execute({}, discordCtx())) as ListResult;

    expect(result.cases).toHaveLength(1);
    expect(result.cases?.[0]).toMatchObject({ patientId: OTHER_PATIENT_ID });
  });

  it("TRIANGULATE: preserva el orden y los motivos de la lista del panel", async () => {
    // Identidad con el panel: para la misma ronda y los mismos datos, Clara
    // devuelve exactamente los mismos pacientes, motivos y orden.
    const panelList = [
      followUpCase({ patientId: PATIENT_ID, reason: "no_show", reasonLabel: "Cita no atendida" }),
      followUpCase({
        patientId: OTHER_PATIENT_ID,
        patientName: "Beto Ruiz",
        reason: "treatment_in_progress",
        reasonLabel: "Tratamiento inconcluso",
      }),
    ];
    listDailyFollowUpCases.mockResolvedValue(panelList);

    const result = (await execute({}, discordCtx())) as ListResult;

    expect(result.cases?.map((item) => item.patientId)).toEqual([
      PATIENT_ID,
      OTHER_PATIENT_ID,
    ]);
    expect(result.cases?.map((item) => item.reason)).toEqual([
      "no_show",
      "treatment_in_progress",
    ]);
    expect(result.roundDate).toBe(ROUND_DATE);
  });

  it("declara un input vacío: no expone filtros paralelos a las reglas", () => {
    type ParsableSchema = { safeParse: (value: unknown) => { success: boolean; data?: unknown } };
    const schema = tool.inputSchema as unknown as ParsableSchema;
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ reason: "no_show" }).data).toEqual({});
  });
});
