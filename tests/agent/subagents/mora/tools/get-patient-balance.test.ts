// @vitest-environment node
/**
 * Unit tests for the `get-patient-balance` agent tool.
 *
 * Guardrails (design §Tool 1, threat-matrix RED tests):
 *   1. Eligibility — only `accepted | in_progress | completed` plans appear in the
 *      quoted balance; `draft | presented | cancelled` plans MUST be excluded.
 *   2. Verified contact — without a trusted WhatsApp phone the tool MUST return
 *      `{ success: false, error }` and MUST NOT query the database.
 *
 * The Supabase queries are mocked with the same query-builder queue pattern as
 * `src/lib/admin/__tests__/accounts-receivable.test.ts`, so eligibility
 * filtering is exercised end-to-end through `getPatientReceivableSummary`
 * (which filters plans by `.in('status', ELIGIBLE_PLAN_STATUSES)` at the SQL
 * layer).
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

const from = vi.fn();
const getSupabaseAdmin = vi.fn(() => ({ from }));

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin }));

const { default: tool } = await import("../../../../../agent/subagents/mora/tools/get-patient-balance");
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
  // Default terminal: order().then() resolves to _result
  query.order.mockImplementation(() => Promise.resolve(query._result));
  // maybeSingle is the terminal used by `findPatientByTrustedPhone`. Default
  // resolves to `_result` so callers can override per-fixture.
  query.maybeSingle.mockImplementation(() => Promise.resolve(query._result));
  return query;
}

function mockTablesByQueue(queues: Record<string, Query[]>): void {
  (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    from: (table: string) => {
      const queue = queues[table];
      const query = queue?.shift();
      if (!query) {
        throw new Error(`Unexpected table query: ${table}`);
      }
      return query;
    },
  }));
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
    amount: 250,
    paid_at: "2026-09-20T10:00:00.000Z",
    voided_at: null,
    ...overrides,
  };
}

function setupTrustedPatient(): { patients: Query; plans: Query; payments: Query } {
  const patients = buildQuery();
  // `maybeSingle()` returns a single row object (or null). Mimic the real
  // Supabase shape so the tool's `findPatientByTrustedPhone` reads `.id` /
  // `.full_name` correctly.
  patients._result = {
    data: { id: PATIENT_ID, full_name: "María López", phone_e164: TRUSTED_PHONE },
    error: null,
  };
  const plans = buildQuery();
  plans._result = { data: [planRow()], error: null };
  const payments = buildQuery();
  payments._result = { data: [paymentRow()], error: null };
  mockTablesByQueue({
    patients: [patients],
    treatment_plans: [plans],
    payments: [payments],
  });
  return { patients, plans, payments };
}

describe("get-patient-balance tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSupabaseAdmin.mockImplementation(() => ({ from }));
  });

  it("refuses the lookup when no trusted WhatsApp phone is present", async () => {
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

  it("returns patientFound=false when the trusted WhatsApp is not linked to a patient", async () => {
    const patients = buildQuery();
    patients._result = { data: null, error: null };
    mockTablesByQueue({ patients: [patients] });

    await expect(execute({}, trustedCtx)).resolves.toMatchObject({
      success: true,
      patientFound: false,
      planBalances: [],
    });

    expect(patients.eq).toHaveBeenCalledWith("phone_e164", TRUSTED_PHONE);
  });

  it("returns the DB-derived balance and per-plan balances for the trusted caller", async () => {
    // Plan accepted on 2026-09-20 with threshold 30 → not past due (10 days).
    const { patients, plans, payments } = setupTrustedPatient();
    plans._result = {
      data: [
        planRow({
          accepted_at: "2026-09-20T12:00:00.000Z",
          total_amount: 1000,
        }),
      ],
      error: null,
    };
    patients._result = {
      data: { id: PATIENT_ID, full_name: "María López", phone_e164: TRUSTED_PHONE },
      error: null,
    };

    const result = await execute({}, trustedCtx);

    expect(result).toMatchObject({
      success: true,
      patientFound: true,
      patientName: "María López",
      balance: 750,
      totalEligibleAmount: 1000,
      paidAmount: 250,
      creditAmount: 0,
      planBalances: [
        {
          treatmentPlanId: "660e8400-e29b-41d4-a716-446655440000",
          name: "Ortodoncia",
          status: "accepted",
          totalAmount: 1000,
          paidAmount: 250,
          balance: 750,
          isPastDue: false,
        },
      ],
    });

    // Confirm the eligibility filter is enforced at the SQL layer (not in JS).
    expect(plans.in).toHaveBeenCalledWith("status", [
      "accepted",
      "in_progress",
      "completed",
    ]);
    // Confirm voided payments are filtered at the SQL layer.
    expect(payments.is).toHaveBeenCalledWith("voided_at", null);
  });

  it("excludes draft, presented, and cancelled plans from the quoted balance", async () => {
    // The mock simulates the SQL `.in('status', ELIGIBLE)` filter — only the
    // eligible rows come back. The tool MUST surface exactly those rows in
    // `planBalances` and the sum MUST equal the DB-derived total (never any
    // amount from the prompt).
    const plans = buildQuery();
    plans._result = {
      data: [
        planRow({ id: "plan-accepted", name: "Aceptado", status: "accepted", total_amount: 100 }),
        planRow({ id: "plan-progress", name: "En curso", status: "in_progress", total_amount: 200 }),
        planRow({ id: "plan-completed", name: "Terminado", status: "completed", total_amount: 300 }),
      ],
      error: null,
    };
    const payments = buildQuery();
    payments._result = { data: [], error: null };
    const patients = buildQuery();
    patients._result = {
      data: { id: PATIENT_ID, full_name: "Test", phone_e164: TRUSTED_PHONE },
      error: null,
    };
    mockTablesByQueue({
      patients: [patients],
      treatment_plans: [plans],
      payments: [payments],
    });

    const result = (await execute({}, trustedCtx)) as {
      balance: number;
      totalEligibleAmount: number;
      planBalances: Array<{ status: string }>;
    };

    expect(result.planBalances.map((p) => p.status)).toEqual([
      "accepted",
      "in_progress",
      "completed",
    ]);
    expect(result.totalEligibleAmount).toBe(600);
    expect(result.balance).toBe(600);
    // No draft/presented/cancelled plan survives the eligibility filter.
    expect(
      result.planBalances.find(
        (p) =>
          p.status === "draft" ||
          p.status === "presented" ||
          p.status === "cancelled",
      ),
    ).toBeUndefined();
  });

  it("surfaces creditAmount when payments exceed eligible totals", async () => {
    const plans = buildQuery();
    plans._result = {
      data: [planRow({ total_amount: 1000, accepted_at: "2026-09-20T12:00:00.000Z" })],
      error: null,
    };
    const payments = buildQuery();
    payments._result = {
      data: [paymentRow({ amount: 1200 })],
      error: null,
    };
    const patients = buildQuery();
    patients._result = {
      data: { id: PATIENT_ID, full_name: "Crédito", phone_e164: TRUSTED_PHONE },
      error: null,
    };
    mockTablesByQueue({
      patients: [patients],
      treatment_plans: [plans],
      payments: [payments],
    });

    const result = (await execute({}, trustedCtx)) as {
      balance: number;
      creditAmount: number;
    };

    expect(result.balance).toBe(-200);
    expect(result.creditAmount).toBe(200);
  });

  it("derives the balance from getPatientReceivableSummary output, never from inputs", async () => {
    // Two patients in DB; the tool MUST only return the trusted caller's own
    // plans — the second patient's plans must never leak through this read.
    // The mock simulates Supabase's `.eq('patient_id', X)` filter so the SQL
    // filter is exercised end-to-end.
    const allPlans = [
      planRow({
        id: "mine",
        patient_id: PATIENT_ID,
        total_amount: 800,
        accepted_at: "2026-09-20T12:00:00.000Z",
      }),
      planRow({
        id: "theirs",
        patient_id: OTHER_PATIENT_ID,
        name: "Otro plan",
        total_amount: 5000,
        accepted_at: "2026-08-30T12:00:00.000Z",
      }),
    ];
    const plans = buildQuery();
    plans._result = { data: allPlans, error: null };
    // Simulate the SQL `.eq('patient_id', X)` filter by intercepting the
    // chain. When `eq("patient_id", ...)` is called, narrow the result to the
    // matching patient_id.
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
      balance: number;
      planBalances: Array<{ treatmentPlanId: string }>;
    };

    // The balance comes from getPatientReceivableSummary filtering by
    // patient_id at the Supabase layer; the test ensures the SQL eq clause is
    // applied to `treatment_plans.patient_id` so a fixture row for another
    // patient would not contaminate the caller's number.
    expect(plans.eq).toHaveBeenCalledWith("patient_id", PATIENT_ID);
    expect(
      result.planBalances.find((p) => p.treatmentPlanId === "theirs"),
    ).toBeUndefined();
    expect(result.balance).toBe(800);
  });
});