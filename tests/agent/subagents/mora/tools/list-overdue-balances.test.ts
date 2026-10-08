// @vitest-environment node
/**
 * Unit tests for the `list-overdue-balances` agent tool.
 *
 * Guardrails (design §Tool 2, threat-matrix RED test 3):
 *   3. PII isolation — the tool MUST return ONLY the trusted caller's own
 *      `isPastDue` plans. A fixture with two patients' overdue plans MUST
 *      NEVER surface the other patient's rows. `listAccountsReceivable` is
 *      staff-only and MUST NOT be called from this path.
 *   2. Verified contact — without a trusted WhatsApp phone the tool MUST
 *      return `{ success: false, error }` and MUST NOT query the database.
 *
 * Mock pattern mirrors `tests/agent/subagents/mora/tools/get-patient-balance.test.ts` and
 * `src/lib/admin/__tests__/accounts-receivable.test.ts`.
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
  is: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  _result: QueryResult;
};

const getSupabaseAdmin = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin }));

const { default: tool } = await import("../../../../../agents/eva/agent/subagents/mora/tools/list-overdue-balances");
const execute = tool.execute as (
  input: { thresholdDays?: number },
  ctx?: unknown,
) => Promise<unknown>;

const TRUSTED_PHONE = "+5215512345678";
const PATIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_PATIENT_ID = "550e8400-e29b-41d4-a716-446655440001";

const trustedCtx = {
  session: {
    auth: {
      current: {
        attributes: {
          trustedContactSource: "whatsapp",
          trustedPatientPhone: TRUSTED_PHONE,
        },
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
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    _result: { data: [], error: null },
  };
  query.order.mockImplementation(() => Promise.resolve(query._result));
  query.maybeSingle.mockImplementation(() => Promise.resolve(query._result));
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

function planRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "660e8400-e29b-41d4-a716-446655440000",
    patient_id: PATIENT_ID,
    name: "Ortodoncia",
    status: "accepted",
    total_amount: 1000,
    accepted_at: "2026-08-30T12:00:00.000Z",
    created_at: "2026-08-01T12:00:00.000Z",
    ...overrides,
  };
}

function paymentRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "770e8400-e29b-41d4-a716-446655440000",
    patient_id: PATIENT_ID,
    treatment_plan_id: "660e8400-e29b-41d4-a716-446655440000",
    amount: 0,
    paid_at: "2026-09-20T10:00:00.000Z",
    voided_at: null,
    ...overrides,
  };
}

describe("list-overdue-balances tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses the lookup when no trusted WhatsApp phone is present", async () => {
    const { from } = mockTablesByQueue({});

    await expect(execute({})).resolves.toEqual({
      success: false,
      error:
        "Por seguridad no puedo consultar saldos sin un WhatsApp vinculado al paciente.",
    });

    expect(from).not.toHaveBeenCalled();
  });

  it("never accepts a chat-typed phone as the patient phone", () => {
    expect(JSON.stringify(tool.inputSchema)).not.toContain("patientPhone");
    expect(JSON.stringify(tool.inputSchema)).not.toContain("phone");
  });

  it("returns an empty overduePlans list when the trusted WhatsApp is not linked to a patient", async () => {
    const patients = buildQuery();
    patients._result = { data: null, error: null };
    const { from } = mockTablesByQueue({ patients: [patients] });

    const result = (await execute({}, trustedCtx)) as {
      success: boolean;
      patientFound: boolean;
      overduePlans: unknown[];
    };

    expect(result.success).toBe(true);
    expect(result.patientFound).toBe(false);
    expect(result.overduePlans).toEqual([]);
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("patients");
  });

  it("returns only the trusted caller's own overdue plans (no PII leak from another patient)", async () => {
    // Two patients in the DB; the other patient's overdue plan MUST NOT leak
    // through this tool. We seed both patients' plans in the fixture and
    // simulate Supabase's `.eq('patient_id', X)` filter at the SQL layer.
    const allPlans = [
      planRow({
        id: "mine-overdue",
        patient_id: PATIENT_ID,
        name: "Mi plan vencido",
        total_amount: 800,
        accepted_at: "2026-08-30T12:00:00.000Z",
      }),
      planRow({
        id: "mine-current",
        patient_id: PATIENT_ID,
        name: "Mi plan al corriente",
        total_amount: 200,
        accepted_at: "2026-09-25T12:00:00.000Z",
      }),
      planRow({
        id: "theirs-overdue",
        patient_id: OTHER_PATIENT_ID,
        name: "Plan ajeno vencido",
        total_amount: 5000,
        accepted_at: "2026-07-15T12:00:00.000Z",
      }),
    ];
    const plans = buildQuery();
    plans._result = { data: allPlans, error: null };
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

    const payments = buildQuery();
    payments._result = { data: [], error: null };

    const patients = buildQuery();
    patients._result = {
      data: { id: PATIENT_ID, full_name: "Mía", phone_e164: TRUSTED_PHONE },
      error: null,
    };

    mockTablesByQueue({
      patients: [patients],
      treatment_plans: [plans],
      payments: [payments],
    });

    const result = (await execute({}, trustedCtx)) as {
      success: boolean;
      patientFound: boolean;
      overduePlans: Array<{
        treatmentPlanId: string;
        name: string;
        balance: number;
        isPastDue: boolean;
      }>;
      message: string;
    };

    expect(result.success).toBe(true);
    expect(result.patientFound).toBe(true);

    // The other patient's plan MUST NEVER appear.
    const otherPatientPlan = result.overduePlans.find(
      (p) => p.treatmentPlanId === "theirs-overdue",
    );
    expect(otherPatientPlan).toBeUndefined();

    // Only the caller's overdue plan appears; the current plan (within
    // threshold) is filtered out by the same logic that computes isPastDue.
    expect(result.overduePlans).toHaveLength(1);
    expect(result.overduePlans[0]).toMatchObject({
      treatmentPlanId: "mine-overdue",
      name: "Mi plan vencido",
      isPastDue: true,
      balance: 800,
    });
  });

  it("excludes zero-balance and not-past-due plans from the overdue list", async () => {
    const plans = buildQuery();
    plans._result = {
      data: [
        planRow({
          id: "fully-paid",
          name: "Pagado",
          total_amount: 500,
          accepted_at: "2026-08-01T12:00:00.000Z",
        }),
        planRow({
          id: "fresh-plan",
          name: "Reciente",
          total_amount: 300,
          accepted_at: "2026-09-25T12:00:00.000Z",
        }),
      ],
      error: null,
    };
    const payments = buildQuery();
    payments._result = {
      data: [paymentRow({ treatment_plan_id: "fully-paid", amount: 500 })],
      error: null,
    };
    const patients = buildQuery();
    patients._result = {
      data: { id: PATIENT_ID, full_name: "Sin mora", phone_e164: TRUSTED_PHONE },
      error: null,
    };
    mockTablesByQueue({
      patients: [patients],
      treatment_plans: [plans],
      payments: [payments],
    });

    const result = (await execute({}, trustedCtx)) as {
      overduePlans: Array<{ treatmentPlanId: string; isPastDue: boolean; balance: number }>;
    };

    expect(result.overduePlans).toEqual([]);
  });

  it("honours a custom thresholdDays when computing isPastDue", async () => {
    // Plan accepted 5 days ago, threshold = 3 → overdue.
    const plans = buildQuery();
    plans._result = {
      data: [
        planRow({
          accepted_at: "2026-09-25T12:00:00.000Z",
          total_amount: 500,
        }),
      ],
      error: null,
    };
    const payments = buildQuery();
    payments._result = { data: [], error: null };
    const patients = buildQuery();
    patients._result = {
      data: { id: PATIENT_ID, full_name: "Con mora", phone_e164: TRUSTED_PHONE },
      error: null,
    };
    mockTablesByQueue({
      patients: [patients],
      treatment_plans: [plans],
      payments: [payments],
    });

    const result = (await execute({ thresholdDays: 3 }, trustedCtx)) as {
      overduePlans: Array<{ isPastDue: boolean; balance: number }>;
    };

    expect(result.overduePlans).toHaveLength(1);
    expect(result.overduePlans[0].isPastDue).toBe(true);
    expect(result.overduePlans[0].balance).toBe(500);
  });
});