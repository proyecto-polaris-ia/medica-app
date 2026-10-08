// @vitest-environment node
/**
 * Pruebas de la tool `transition-follow-up-draft` (issue #161, Fase 4).
 *
 * Guardrails (spec `clara-follow-up-tools` → "Tool de transición de borrador
 * limitada a aprobado o rechazado" y "El envío queda fuera del set de tools"):
 *   - `draft → approved` y `draft → rejected` son las únicas transiciones.
 *   - `sent` / `sent_failed` son rechazadas estructuralmente por el schema.
 *   - Un borrador ya decidido no cambia (ConflictError ⇒ error de tool).
 *   - Sin actor mapeado se niega sin escribir; nunca toca `whatsapp_messages`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACTOR_USER_ID,
  authorizedEnv,
  buildQuery,
  discordCtx,
  DRAFT_ID,
  mockTablesByQueue,
  PATIENT_ID,
  resetClaraEnv,
} from "./support";

const from = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({ from }),
}));

const { default: tool } = await import(
  "../../../../agents/clara/agent/tools/transition-follow-up-draft"
);
const { CLARA_ACTOR_REFUSAL, CLARA_ACCESS_REFUSAL } = await import(
  "../../../../agents/clara/agent/access"
);

const execute = tool.execute as (input: unknown, ctx?: unknown) => Promise<unknown>;

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    patient_id: PATIENT_ID,
    body: "Hola Ana, ¿agendamos una revisión?",
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

type TransitionResult = {
  success: boolean;
  draft?: { id: string; status: string };
  error?: string;
  message?: string;
};

describe("transition-follow-up-draft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetClaraEnv();
    authorizedEnv({ actor: true });
  });

  it("aprueba un borrador draft sin disparar ningún envío", async () => {
    const getById = buildQuery({ data: draftRow(), error: null });
    const update = buildQuery({ data: draftRow({ status: "approved" }), error: null });
    mockTablesByQueue(from, { follow_up_message_drafts: [getById, update] });

    const result = (await execute(
      { draftId: DRAFT_ID, decision: "approved" },
      discordCtx(),
    )) as TransitionResult;

    expect(result).toMatchObject({ success: true, draft: { id: DRAFT_ID, status: "approved" } });
    expect(update.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approved", approved_by: ACTOR_USER_ID }),
    );
  });

  it("rechaza un borrador draft sin disparar ningún envío", async () => {
    const getById = buildQuery({ data: draftRow(), error: null });
    const update = buildQuery({ data: draftRow({ status: "rejected" }), error: null });
    mockTablesByQueue(from, { follow_up_message_drafts: [getById, update] });

    const result = (await execute(
      { draftId: DRAFT_ID, decision: "rejected" },
      discordCtx(),
    )) as TransitionResult;

    expect(result).toMatchObject({ success: true, draft: { id: DRAFT_ID, status: "rejected" } });
  });

  it("no puede expresar transiciones hacia sent ni sent_failed", () => {
    type ParsableSchema = { safeParse: (value: unknown) => { success: boolean } };
    const schema = tool.inputSchema as unknown as ParsableSchema;
    expect(schema.safeParse({ draftId: DRAFT_ID, decision: "sent" }).success).toBe(false);
    expect(schema.safeParse({ draftId: DRAFT_ID, decision: "sent_failed" }).success).toBe(false);
    expect(schema.safeParse({ draftId: DRAFT_ID, decision: "approved" }).success).toBe(true);
    expect(schema.safeParse({ draftId: DRAFT_ID, decision: "rejected" }).success).toBe(true);
  });

  it("un borrador ya decidido se rechaza sin cambios", async () => {
    const getById = buildQuery({ data: draftRow({ status: "approved" }), error: null });
    mockTablesByQueue(from, { follow_up_message_drafts: [getById] });

    const result = (await execute(
      { draftId: DRAFT_ID, decision: "rejected" },
      discordCtx(),
    )) as TransitionResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain("approved");
    expect(getById.update).not.toHaveBeenCalled();
  });

  it("un borrador inexistente se reporta como error", async () => {
    const getById = buildQuery({ data: null, error: null });
    mockTablesByQueue(from, { follow_up_message_drafts: [getById] });

    const result = (await execute(
      { draftId: DRAFT_ID, decision: "approved" },
      discordCtx(),
    )) as TransitionResult;

    expect(result.success).toBe(false);
    expect(getById.update).not.toHaveBeenCalled();
  });

  it("sin actor mapeado falla cerrado sin leer ni escribir el borrador", async () => {
    authorizedEnv({ actor: false });
    mockTablesByQueue(from, {});

    const result = (await execute(
      { draftId: DRAFT_ID, decision: "approved" },
      discordCtx(),
    )) as TransitionResult;

    expect(result).toMatchObject({ success: false, error: CLARA_ACTOR_REFUSAL });
    expect(from).not.toHaveBeenCalled();
  });

  it("sin autorización falla cerrado sin tocar la base", async () => {
    from.mockImplementation(() => {
      throw new Error("Sin autorización no se consulta Supabase");
    });

    const result = (await execute(
      { draftId: DRAFT_ID, decision: "approved" },
      discordCtx("000000000000000000"),
    )) as TransitionResult;

    expect(result).toMatchObject({ success: false, error: CLARA_ACCESS_REFUSAL });
    expect(from).not.toHaveBeenCalled();
  });

  it("nunca escribe en whatsapp_messages", async () => {
    const getById = buildQuery({ data: draftRow(), error: null });
    const update = buildQuery({ data: draftRow({ status: "approved" }), error: null });
    mockTablesByQueue(from, { follow_up_message_drafts: [getById, update] });

    await execute({ draftId: DRAFT_ID, decision: "approved" }, discordCtx());

    const tables = from.mock.calls.map((call) => call[0]);
    expect(tables).toEqual(["follow_up_message_drafts", "follow_up_message_drafts"]);
  });
});
