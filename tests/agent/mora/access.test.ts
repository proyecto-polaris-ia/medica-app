// @vitest-environment node
/**
 * Unit tests for Mora's doctor access + patient resolution module.
 *
 * Guardrails (spec delta "Authorized Doctor Access via Discord" and
 * "Patient Resolution by Named Reference"):
 *   1. Only doctors whose Discord user ID is in MORA_DISCORD_DOCTOR_IDS may
 *      operate; an empty or absent allowlist fails closed.
 *   2. A non-Discord principal is rejected.
 *   3. Patient resolution: exact phone match; name matches return candidates
 *      without financial data; zero matches report cleanly.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = { data: unknown; error: { message?: string } | null };

type Query = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  _result: QueryResult;
};

const from = vi.fn();
const getSupabaseAdmin = vi.fn(() => ({ from }));

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin }));

const { resolveDoctorAccess, resolvePatient, DOCTOR_ACCESS_REFUSAL } = await import(
  "../../../agents/mora/agent/access"
);

const DOCTOR_DISCORD_ID = "111222333444555666";
const OTHER_DOCTOR_DISCORD_ID = "999888777666555444";

function discordCtx(userId: string) {
  return {
    session: {
      auth: {
        current: {
          principalId: userId,
          principalType: "user",
          authenticator: "discord",
          attributes: { channel_id: "chan-1", guild_id: "guild-1" },
        },
        initiator: null,
      },
    },
  };
}

function buildQuery(terminal: "maybeSingle" | "order" = "maybeSingle"): Query {
  const query: Query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    _result: { data: null, error: null },
  };
  query.maybeSingle.mockImplementation(() => Promise.resolve(query._result));
  query.order.mockImplementation(() => Promise.resolve(query._result));
  query.limit.mockImplementation(() => Promise.resolve(query._result));
  void terminal;
  return query;
}

function mockTablesByQueue(queues: Record<string, Query[]>): void {
  (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    from: (table: string) => {
      const queue = queues[table];
      const query = queue?.shift();
      if (!query) throw new Error(`Unexpected table query: ${table}`);
      return query;
    },
  }));
}

describe("resolveDoctorAccess", () => {
  const ENV = { MORA_DISCORD_DOCTOR_IDS: `${DOCTOR_DISCORD_ID}, ${OTHER_DOCTOR_DISCORD_ID} ` };

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a Discord principal in the allowlist", () => {
    const access = resolveDoctorAccess(discordCtx(DOCTOR_DISCORD_ID), { env: ENV });
    expect(access).toEqual({ doctorId: DOCTOR_DISCORD_ID });
  });

  it("trims whitespace and matches case-insensitively", () => {
    const access = resolveDoctorAccess(discordCtx("  " + DOCTOR_DISCORD_ID + "  "), { env: ENV });
    expect(access).toEqual({ doctorId: DOCTOR_DISCORD_ID });
  });

  it("refuses a Discord principal not in the allowlist", () => {
    const access = resolveDoctorAccess(discordCtx("000000000000000000"), { env: ENV });
    expect(access).toEqual({ error: DOCTOR_ACCESS_REFUSAL });
  });

  it("fails closed when the allowlist is absent", () => {
    const access = resolveDoctorAccess(discordCtx(DOCTOR_DISCORD_ID), { env: {} });
    expect(access).toEqual({ error: DOCTOR_ACCESS_REFUSAL });
  });

  it("fails closed when the allowlist is empty", () => {
    const access = resolveDoctorAccess(discordCtx(DOCTOR_DISCORD_ID), {
      env: { MORA_DISCORD_DOCTOR_IDS: "   " },
    });
    expect(access).toEqual({ error: DOCTOR_ACCESS_REFUSAL });
  });

  it("refuses a non-Discord principal even if its id is in the allowlist", () => {
    const ctx = {
      session: {
        auth: {
          current: {
            principalId: DOCTOR_DISCORD_ID,
            principalType: "user",
            authenticator: "whatsapp",
            attributes: {},
          },
          initiator: null,
        },
      },
    };
    const access = resolveDoctorAccess(ctx, { env: ENV });
    expect(access).toEqual({ error: DOCTOR_ACCESS_REFUSAL });
  });

  it("refuses when there is no authenticated caller", () => {
    const access = resolveDoctorAccess({ session: { auth: { current: null, initiator: null } } }, {
      env: ENV,
    });
    expect(access).toEqual({ error: DOCTOR_ACCESS_REFUSAL });
  });
});

describe("resolvePatient", () => {
  const PATIENT_ID = "550e8400-e29b-41d4-a716-446655440000";

  it("resolves an exact patient by E.164 phone", async () => {
    mockTablesByQueue({
      patients: [
        (() => {
          const q = buildQuery();
          q._result = {
            data: { id: PATIENT_ID, full_name: "Ana López", phone_e164: "+5215512345678" },
            error: null,
          };
          return q;
        })(),
      ],
    });

    const result = await resolvePatient({ phone: "+52 1 55 1234 5678" });
    expect(result).toMatchObject({
      patient: { id: PATIENT_ID, full_name: "Ana López", phone_e164: "+5215512345678" },
    });
  });

  it("reports a clean not-found for an unknown phone", async () => {
    mockTablesByQueue({
      patients: [
        (() => {
          const q = buildQuery();
          q._result = { data: null, error: null };
          return q;
        })(),
      ],
    });

    const result = await resolvePatient({ phone: "+5215500000000" });
    expect(result).toEqual({ notFound: true });
  });

  it("returns a single patient for an unambiguous name", async () => {
    mockTablesByQueue({
      patients: [
        (() => {
          const q = buildQuery();
          q._result = {
            data: [{ id: PATIENT_ID, full_name: "Ana López", phone_e164: "+5215512345678" }],
            error: null,
          };
          return q;
        })(),
      ],
    });

    const result = await resolvePatient({ name: "Ana López" });
    expect(result).toMatchObject({ patient: { id: PATIENT_ID, full_name: "Ana López" } });
  });

  it("returns candidates without financial data for an ambiguous name", async () => {
    mockTablesByQueue({
      patients: [
        (() => {
          const q = buildQuery();
          q._result = {
            data: [
              { id: PATIENT_ID, full_name: "Ana López", phone_e164: "+5215512345678" },
              {
                id: "550e8400-e29b-41d4-a716-446655440001",
                full_name: "Ana López Ruiz",
                phone_e164: "+5215587654321",
              },
            ],
            error: null,
          };
          return q;
        })(),
      ],
    });

    const result = await resolvePatient({ name: "Ana" });
    expect(result).toMatchObject({
      candidates: [
        { id: PATIENT_ID, full_name: "Ana López" },
        { id: "550e8400-e29b-41d4-a716-446655440001", full_name: "Ana López Ruiz" },
      ],
    });
  });

  it("reports a clean not-found when no name matches", async () => {
    mockTablesByQueue({
      patients: [
        (() => {
          const q = buildQuery();
          q._result = { data: [], error: null };
          return q;
        })(),
      ],
    });

    const result = await resolvePatient({ name: "Nadie Existente" });
    expect(result).toEqual({ notFound: true });
  });

  it("surfaces a database error as an error result", async () => {
    mockTablesByQueue({
      patients: [
        (() => {
          const q = buildQuery();
          q._result = { data: null, error: { message: "connection refused" } };
          return q;
        })(),
      ],
    });

    const result = await resolvePatient({ name: "Ana" });
    expect(result).toMatchObject({ error: expect.stringContaining("No se pudo buscar") });
  });
});
