// @vitest-environment node
/**
 * Pruebas de la tool `draft-follow-up-message` (issue #161, Fase 4).
 *
 * Guardrails (spec `clara-follow-up-tools` → "Tool de redacción y persistencia
 * de borrador" y `clara-drafting` → "Sin canal de WhatsApp"):
 *   - Genera bajo demanda para un único paciente de la ronda y persiste en
 *     `follow_up_message_drafts` con estado `draft`.
 *   - Sin llaves del LLM, falla del LLM, timeout o salida con patrón prohibido
 *     se persiste la plantilla determinista (`source: "template"`).
 *   - Idempotencia: un borrador `draft` existente se regenera sin cambiar la
 *     `dedup_key`; un borrador decidido se devuelve sin llamar al LLM ni
 *     escribir.
 *   - Fuera de la lista del día ⇒ error sin escribir; sin actor mapeado ⇒
 *     error sin escribir; sin autorización ⇒ error sin tocar la base.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACTOR_USER_ID,
  applyEnv,
  authorizedEnv,
  buildQuery,
  discordCtx,
  DRAFT_ID,
  mockTablesByQueue,
  PATIENT_ID,
  resetClaraEnv,
} from "./support";

const from = vi.fn();
const listDailyFollowUpCases = vi.fn();
const loadFollowUpContactsForRound = vi.fn();
const generateText = vi.hoisted(() => vi.fn());

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

vi.mock("ai", () => ({ generateText }));

const { default: tool } = await import(
  "../../../../agents/clara/agent/tools/draft-follow-up-message"
);
const { CLARA_ACTOR_REFUSAL, CLARA_ACCESS_REFUSAL } = await import(
  "../../../../agents/clara/agent/access"
);

const execute = tool.execute as (input: unknown, ctx?: unknown) => Promise<unknown>;

const ROUND_DATE = "2026-10-01";

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

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    patient_id: PATIENT_ID,
    body: "Hola Ana, queremos retomar tu seguimiento.",
    template_name: "seguimiento_paciente",
    status: "draft",
    dedup_key: `follow-up-draft:${PATIENT_ID}:${ROUND_DATE}`,
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

type DraftToolResult = {
  success: boolean;
  created?: boolean;
  regenerated?: boolean;
  source?: string;
  draft?: { id: string; status: string; body: string };
  error?: string;
  message?: string;
};

describe("draft-follow-up-message", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetClaraEnv();
    authorizedEnv({ actor: true });
    listDailyFollowUpCases.mockResolvedValue([followUpCase()]);
    loadFollowUpContactsForRound.mockResolvedValue([]);
  });

  it("sin llaves del LLM persiste la plantilla y no falla", async () => {
    const findQuery = buildQuery({ data: null, error: null });
    const createQuery = buildQuery({ data: [draftRow()], error: null });
    mockTablesByQueue(from, {
      follow_up_message_drafts: [findQuery, createQuery],
    });

    const result = (await execute(
      { patientId: PATIENT_ID, patientName: "Ana López" },
      discordCtx(),
    )) as DraftToolResult;

    expect(result.success).toBe(true);
    expect(result.created).toBe(true);
    expect(result.source).toBe("template");
    expect(result.draft?.status).toBe("draft");
    expect(result.draft?.body).toContain("Ana");
    expect(generateText).not.toHaveBeenCalled();
    expect(createQuery.upsert).toHaveBeenCalledTimes(1);
  });

  it("una falla del LLM degrada a la plantilla", async () => {
    applyEnv({
      CLARA_DRAFTING_ENABLED: "true",
      WHATSAPP_AGENT_LLM_API_KEY: "test-key",
      WHATSAPP_AGENT_LLM_BASE_URL: "https://llm.example.invalid/v1",
    });
    generateText.mockRejectedValue(new Error("provider exploded"));
    const findQuery = buildQuery({ data: null, error: null });
    const createQuery = buildQuery({ data: [draftRow()], error: null });
    mockTablesByQueue(from, {
      follow_up_message_drafts: [findQuery, createQuery],
    });

    const result = (await execute({ patientId: PATIENT_ID }, discordCtx())) as DraftToolResult;

    expect(result).toMatchObject({ success: true, source: "template" });
  });

  it("un timeout del LLM degrada a la plantilla", async () => {
    applyEnv({
      CLARA_DRAFTING_ENABLED: "true",
      WHATSAPP_AGENT_LLM_API_KEY: "test-key",
      WHATSAPP_AGENT_LLM_BASE_URL: "https://llm.example.invalid/v1",
    });
    const timeoutError = new Error("The operation was aborted");
    timeoutError.name = "TimeoutError";
    generateText.mockRejectedValue(timeoutError);
    const findQuery = buildQuery({ data: null, error: null });
    const createQuery = buildQuery({ data: [draftRow()], error: null });
    mockTablesByQueue(from, {
      follow_up_message_drafts: [findQuery, createQuery],
    });

    const result = (await execute({ patientId: PATIENT_ID }, discordCtx())) as DraftToolResult;

    expect(result).toMatchObject({ success: true, source: "template" });
  });

  it("descarta una salida con patrón prohibido y persiste la plantilla", async () => {
    applyEnv({
      CLARA_DRAFTING_ENABLED: "true",
      WHATSAPP_AGENT_LLM_API_KEY: "test-key",
      WHATSAPP_AGENT_LLM_BASE_URL: "https://llm.example.invalid/v1",
    });
    generateText.mockResolvedValue({ text: "Hola Ana, el precio es $500." });
    const findQuery = buildQuery({ data: null, error: null });
    const createQuery = buildQuery({ data: [draftRow()], error: null });
    mockTablesByQueue(from, {
      follow_up_message_drafts: [findQuery, createQuery],
    });

    const result = (await execute({ patientId: PATIENT_ID }, discordCtx())) as DraftToolResult;

    expect(result).toMatchObject({ success: true, source: "template" });
    expect(createQuery.upsert).toHaveBeenCalledTimes(1);
    const payload = createQuery.upsert.mock.calls[0]?.[0] as { body: string };
    expect(payload.body).not.toContain("precio");
  });

  it("usa el texto del LLM cuando pasa los guardrails", async () => {
    applyEnv({
      CLARA_DRAFTING_ENABLED: "true",
      WHATSAPP_AGENT_LLM_API_KEY: "test-key",
      WHATSAPP_AGENT_LLM_BASE_URL: "https://llm.example.invalid/v1",
    });
    generateText.mockResolvedValue({
      text: "Hola Ana, seguimos a tus órdenes para retomar tu tratamiento. ¿Te gustaría agendar una valoración?",
    });
    const findQuery = buildQuery({ data: null, error: null });
    const createQuery = buildQuery({ data: [draftRow()], error: null });
    mockTablesByQueue(from, {
      follow_up_message_drafts: [findQuery, createQuery],
    });

    const result = (await execute({ patientId: PATIENT_ID }, discordCtx())) as DraftToolResult;

    expect(result).toMatchObject({ success: true, source: "llm" });
  });

  it("regenera el borrador en draft sin cambiar la dedup_key", async () => {
    const existing = draftRow({ body: "texto viejo" });
    const findQuery = buildQuery({ data: existing, error: null });
    const getByIdQuery = buildQuery({ data: existing, error: null });
    const updateQuery = buildQuery({
      data: draftRow({ body: "Hola Ana, retomemos tu seguimiento." }),
      error: null,
    });
    mockTablesByQueue(from, {
      follow_up_message_drafts: [findQuery, getByIdQuery, updateQuery],
    });

    const result = (await execute({ patientId: PATIENT_ID }, discordCtx())) as DraftToolResult;

    expect(result).toMatchObject({ success: true, regenerated: true, source: "template" });
    expect(updateQuery.upsert).not.toHaveBeenCalled();
    const payload = updateQuery.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("dedup_key");
    expect(payload.edited_by).toBe(ACTOR_USER_ID);
  });

  it("devuelve un borrador decidido sin llamar al LLM ni escribir", async () => {
    applyEnv({
      CLARA_DRAFTING_ENABLED: "true",
      WHATSAPP_AGENT_LLM_API_KEY: "test-key",
      WHATSAPP_AGENT_LLM_BASE_URL: "https://llm.example.invalid/v1",
    });
    const approved = draftRow({ status: "approved" });
    const findQuery = buildQuery({ data: approved, error: null });
    mockTablesByQueue(from, { follow_up_message_drafts: [findQuery] });

    const result = (await execute({ patientId: PATIENT_ID }, discordCtx())) as DraftToolResult;

    expect(result).toMatchObject({
      success: true,
      regenerated: false,
      draft: { id: DRAFT_ID, status: "approved" },
    });
    expect(generateText).not.toHaveBeenCalled();
    expect(findQuery.update).not.toHaveBeenCalled();
    expect(findQuery.upsert).not.toHaveBeenCalled();
  });

  it("un caso fuera de la lista del día falla sin escribir", async () => {
    listDailyFollowUpCases.mockResolvedValue([]);
    loadFollowUpContactsForRound.mockResolvedValue([]);
    mockTablesByQueue(from, {});

    const result = (await execute({ patientId: PATIENT_ID }, discordCtx())) as DraftToolResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain("lista");
  });

  it("TRIANGULATE: los borradores se escriben solo en follow_up_message_drafts", async () => {
    const findQuery = buildQuery({ data: null, error: null });
    const createQuery = buildQuery({ data: [draftRow()], error: null });
    mockTablesByQueue(from, {
      follow_up_message_drafts: [findQuery, createQuery],
    });

    await execute({ patientId: PATIENT_ID }, discordCtx());

    const tables = from.mock.calls.map((call) => call[0]);
    expect(tables).toEqual(["follow_up_message_drafts", "follow_up_message_drafts"]);
    expect(tables).not.toContain("follow_up_contacts");
  });

  it("sin actor mapeado falla cerrado sin escribir", async () => {
    authorizedEnv({ actor: false });
    mockTablesByQueue(from, {});

    const result = (await execute({ patientId: PATIENT_ID }, discordCtx())) as DraftToolResult;

    expect(result).toMatchObject({ success: false, error: CLARA_ACTOR_REFUSAL });
    expect(from).not.toHaveBeenCalled();
    expect(listDailyFollowUpCases).not.toHaveBeenCalled();
  });

  it("sin autorización falla cerrado sin tocar la base", async () => {
    from.mockImplementation(() => {
      throw new Error("Sin autorización no se consulta Supabase");
    });

    const result = (await execute(
      { patientId: PATIENT_ID },
      discordCtx("000000000000000000"),
    )) as DraftToolResult;

    expect(result).toMatchObject({ success: false, error: CLARA_ACCESS_REFUSAL });
    expect(from).not.toHaveBeenCalled();
    expect(listDailyFollowUpCases).not.toHaveBeenCalled();
  });
});
