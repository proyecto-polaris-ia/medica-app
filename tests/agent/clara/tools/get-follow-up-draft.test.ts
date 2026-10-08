// @vitest-environment node
/**
 * Pruebas de la tool `get-follow-up-draft` (issue #161, Fase 4).
 *
 * Guardrails (spec `clara-follow-up-tools` → "Tool de lectura del borrador
 * existente" y "Solo datos de la base y sin fuga entre pacientes"):
 *   - Con borrador existente devuelve `found: true` con estado y texto.
 *   - Sin borrador reporta `found: false` limpiamente.
 *   - Un nombre ambiguo devuelve candidatos y no consulta borradores.
 *   - Sin autorización no consulta la base.
 *   - La tool nunca crea ni modifica: solo lee.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyEnv,
  discordCtx,
  mockTablesByQueue,
  resetClaraEnv,
  STAFF_DISCORD_ID,
  buildQuery,
  PATIENT_ID,
  DRAFT_ID,
  ACTOR_USER_ID,
} from "./support";

const from = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({ from }),
}));

const { default: tool } = await import(
  "../../../../agents/clara/agent/tools/get-follow-up-draft"
);
const { CLARA_ACCESS_REFUSAL } = await import(
  "../../../../agents/clara/agent/access"
);

const execute = tool.execute as (input: unknown, ctx?: unknown) => Promise<unknown>;

const OTHER_PATIENT_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

function patientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PATIENT_ID,
    full_name: "Ana López",
    phone_e164: "+5215511111111",
    ...overrides,
  };
}

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    patient_id: PATIENT_ID,
    body: "Hola Ana, ¿te gustaría agendar una revisión?",
    template_name: "seguimiento_paciente",
    status: "draft",
    dedup_key: `follow-up-draft:${PATIENT_ID}:2026-10-01`,
    provider_message_id: null,
    error_message: null,
    approved_by: null,
    approved_at: null,
    edited_by: null,
    edited_at: null,
    sent_at: null,
    created_by: ACTOR_USER_ID,
    created_at: "2026-10-01T12:00:00.000Z",
    updated_at: "2026-10-01T12:00:00.000Z",
    ...overrides,
  };
}

type DraftResult = {
  success: boolean;
  resolved?: boolean;
  found?: boolean;
  candidates?: Array<Record<string, unknown>>;
  draft?: { id: string; status: string; body: string; updatedAt: string };
  error?: string;
  message?: string;
};

describe("get-follow-up-draft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetClaraEnv();
    applyEnv({ CLARA_DISCORD_STAFF_IDS: STAFF_DISCORD_ID });
  });

  it("con borrador devuelve found: true con estado y texto", async () => {
    const patients = buildQuery({ data: patientRow(), error: null });
    const drafts = buildQuery({ data: draftRow(), error: null });
    mockTablesByQueue(from, {
      patients: [patients],
      follow_up_message_drafts: [drafts],
    });

    const result = (await execute({ patientId: PATIENT_ID }, discordCtx())) as DraftResult;

    expect(result).toMatchObject({
      success: true,
      resolved: true,
      found: true,
      draft: {
        id: DRAFT_ID,
        status: "draft",
        body: "Hola Ana, ¿te gustaría agendar una revisión?",
      },
    });
    // TRIANGULATE: la consulta queda acotada al paciente nombrado; no puede
    // traer el borrador de otro paciente.
    const dedupArg = drafts.eq.mock.calls.find((call) => call[0] === "dedup_key");
    expect(String(dedupArg?.[1])).toContain(PATIENT_ID);
    expect(String(dedupArg?.[1])).not.toContain(OTHER_PATIENT_ID);
  });

  it("sin borrador reporta found: false sin escribir nada", async () => {
    const patients = buildQuery({ data: patientRow(), error: null });
    const drafts = buildQuery({ data: null, error: null });
    mockTablesByQueue(from, {
      patients: [patients],
      follow_up_message_drafts: [drafts],
    });

    const result = (await execute({ patientId: PATIENT_ID }, discordCtx())) as DraftResult;

    expect(result).toMatchObject({ success: true, resolved: true, found: false });
    expect(drafts.update).not.toHaveBeenCalled();
    expect(drafts.upsert).not.toHaveBeenCalled();
  });

  it("un nombre ambiguo devuelve candidatos y no consulta borradores", async () => {
    const patients = buildQuery({
      data: [patientRow(), patientRow({ id: OTHER_PATIENT_ID, full_name: "Ana María" })],
      error: null,
    });
    const drafts = buildQuery({ data: draftRow(), error: null });
    mockTablesByQueue(from, {
      patients: [patients],
      follow_up_message_drafts: [drafts],
    });

    const result = (await execute({ patientName: "Ana" }, discordCtx())) as DraftResult;

    expect(result.success).toBe(true);
    expect(result.resolved).toBe(false);
    expect(result.candidates).toHaveLength(2);
    expect(result.draft).toBeUndefined();
    expect(drafts.select).not.toHaveBeenCalled();
  });

  it("sin autorización falla cerrado sin consultar la base", async () => {
    from.mockImplementation(() => {
      throw new Error("Sin autorización no se consulta Supabase");
    });

    const result = (await execute(
      { patientId: PATIENT_ID },
      discordCtx("000000000000000000"),
    )) as DraftResult;

    expect(result).toMatchObject({ success: false, error: CLARA_ACCESS_REFUSAL });
    expect(from).not.toHaveBeenCalled();
  });

  it("reporta una falla de lectura sin inventar un borrador", async () => {
    const patients = buildQuery({ data: patientRow(), error: null });
    const drafts = buildQuery({ data: null, error: { message: "boom" } });
    mockTablesByQueue(from, {
      patients: [patients],
      follow_up_message_drafts: [drafts],
    });

    const result = (await execute({ patientId: PATIENT_ID }, discordCtx())) as DraftResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain("boom");
    expect(result.draft).toBeUndefined();
  });
});
