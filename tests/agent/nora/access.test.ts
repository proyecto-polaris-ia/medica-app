// @vitest-environment node
/**
 * Pruebas unitarias del módulo de acceso de doctores de Nora (issue #162,
 * Fase 5).
 *
 * Guardrails (spec delta "Autorización fail-closed por allowlist de doctores"):
 *   1. Solo los doctores cuyo usuario de Discord está en
 *      `NORA_DISCORD_DOCTOR_IDS` pueden operar; una allowlist ausente o vacía
 *      falla cerrado y niega a todos.
 *   2. Un principal que no viene de Discord se rechaza aunque su id esté en la
 *      allowlist.
 *   3. La negativa es uniforme y NUNCA toca la base de datos: la autorización
 *      ocurre antes de cualquier lectura de métricas.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const from = vi.fn();
const getSupabaseAdmin = vi.fn(() => ({ from }));

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin }));

const { DOCTOR_ACCESS_REFUSAL, requireDoctor, resolveDoctorAccess } = await import(
  "../../../agents/nora/agent/access"
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

describe("resolveDoctorAccess", () => {
  const ENV = {
    NORA_DISCORD_DOCTOR_IDS: `${DOCTOR_DISCORD_ID}, ${OTHER_DOCTOR_DISCORD_ID} `,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("accepts a Discord principal in the allowlist", () => {
    const access = resolveDoctorAccess(discordCtx(DOCTOR_DISCORD_ID), { env: ENV });
    expect(access).toEqual({ doctorId: DOCTOR_DISCORD_ID });
  });

  it("trims whitespace and matches case-insensitively", () => {
    const access = resolveDoctorAccess(discordCtx("  " + DOCTOR_DISCORD_ID + "  "), {
      env: ENV,
    });
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
      env: { NORA_DISCORD_DOCTOR_IDS: "   " },
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

  it("refuses a non-user principal even if its id is in the allowlist", () => {
    const ctx = {
      session: {
        auth: {
          current: {
            principalId: DOCTOR_DISCORD_ID,
            principalType: "bot",
            authenticator: "discord",
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
    const access = resolveDoctorAccess(
      { session: { auth: { current: null, initiator: null } } },
      { env: ENV },
    );
    expect(access).toEqual({ error: DOCTOR_ACCESS_REFUSAL });
  });

  it("never touches the database when it denies access", () => {
    resolveDoctorAccess(discordCtx("000000000000000000"), { env: ENV });
    resolveDoctorAccess(discordCtx(DOCTOR_DISCORD_ID), { env: {} });
    resolveDoctorAccess(undefined, { env: ENV });
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
  });
});

describe("requireDoctor", () => {
  const ENV = { NORA_DISCORD_DOCTOR_IDS: DOCTOR_DISCORD_ID };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns the authorized doctor for an allowlisted Discord principal", () => {
    expect(requireDoctor(discordCtx(DOCTOR_DISCORD_ID), { env: ENV })).toEqual({
      doctorId: DOCTOR_DISCORD_ID,
    });
  });

  it("returns the refusal for an unauthorized principal without reading the database", () => {
    expect(requireDoctor(discordCtx("000000000000000000"), { env: ENV })).toEqual({
      error: DOCTOR_ACCESS_REFUSAL,
    });
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
  });
});
