// @vitest-environment node
/**
 * Pruebas de la tool `mark-contact-attempted` (issue #161, Fase 4).
 *
 * Guardrails (spec `clara-follow-up-tools` → "Tools de escritura deterministas
 * con autorización fail-closed" y "Fuente única del estado de contacto"):
 *   - Persiste `contacted` con `contacted_at` y el actor del mapa en
 *     `follow_up_contacts`.
 *   - Segunda marca en la misma ronda: mismo registro (`upsert` por
 *     `(patient_id, round_date)`), sin duplicar.
 *   - Fuera de la ronda ⇒ error sin escribir; sin actor ⇒ error sin escribir;
 *     sin autorización ⇒ error sin leer ni escribir.
 *   - Una nota mayor a 1000 caracteres se reporta como error de tool.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACTOR_USER_ID,
  authorizedEnv,
  buildQuery,
  discordCtx,
  mockTablesByQueue,
  PATIENT_ID,
  resetClaraEnv,
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
  "../../../../agents/clara/agent/tools/mark-contact-attempted"
);
const { CLARA_ACTOR_REFUSAL, CLARA_ACCESS_REFUSAL } = await import(
  "../../../../agents/clara/agent/access"
);

const execute = tool.execute as (input: unknown, ctx?: unknown) => Promise<unknown>;

const ROUND_DATE = "2026-10-01";

function followUpCase() {
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
  };
}

function patientRow() {
  return { id: PATIENT_ID, full_name: "Ana López", phone_e164: "+5215511111111" };
}

function contactRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "0f7f5e0a-1c2b-4c3d-8e4f-1234567890ab",
    patient_id: PATIENT_ID,
    round_date: ROUND_DATE,
    status: "contacted",
    contacted_at: "2026-10-01T15:00:00.000Z",
    dismissed_at: null,
    note: null,
    created_by: ACTOR_USER_ID,
    created_at: "2026-10-01T15:00:00.000Z",
    updated_at: "2026-10-01T15:00:00.000Z",
    ...overrides,
  };
}

type MarkResult = {
  success: boolean;
  contact?: {
    id: string;
    patientId: string;
    roundDate: string;
    status: string;
    contactedAt: string | null;
    dismissedAt: string | null;
    note: string | null;
  };
  error?: string;
};

describe("mark-contact-attempted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetClaraEnv();
    authorizedEnv({ actor: true });
    listDailyFollowUpCases.mockResolvedValue([followUpCase()]);
    loadFollowUpContactsForRound.mockResolvedValue([]);
  });

  it("persiste contacted con su instante y el actor mapeado", async () => {
    const patients = buildQuery({ data: patientRow(), error: null });
    const contacts = buildQuery({ data: contactRow(), error: null });
    mockTablesByQueue(from, {
      patients: [patients],
      follow_up_contacts: [contacts],
    });

    const result = (await execute({ patientId: PATIENT_ID }, discordCtx())) as MarkResult;

    expect(result.success).toBe(true);
    expect(result.contact).toMatchObject({
      patientId: PATIENT_ID,
      status: "contacted",
      contactedAt: "2026-10-01T15:00:00.000Z",
    });
    const payload = contacts.upsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      patient_id: PATIENT_ID,
      status: "contacted",
      created_by: ACTOR_USER_ID,
    });
    expect(payload.contacted_at).toBeTruthy();
    expect(contacts.upsert.mock.calls[0]?.[1]).toEqual({
      onConflict: "patient_id,round_date",
    });
  });

  it("la segunda marca devuelve el mismo registro sin duplicar", async () => {
    const patients = buildQuery({ data: patientRow(), error: null });
    const firstUpsert = buildQuery({ data: contactRow(), error: null });
    const secondUpsert = buildQuery({ data: contactRow({ note: "segundo intento" }), error: null });
    mockTablesByQueue(from, {
      patients: [patients, patients],
      follow_up_contacts: [firstUpsert, secondUpsert],
    });

    const first = (await execute({ patientId: PATIENT_ID }, discordCtx())) as MarkResult;
    const second = (await execute({ patientId: PATIENT_ID }, discordCtx())) as MarkResult;

    expect(first.contact?.id).toBe(second.contact?.id);
    // El upsert se resuelve por la clave compuesta: no crea una fila nueva.
    expect(secondUpsert.upsert.mock.calls[0]?.[1]).toEqual({
      onConflict: "patient_id,round_date",
    });
  });

  it("un paciente fuera de la ronda falla sin escribir", async () => {
    listDailyFollowUpCases.mockResolvedValue([]);
    loadFollowUpContactsForRound.mockResolvedValue([]);
    const patients = buildQuery({ data: patientRow(), error: null });
    mockTablesByQueue(from, { patients: [patients] });

    const result = (await execute({ patientId: PATIENT_ID }, discordCtx())) as MarkResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain("lista");
  });

  it("sin actor mapeado falla cerrado sin leer ni escribir", async () => {
    authorizedEnv({ actor: false });
    mockTablesByQueue(from, {});

    const result = (await execute({ patientId: PATIENT_ID }, discordCtx())) as MarkResult;

    expect(result).toMatchObject({ success: false, error: CLARA_ACTOR_REFUSAL });
    expect(from).not.toHaveBeenCalled();
    expect(listDailyFollowUpCases).not.toHaveBeenCalled();
  });

  it("sin autorización falla cerrado sin leer ni escribir", async () => {
    from.mockImplementation(() => {
      throw new Error("Sin autorización no se consulta Supabase");
    });

    const result = (await execute(
      { patientId: PATIENT_ID },
      discordCtx("000000000000000000"),
    )) as MarkResult;

    expect(result).toMatchObject({ success: false, error: CLARA_ACCESS_REFUSAL });
    expect(from).not.toHaveBeenCalled();
    expect(listDailyFollowUpCases).not.toHaveBeenCalled();
  });

  it("una nota mayor a 1000 caracteres se reporta como error de tool", async () => {
    const patients = buildQuery({ data: patientRow(), error: null });
    mockTablesByQueue(from, { patients: [patients] });

    const result = (await execute(
      { patientId: PATIENT_ID, note: "x".repeat(1001) },
      discordCtx(),
    )) as MarkResult;

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("el estado de contacto se escribe solo en follow_up_contacts", async () => {
    const patients = buildQuery({ data: patientRow(), error: null });
    const contacts = buildQuery({ data: contactRow(), error: null });
    mockTablesByQueue(from, {
      patients: [patients],
      follow_up_contacts: [contacts],
    });

    await execute({ patientId: PATIENT_ID, note: "llamada" }, discordCtx());

    const tables = from.mock.calls.map((call) => call[0]);
    expect(tables).toContain("follow_up_contacts");
    expect(tables).not.toContain("follow_up_message_drafts");
  });
});
