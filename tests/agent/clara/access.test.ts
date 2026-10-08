// @vitest-environment node
/**
 * Pruebas de la capa de acceso de Clara (issue #161, Fase 4).
 *
 * Guardrails (spec `clara-discord-channel` → "Allowlist fail-closed de staff y
 * doctores autorizados" y "Re-verificación de autorización en cada tool"):
 *   1. Solo los Discord user IDs presentes en `CLARA_DISCORD_STAFF_IDS` operan;
 *      allowlist ausente, vacía o en blanco falla cerrado.
 *   2. Un principal no-Discord (o que no es `user`) se rechaza.
 *   3. El actor de auditoría sale de `CLARA_DISCORD_ACTOR_MAP`; sin mapeo las
 *      lecturas siguen y las escrituras se niegan con `CLARA_ACTOR_REFUSAL`.
 *   4. `resolvePatient` resuelve por id, teléfono exacto o nombre (0 ⇒ notFound,
 *      1 ⇒ paciente, >1 ⇒ candidatos) sin datos clínicos ni financieros.
 *   5. `resolveRoundCase` exige que el paciente esté en la ronda (design §D3).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = { data: unknown; error: { message?: string } | null };

type Query = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  _result: QueryResult;
};

const from = vi.fn();
const getSupabaseAdmin = vi.fn(() => ({ from }));

const { listDailyFollowUpCasesMock, loadFollowUpContactsForRoundMock } = vi.hoisted(
  () => ({
    listDailyFollowUpCasesMock: vi.fn(),
    loadFollowUpContactsForRoundMock: vi.fn(),
  }),
);

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin }));

vi.mock("@/lib/admin/follow-up/follow-up", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/admin/follow-up/follow-up")>();
  return {
    ...actual,
    listDailyFollowUpCases: listDailyFollowUpCasesMock,
    loadFollowUpContactsForRound: loadFollowUpContactsForRoundMock,
  };
});

import type { FollowUpContact } from "@/lib/admin/follow-up/types";

const {
  CLARA_ACCESS_REFUSAL,
  CLARA_ACTOR_REFUSAL,
  parseActorMap,
  parseStaffAllowlist,
  requireClaraActor,
  resolveClaraAccess,
  resolvePatient,
  resolveRoundCase,
  buildPatientNotResolvedError,
} = await import("../../../agents/clara/agent/access");

const STAFF_DISCORD_ID = "111222333444555666";
const OTHER_STAFF_DISCORD_ID = "234567890123456789";
const ACTOR_USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const PATIENT_ID = "6f9619ff-8b86-d011-b42d-00cf4fc964ff";
const OTHER_PATIENT_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const ENV = {
  CLARA_DISCORD_STAFF_IDS: `${STAFF_DISCORD_ID}, ${OTHER_STAFF_DISCORD_ID} `,
};

function discordCtx(userId: string, principalType = "user") {
  return {
    session: {
      auth: {
        current: {
          principalId: userId,
          principalType,
          authenticator: "discord",
          attributes: { channel_id: "chan-1", guild_id: "guild-1" },
        },
        initiator: null,
      },
    },
  };
}

function buildQuery(): Query {
  const query: Query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    _result: { data: null, error: null },
  };
  query.maybeSingle.mockImplementation(() => Promise.resolve(query._result));
  query.limit.mockImplementation(() => Promise.resolve(query._result));
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

function buildContact(patientId: string, roundDate: string): FollowUpContact {
  return {
    id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    patientId,
    roundDate,
    status: "contacted",
    contactedAt: `${roundDate}T18:00:00.000Z`,
    dismissedAt: null,
    note: null,
    createdBy: ACTOR_USER_ID,
    createdAt: `${roundDate}T18:00:00.000Z`,
    updatedAt: `${roundDate}T18:00:00.000Z`,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listDailyFollowUpCasesMock.mockResolvedValue([]);
  loadFollowUpContactsForRoundMock.mockResolvedValue([]);
});

describe("parseStaffAllowlist", () => {
  it("normaliza mayúsculas, espacios y entradas vacías", () => {
    const allowlist = parseStaffAllowlist(` ${STAFF_DISCORD_ID} ,, ${OTHER_STAFF_DISCORD_ID} `);
    expect([...allowlist].sort()).toEqual(
      [STAFF_DISCORD_ID, OTHER_STAFF_DISCORD_ID].sort(),
    );
  });

  it("devuelve un set vacío sin variable o con solo espacios", () => {
    expect(parseStaffAllowlist(undefined).size).toBe(0);
    expect(parseStaffAllowlist("   ,  , ").size).toBe(0);
  });
});

describe("parseActorMap", () => {
  it("mapea discord id a UUID y normaliza la clave", () => {
    const map = parseActorMap(` ${STAFF_DISCORD_ID.toUpperCase()} = ${ACTOR_USER_ID} `);
    expect(map.get(STAFF_DISCORD_ID)).toBe(ACTOR_USER_ID);
  });

  it("ignora entradas mal formadas y UUID inválidos", () => {
    const map = parseActorMap(
      `${STAFF_DISCORD_ID}=no-es-uuid, ${OTHER_STAFF_DISCORD_ID}=${ACTOR_USER_ID}, soloClave=, =vacío`,
    );
    expect(map.has(STAFF_DISCORD_ID)).toBe(false);
    expect(map.get(OTHER_STAFF_DISCORD_ID)).toBe(ACTOR_USER_ID);
    expect(map.size).toBe(1);
  });
});

describe("resolveClaraAccess", () => {
  it("acepta un principal de Discord en la allowlist", () => {
    const access = resolveClaraAccess(discordCtx(STAFF_DISCORD_ID), { env: ENV });
    expect(access).toEqual({ discordId: STAFF_DISCORD_ID, actorUserId: null });
  });

  it("normaliza espacios y mayúsculas del principal", () => {
    const access = resolveClaraAccess(discordCtx(`  ${STAFF_DISCORD_ID}  `), {
      env: ENV,
    });
    expect(access).toEqual({ discordId: STAFF_DISCORD_ID, actorUserId: null });
  });

  it("resuelve el actor de auditoría desde el mapa", () => {
    const access = resolveClaraAccess(discordCtx(STAFF_DISCORD_ID), {
      env: { ...ENV, CLARA_DISCORD_ACTOR_MAP: `${STAFF_DISCORD_ID}=${ACTOR_USER_ID}` },
    });
    expect(access).toEqual({ discordId: STAFF_DISCORD_ID, actorUserId: ACTOR_USER_ID });
  });

  it("deja actorUserId en null cuando el mapa no tiene entrada", () => {
    const access = resolveClaraAccess(discordCtx(STAFF_DISCORD_ID), {
      env: { ...ENV, CLARA_DISCORD_ACTOR_MAP: `${OTHER_STAFF_DISCORD_ID}=${ACTOR_USER_ID}` },
    });
    expect(access).toEqual({ discordId: STAFF_DISCORD_ID, actorUserId: null });
  });

  it("ignora un UUID inválido del mapa", () => {
    const access = resolveClaraAccess(discordCtx(STAFF_DISCORD_ID), {
      env: { ...ENV, CLARA_DISCORD_ACTOR_MAP: `${STAFF_DISCORD_ID}=discord-${STAFF_DISCORD_ID}` },
    });
    expect(access).toEqual({ discordId: STAFF_DISCORD_ID, actorUserId: null });
  });

  it("falla cerrado sin allowlist configurada", () => {
    expect(resolveClaraAccess(discordCtx(STAFF_DISCORD_ID), { env: {} })).toEqual({
      error: CLARA_ACCESS_REFUSAL,
    });
  });

  it("falla cerrado con allowlist vacía o en blanco", () => {
    expect(
      resolveClaraAccess(discordCtx(STAFF_DISCORD_ID), {
        env: { CLARA_DISCORD_STAFF_IDS: "" },
      }),
    ).toEqual({ error: CLARA_ACCESS_REFUSAL });
    expect(
      resolveClaraAccess(discordCtx(STAFF_DISCORD_ID), {
        env: { CLARA_DISCORD_STAFF_IDS: "  , ,  " },
      }),
    ).toEqual({ error: CLARA_ACCESS_REFUSAL });
  });

  it("refuse un ID fuera de la allowlist", () => {
    expect(
      resolveClaraAccess(discordCtx("000000000000000000"), { env: ENV }),
    ).toEqual({ error: CLARA_ACCESS_REFUSAL });
  });

  it("refuse un principal que no viene de Discord", () => {
    const ctx = {
      session: {
        auth: {
          current: {
            principalId: STAFF_DISCORD_ID,
            principalType: "user",
            authenticator: "whatsapp",
            attributes: {},
          },
          initiator: null,
        },
      },
    };
    expect(resolveClaraAccess(ctx, { env: ENV })).toEqual({
      error: CLARA_ACCESS_REFUSAL,
    });
  });

  it("refuse un principalType distinto de user", () => {
    expect(
      resolveClaraAccess(discordCtx(STAFF_DISCORD_ID, "service"), { env: ENV }),
    ).toEqual({ error: CLARA_ACCESS_REFUSAL });
  });

  it("refuse cuando no hay llamador autenticado", () => {
    expect(
      resolveClaraAccess({ session: { auth: { current: null, initiator: null } } }, {
        env: ENV,
      }),
    ).toEqual({ error: CLARA_ACCESS_REFUSAL });
  });

  it("refuse cuando el principal autorizado no tiene actor mapeado al escribir", () => {
    const access = resolveClaraAccess(discordCtx(STAFF_DISCORD_ID), { env: ENV });
    expect(access).toEqual({ discordId: STAFF_DISCORD_ID, actorUserId: null });
    if ("error" in access) throw new Error("expected an authorized access");
    expect(requireClaraActor(access)).toEqual({ error: CLARA_ACTOR_REFUSAL });
  });

  it("no muta process.env cuando el entorno se inyecta", () => {
    delete process.env.CLARA_DISCORD_STAFF_IDS;
    resolveClaraAccess(discordCtx(STAFF_DISCORD_ID), { env: ENV });
    expect(process.env.CLARA_DISCORD_STAFF_IDS).toBeUndefined();
  });
});

describe("requireClaraActor", () => {
  it("devuelve el actor cuando es un UUID válido", () => {
    expect(requireClaraActor({ discordId: STAFF_DISCORD_ID, actorUserId: ACTOR_USER_ID })).toEqual(
      { actorUserId: ACTOR_USER_ID },
    );
  });

  it("se niega sin mapeo", () => {
    expect(requireClaraActor({ discordId: STAFF_DISCORD_ID, actorUserId: null })).toEqual({
      error: CLARA_ACTOR_REFUSAL,
    });
  });

  it("se niega con un UUID inválido", () => {
    expect(
      requireClaraActor({ discordId: STAFF_DISCORD_ID, actorUserId: `discord-${STAFF_DISCORD_ID}` }),
    ).toEqual({ error: CLARA_ACTOR_REFUSAL });
  });
});

describe("mensajes de negativa", () => {
  it("no revelan datos de pacientes", () => {
    for (const message of [CLARA_ACCESS_REFUSAL, CLARA_ACTOR_REFUSAL]) {
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toMatch(/\d/);
      expect(message).not.toMatch(/saldo|cobranza|adeudo/i);
    }
    expect(CLARA_ACCESS_REFUSAL.toLowerCase()).toContain("autorizado");
    expect(CLARA_ACCESS_REFUSAL.toLowerCase()).toContain("seguimiento");
    expect(CLARA_ACTOR_REFUSAL.toLowerCase()).toContain("mapeo");
  });
});

describe("resolvePatient", () => {
  it("resuelve por id exacto", async () => {
    const query = buildQuery();
    query._result = {
      data: { id: PATIENT_ID, full_name: "Ana López", phone_e164: "+5215512345678" },
      error: null,
    };
    mockTablesByQueue({ patients: [query] });

    const result = await resolvePatient({ patientId: PATIENT_ID });
    expect(result).toMatchObject({ patient: { id: PATIENT_ID, full_name: "Ana López" } });
    expect(query.eq).toHaveBeenCalledWith("id", PATIENT_ID);
  });

  it("resuelve por teléfono E.164 exacto", async () => {
    const query = buildQuery();
    query._result = {
      data: { id: PATIENT_ID, full_name: "Ana López", phone_e164: "+5215512345678" },
      error: null,
    };
    mockTablesByQueue({ patients: [query] });

    const result = await resolvePatient({ phone: "+52 1 55 1234 5678" });
    expect(result).toMatchObject({ patient: { id: PATIENT_ID } });
    expect(query.eq).toHaveBeenCalledWith("phone_e164", "+5215512345678");
  });

  it("reporta notFound limpio para un teléfono desconocido", async () => {
    const query = buildQuery();
    query._result = { data: null, error: null };
    mockTablesByQueue({ patients: [query] });

    expect(await resolvePatient({ phone: "+5215500000000" })).toEqual({ notFound: true });
  });

  it("resuelve por nombre unívoco", async () => {
    const query = buildQuery();
    query._result = {
      data: [{ id: PATIENT_ID, full_name: "Ana López", phone_e164: "+5215512345678" }],
      error: null,
    };
    mockTablesByQueue({ patients: [query] });

    const result = await resolvePatient({ name: "Ana López" });
    expect(result).toMatchObject({ patient: { id: PATIENT_ID } });
    expect(query.ilike).toHaveBeenCalledWith("full_name", "Ana López");
    expect(query.limit).toHaveBeenCalledWith(5);
  });

  it("reporta notFound cuando el nombre no coincide con nadie", async () => {
    const query = buildQuery();
    query._result = { data: [], error: null };
    mockTablesByQueue({ patients: [query] });

    expect(await resolvePatient({ name: "Nadie Existente" })).toEqual({ notFound: true });
  });

  it("devuelve candidatos (sin datos clínicos ni financieros) para un nombre ambiguo", async () => {
    const query = buildQuery();
    query._result = {
      data: [
        { id: PATIENT_ID, full_name: "Ana López", phone_e164: "+5215512345678" },
        { id: OTHER_PATIENT_ID, full_name: "Ana López Ruiz", phone_e164: "+5215587654321" },
      ],
      error: null,
    };
    mockTablesByQueue({ patients: [query] });

    const result = await resolvePatient({ name: "Ana" });
    expect(result).toMatchObject({
      candidates: [
        { id: PATIENT_ID, full_name: "Ana López", phone_e164: "+5215512345678" },
        { id: OTHER_PATIENT_ID, full_name: "Ana López Ruiz", phone_e164: "+5215587654321" },
      ],
    });
    for (const candidate of "candidates" in result ? result.candidates : []) {
      expect(Object.keys(candidate).sort()).toEqual(["full_name", "id", "phone_e164"]);
    }
  });

  it("reporta notFound cuando no hay referencia", async () => {
    expect(await resolvePatient({})).toEqual({ notFound: true });
  });

  it("reporta un fallo de Supabase como error sin lanzar", async () => {
    const query = buildQuery();
    query._result = { data: null, error: { message: "connection refused" } };
    mockTablesByQueue({ patients: [query] });

    const result = await resolvePatient({ name: "Ana" });
    expect(result).toMatchObject({ error: expect.stringContaining("No se pudo buscar") });
  });

  it("reporta una excepción de Supabase como error sin lanzar", async () => {
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("boom");
    });

    const result = await resolvePatient({ patientId: PATIENT_ID });
    expect(result).toMatchObject({ error: expect.stringContaining("No se pudo buscar") });
  });
});

describe("buildPatientNotResolvedError", () => {
  it("lista candidatos sin datos clínicos ni financieros", () => {
    const result = buildPatientNotResolvedError({
      candidates: [
        { id: PATIENT_ID, full_name: "Ana López", phone_e164: "+5215512345678" },
        { id: OTHER_PATIENT_ID, full_name: "Ana López Ruiz", phone_e164: "+5215587654321" },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Ana López");
    expect(result.candidates).toHaveLength(2);
  });

  it("explica limpiamente un notFound", () => {
    const result = buildPatientNotResolvedError({ notFound: true });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No encontré/i);
  });
});

describe("resolveRoundCase", () => {
  const NOW = new Date("2026-05-20T18:00:00.000Z");
  const ROUND_DATE = "2026-05-20";

  it("encuentra al paciente en la lista del día", async () => {
    listDailyFollowUpCasesMock.mockResolvedValue([
      {
        patientId: PATIENT_ID,
        patientName: "Ana López",
        patientPhoneE164: "+5215512345678",
        reason: "no_show",
        reasonLabel: "No asistió a su cita",
        reasonDate: "2026-04-01",
        roundDate: ROUND_DATE,
        sourceAppointmentId: null,
        sourcePlanId: null,
      },
    ]);

    const result = await resolveRoundCase({ patientId: PATIENT_ID }, { now: NOW });
    expect(result).toEqual({ inRound: true, alreadyMarked: false });
    expect(listDailyFollowUpCasesMock).toHaveBeenCalledWith({ now: NOW });
    expect(loadFollowUpContactsForRoundMock).toHaveBeenCalledWith(ROUND_DATE);
  });

  it("reconoce a un paciente ya marcado en la ronda", async () => {
    loadFollowUpContactsForRoundMock.mockResolvedValue([
      buildContact(PATIENT_ID, ROUND_DATE),
    ]);

    const result = await resolveRoundCase({ patientId: PATIENT_ID }, { now: NOW });
    expect(result).toEqual({ inRound: true, alreadyMarked: true });
  });

  it("rechaza a un paciente fuera de la ronda", async () => {
    const result = await resolveRoundCase({ patientId: OTHER_PATIENT_ID }, { now: NOW });
    expect(result).toEqual({ inRound: false });
  });

  it("ignora los contactos de otra ronda", async () => {
    loadFollowUpContactsForRoundMock.mockResolvedValue([
      buildContact(PATIENT_ID, "2026-05-19"),
    ]);

    const result = await resolveRoundCase({ patientId: PATIENT_ID }, { now: NOW });
    expect(result).toEqual({ inRound: false });
  });

  it("reporta un fallo de lectura como error sin lanzar", async () => {
    listDailyFollowUpCasesMock.mockRejectedValue(new Error("connection refused"));

    const result = await resolveRoundCase({ patientId: PATIENT_ID }, { now: NOW });
    expect(result).toMatchObject({ error: expect.stringContaining("ronda") });
  });
});
