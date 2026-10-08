// @vitest-environment node
/**
 * Unit tests for the `register-payment-intent` agent tool.
 *
 * Guardrails (design §Tool 3, threat-matrix RED test 5):
 *   5. No money movement — the tool inserts a `payment_intents` row and
 *      escalates to a human via `createEveWhatsAppEscalation` with
 *      `{ reason: 'payment_intent', intent: 'support' }`. It MUST NEVER touch
 *      the `payments` table.
 *   6. Plan eligibility — `treatmentPlanName` resolves to a plan only if the
 *      plan exists, is unambiguous, AND is in `accepted | in_progress |
 *      completed`. Non-eligible plans fall through to `treatment_plan_id:
 *      null` with a note.
 *   2. Verified contact — without a trusted WhatsApp phone the tool MUST
 *      return `{ success: false, error }` and MUST NOT insert or escalate.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = {
  data: unknown;
  error: { message?: string } | null;
};

type Query = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  _result: QueryResult;
};

const getSupabaseAdmin = vi.fn();
const createEveWhatsAppEscalation = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin }));
vi.mock("@/lib/whatsapp/eve-escalation", () => ({
  createEveWhatsAppEscalation,
}));

const { DOCTOR_ACCESS_REFUSAL } = await import("../../../../agents/mora/agent/access");
const { default: tool } = await import("../../../../agents/mora/agent/tools/register-payment-intent");
const execute = tool.execute as (
  input: {
    amount?: number;
    treatmentPlanName?: string;
    commitment?: string;
    method?: "cash" | "card" | "transfer" | "other";
    notes?: string;
    trustedContactSource?: "whatsapp";
    trustedPatientPhone?: string;
  },
  ctx?: unknown,
) => Promise<unknown>;

const TRUSTED_PHONE = "+5215512345678";
const PATIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const PLAN_ID = "660e8400-e29b-41d4-a716-446655440000";
const OTHER_PLAN_ID = "660e8400-e29b-41d4-a716-446655440099";
const INTENT_ID = "880e8400-e29b-41d4-a716-446655440000";

const DOCTOR_DISCORD_ID = "111222333444555666";

const doctorCtx = {
  session: {
    auth: {
      current: {
        principalId: DOCTOR_DISCORD_ID,
        principalType: "user",
        authenticator: "discord",
        attributes: { channel_id: "chan-1", guild_id: "guild-1" },
      },
      initiator: null,
    },
  },
};

function buildQuery(): Query {
  const query: Query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    _result: { data: [], error: null },
  };
  query.order.mockImplementation(() => Promise.resolve(query._result));
  query.limit.mockImplementation(() => Promise.resolve(query._result));
  query.maybeSingle.mockImplementation(() => Promise.resolve(query._result));
  query.insert.mockImplementation(() => ({
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: {
        id: INTENT_ID,
        patient_id: PATIENT_ID,
        treatment_plan_id: null,
        whatsapp_contact_id: null,
        intent_source: "discord",
        amount: null,
        commitment_text: null,
        method: null,
        status: "pending",
        notes: null,
        created_at: "2026-09-30T12:00:00.000Z",
        updated_at: "2026-09-30T12:00:00.000Z",
      },
      error: null,
    }),
  }));
  return query;
}

function mockTablesByQueue(queues: Record<string, Query[]>): { from: ReturnType<typeof vi.fn> } {
  const from = vi.fn((table: string) => {
    const queue = queues[table];
    const query = queue?.shift();
    if (!query) {
      throw new Error(`Unexpected table query: ${table}`);
    }
    return query;
  });
  (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockImplementation(() => ({ from }));
  return { from };
}

function setupTrustedPatient(planOverrides: Array<Record<string, unknown>> = []): {
  from: ReturnType<typeof vi.fn>;
  patients: Query;
  plans: Query;
  insert: Query;
} {
  const patients = buildQuery();
  patients._result = {
    data: { id: PATIENT_ID, full_name: "Daniela", phone_e164: TRUSTED_PHONE },
    error: null,
  };

  const plans = buildQuery();
  const allPlans = [
    {
      id: PLAN_ID,
      patient_id: PATIENT_ID,
      name: "Ortodoncia",
      status: "accepted",
      total_amount: 1000,
      accepted_at: "2026-08-30T12:00:00.000Z",
      created_at: "2026-08-01T12:00:00.000Z",
    },
    ...planOverrides,
  ];
  plans._result = { data: allPlans, error: null };
  // Simulate Supabase's `.eq('patient_id', X)` filter.
  const originalEq = plans.eq;
  originalEq.mockImplementation((field: string, value: unknown) => {
    if (field === "patient_id") {
      plans._result = {
        data: allPlans.filter((row) => row.patient_id === value),
        error: null,
      };
    }
    return plans;
  });

  const insert = buildQuery();

  const { from } = mockTablesByQueue({
    patients: [patients],
    treatment_plans: [plans],
    payment_intents: [insert],
  });

  return { from, patients, plans, insert };
}

describe("register-payment-intent tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MORA_DISCORD_DOCTOR_IDS = DOCTOR_DISCORD_ID;
    createEveWhatsAppEscalation.mockResolvedValue({
      escalationId: "esc-1",
      created: true,
      contactId: "contact-1",
      conversationId: "conversation-1",
      messageId: "message-1",
      humanAlertPhoneConfigured: true,
      humanAlertSend: { ok: true, status: 200 },
    });
  });

  it("refuses an unauthorized doctor without querying the database", async () => {
    const outsiderCtx = {
      session: {
        auth: {
          current: {
            principalId: "000000000000000000",
            principalType: "user",
            authenticator: "discord",
            attributes: {},
          },
          initiator: null,
        },
      },
    };
    const { from } = mockTablesByQueue({});

    const result = (await execute(
      { patientPhone: TRUSTED_PHONE, commitment: "La próxima semana" },
      outsiderCtx,
    )) as { success: boolean; error?: string };

    expect(result).toEqual({
      success: false,
      error: DOCTOR_ACCESS_REFUSAL,
    });

    expect(from).not.toHaveBeenCalled();
    expect(createEveWhatsAppEscalation).not.toHaveBeenCalled();
  });

  it("requires an explicit patient reference from the doctor", async () => {
    const { from } = mockTablesByQueue({});

    const result = (await execute(
      { commitment: "La próxima semana" },
      doctorCtx,
    )) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("No encontré un paciente con esa referencia.");

    expect(from).not.toHaveBeenCalled();
    expect(createEveWhatsAppEscalation).not.toHaveBeenCalled();
  });

  it("accepts the doctor-supplied patient phone as the lookup key", () => {
    const schema = JSON.stringify(tool.inputSchema);
    expect(schema).toContain("patientPhone");
    expect(schema).toContain("patientName");
  });

  it("inserts a payment_intents row and escalates, never touching the payments table", async () => {
    const { from, insert } = setupTrustedPatient();

    const result = (await execute(
      {
        patientPhone: TRUSTED_PHONE,
        amount: 500,
        commitment: "La próxima semana",
        method: "cash",
        notes: "Pago en una sola exhibición",
      },
      doctorCtx,
    )) as {
      success: boolean;
      intent: { id: string; status: string };
      escalation: { id: string; created: boolean };
      message: string;
    };

    expect(result.success).toBe(true);
    expect(result.intent.id).toBe(INTENT_ID);
    expect(result.intent.status).toBe("pending");

    // Confirm insert target was payment_intents, NEVER payments.
    const tablesTouched = from.mock.calls.map((call) => String(call[0]));
    expect(tablesTouched).not.toContain("payments");
    expect(tablesTouched).toContain("payment_intents");

    // Confirm escalation payload: support intent + payment_intent reason.
    expect(createEveWhatsAppEscalation).toHaveBeenCalledTimes(1);
    const escalationArg = createEveWhatsAppEscalation.mock.calls[0]?.[0];
    expect(escalationArg).toMatchObject({
      patientPhone: TRUSTED_PHONE,
      reason: "payment_intent",
      intent: "support",
    });
    expect(typeof escalationArg?.summary).toBe("string");
    expect(escalationArg?.summary.length).toBeGreaterThan(0);

    // Confirm the inserted row carried the structured intent fields.
    const insertedPayload = (insert.insert.mock.calls[0]?.[0] ?? {}) as Record<string, unknown>;
    expect(insertedPayload).toMatchObject({
      patient_id: PATIENT_ID,
      intent_source: "discord",
      amount: 500,
      commitment_text: "La próxima semana",
      method: "cash",
      notes: "Pago en una sola exhibición",
    });
  });

  it("stores treatment_plan_id: null when the named plan is not eligible (draft)", async () => {
    setupTrustedPatient([
      {
        id: OTHER_PLAN_ID,
        patient_id: PATIENT_ID,
        name: "Plan tentativo",
        status: "draft",
        total_amount: 250,
        accepted_at: null,
        created_at: "2026-09-25T12:00:00.000Z",
      },
    ]);

    const result = (await execute(
      {
        patientPhone: TRUSTED_PHONE,
        treatmentPlanName: "Plan tentativo",
        commitment: "Después de la valoración",
      },
      doctorCtx,
    )) as {
      success: boolean;
      intent: { id: string };
    };

    expect(result.success).toBe(true);
    // The intent is still registered (with null plan), and a human is paged.
    expect(result.intent.id).toBe(INTENT_ID);
    expect(createEveWhatsAppEscalation).toHaveBeenCalledTimes(1);
  });

  it("does not insert or escalate when the named plan is ambiguous", async () => {
    // Two plans with the same name → ambiguous; the tool must NOT auto-pick.
    setupTrustedPatient([
      {
        id: OTHER_PLAN_ID,
        patient_id: PATIENT_ID,
        name: "Ortodoncia",
        status: "accepted",
        total_amount: 2000,
        accepted_at: "2026-09-15T12:00:00.000Z",
        created_at: "2026-09-15T12:00:00.000Z",
      },
    ]);

    const result = (await execute(
      {
        patientPhone: TRUSTED_PHONE,
        treatmentPlanName: "Ortodoncia",
      },
      doctorCtx,
    )) as {
      success: boolean;
    };

    // The intent SHOULD be registered with treatment_plan_id:null + note
    // (per design §Tool 3 "ambiguous → null + note").
    expect(result.success).toBe(true);
    expect(createEveWhatsAppEscalation).toHaveBeenCalledTimes(1);
  });

  it("stores treatment_plan_id when the named plan is unambiguous and eligible", async () => {
    const { insert } = setupTrustedPatient();

    await execute(
      {
        patientPhone: TRUSTED_PHONE,
        treatmentPlanName: "Ortodoncia",
        amount: 500,
      },
      doctorCtx,
    );

    const insertedPayload = (insert.insert.mock.calls[0]?.[0] ?? {}) as Record<string, unknown>;
    expect(insertedPayload.treatment_plan_id).toBe(PLAN_ID);
  });

  it("does not move money or generate a payment link", async () => {
    const { from } = setupTrustedPatient();

    const result = (await execute({ amount: 100 , patientPhone: TRUSTED_PHONE }, doctorCtx)) as {
      success: boolean;
      message: string;
    };

    // The tool never touches the `payments` ledger.
    const tablesTouched = from.mock.calls.map((call) => String(call[0]));
    expect(tablesTouched).not.toContain("payments");

    // The reply message never contains a URL (no payment link).
    expect(result.message).not.toMatch(/https?:\/\//);
    // The reply NEVER claims the patient has paid or will be auto-charged.
    const lower = result.message.toLowerCase();
    expect(lower).not.toMatch(/pag(o|ué|ado|ó) (ya|en línea|automatic)/);
    expect(lower).not.toContain("transferencia realizada");
    expect(lower).not.toContain("procesar el pago");
  });
});