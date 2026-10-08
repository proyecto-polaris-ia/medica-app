// @vitest-environment node
/**
 * Unit tests for the `find-patient` agent tool (issue #159).
 *
 * Guardrail ("Patient Resolution by Named Reference"): the tool returns
 * identity data only — never financial data — and never resolves an ambiguous
 * patient by itself.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const from = vi.fn();
const getSupabaseAdmin = vi.fn(() => ({ from }));

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin }));

const { default: tool } = await import("../../../../agents/mora/agent/tools/find-patient");
const { DOCTOR_ACCESS_REFUSAL } = await import("../../../../agents/mora/agent/access");

const execute = tool.execute as (
  input: { patientPhone?: string; patientName?: string },
  ctx?: unknown,
) => Promise<unknown>;

const DOCTOR_DISCORD_ID = "111222333444555666";
const PATIENT_ID = "550e8400-e29b-41d4-a716-446655440000";

const doctorCtx = {
  session: {
    auth: {
      current: {
        principalId: DOCTOR_DISCORD_ID,
        principalType: "user",
        authenticator: "discord",
        attributes: {},
      },
      initiator: null,
    },
  },
};

function query(result: unknown, terminal: "maybeSingle" | "list" = "list") {
  const q = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    _result: { data: result, error: null } as unknown,
  };
  if (terminal === "maybeSingle") {
    q.maybeSingle.mockImplementation(() => Promise.resolve(q._result));
  } else {
    q.limit.mockImplementation(() => Promise.resolve(q._result));
  }
  return q;
}

function mockPatients(...queries: ReturnType<typeof query>[]): void {
  (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    from: (table: string) => {
      if (table !== "patients") throw new Error(`Unexpected table query: ${table}`);
      const q = queries.shift();
      if (!q) throw new Error("No more patients queries queued");
      return q;
    },
  }));
}

describe("find-patient tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MORA_DISCORD_DOCTOR_IDS = DOCTOR_DISCORD_ID;
  });

  it("refuses an unauthorized doctor without querying the database", async () => {
    const outsiderCtx = {
      session: { auth: { current: { principalId: "1", principalType: "user", authenticator: "discord" } } },
    };

    await expect(execute({ patientName: "Ana" }, outsiderCtx)).resolves.toMatchObject({
      success: false,
      error: DOCTOR_ACCESS_REFUSAL,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("resolves a patient by registered phone with identity data only", async () => {
    mockPatients(query({ id: PATIENT_ID, full_name: "Ana López", phone_e164: "+5215512345678" }, "maybeSingle"));

    const result = (await execute({ patientPhone: "+5215512345678" }, doctorCtx)) as {
      success: boolean;
      resolved: boolean;
      patient?: Record<string, unknown>;
    };

    expect(result.success).toBe(true);
    expect(result.resolved).toBe(true);
    expect(result.patient).toEqual({
      id: PATIENT_ID,
      fullName: "Ana López",
      phoneE164: "+5215512345678",
    });
  });

  it("returns candidates without financial data for an ambiguous name", async () => {
    mockPatients(
      query(
        [
          { id: PATIENT_ID, full_name: "Ana López", phone_e164: "+5215512345678" },
          { id: "550e8400-e29b-41d4-a716-446655440001", full_name: "Ana Ruiz", phone_e164: "+5215587654321" },
        ],
        "list",
      ),
    );

    const result = (await execute({ patientName: "Ana" }, doctorCtx)) as {
      success: boolean;
      resolved: boolean;
      candidates: Array<Record<string, unknown>>;
      message: string;
    };

    expect(result.success).toBe(true);
    expect(result.resolved).toBe(false);
    expect(result.candidates).toHaveLength(2);
    // Identity fields only — no balance, plan, or payment fields ever.
    expect(JSON.stringify(result.candidates)).not.toMatch(/balance|plan|payment|saldo/i);
    expect(result.message).toContain("teléfono registrado");
  });

  it("reports a clean not-found without leaking any patient data", async () => {
    mockPatients(query([], "list"));

    const result = (await execute({ patientName: "Nadie" }, doctorCtx)) as {
      success: boolean;
      resolved: boolean;
      candidates: unknown[];
    };

    expect(result.success).toBe(true);
    expect(result.resolved).toBe(false);
    expect(result.candidates).toEqual([]);
  });
});
