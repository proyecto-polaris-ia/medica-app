import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Doctor access + patient resolution for Mora's Discord channel (issue #159).
 *
 * Mora is doctor-facing: an authorized doctor names a patient and the
 * collections tools resolve that patient against the `patients` table. The
 * doctor's authorization comes from the Discord channel principal created by
 * `channels/discord.ts` (`onCommand` allowlist), and is re-checked here on
 * every tool call (defense in depth — the principal travels in
 * `ctx.session.auth`, never in model text).
 */

export const DOCTOR_ACCESS_REFUSAL =
  "No estás autorizado para consultar saldos. Pide al administrador que agregue tu usuario de Discord a la lista de doctores autorizados.";

const DOCTOR_ALLOWLIST_ENV = "MORA_DISCORD_DOCTOR_IDS";

/** Contexto mínimo que las tools de Mora necesitan del runtime de Eve. */
export type DoctorAccessContext = {
  session?: {
    auth?: {
      current?: {
        principalId?: string | null;
        principalType?: string | null;
        authenticator?: string | null;
        attributes?: Readonly<Record<string, string | readonly string[]>>;
      } | null;
      initiator?: {
        principalId?: string | null;
        principalType?: string | null;
        authenticator?: string | null;
      } | null;
    } | null;
  };
};

export type DoctorAccess = { doctorId: string } | { error: string };

export type PatientLookupRow = {
  id: string;
  full_name: string;
  phone_e164: string;
};

export type PatientResolution =
  | { patient: PatientLookupRow }
  | { candidates: PatientLookupRow[] }
  | { notFound: true }
  | { error: string };

function parseDoctorAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Resolves the authorized doctor from the Discord channel principal.
 *
 * Fails closed: a missing allowlist, an empty one, a non-Discord principal,
 * or an unauthenticated caller all produce the same refusal. Never throws.
 */
export function resolveDoctorAccess(
  ctx: DoctorAccessContext | undefined,
  options: { env?: Record<string, string | undefined> } = {},
): DoctorAccess {
  const env = options.env ?? process.env;
  const allowlist = parseDoctorAllowlist(env[DOCTOR_ALLOWLIST_ENV]);

  const principal = ctx?.session?.auth?.current;
  if (
    !allowlist.size ||
    !principal?.principalId ||
    principal.authenticator !== "discord" ||
    principal.principalType !== "user"
  ) {
    return { error: DOCTOR_ACCESS_REFUSAL };
  }

  const doctorId = principal.principalId.trim().toLowerCase();
  if (!allowlist.has(doctorId)) {
    return { error: DOCTOR_ACCESS_REFUSAL };
  }

  return { doctorId };
}

function normalizeE164(value: string): string | undefined {
  const digits = value.replace(/[^0-9]/g, "");
  return digits ? `+${digits}` : undefined;
}

/**
 * Resolves a patient named by an authorized doctor.
 *
 * A phone reference (any digit formatting) is matched exactly against
 * `patients.phone_e164`. A name reference uses a case-insensitive match on
 * `full_name`: one match resolves the patient, several matches return the
 * candidates (identity data only — no financial data), zero matches report
 * cleanly. Never throws on empty results; database failures surface as
 * `{ error }`.
 */
export async function resolvePatient(reference: {
  phone?: string;
  name?: string;
}): Promise<PatientResolution> {
  const phone = reference.phone ? normalizeE164(reference.phone) : undefined;
  const name = reference.name?.trim() || undefined;
  if (!phone && !name) return { notFound: true };

  try {
    if (phone) {
      const { data, error } = await getSupabaseAdmin()
        .from("patients")
        .select("id, full_name, phone_e164")
        .eq("phone_e164", phone)
        .maybeSingle();
      if (error) {
        return { error: `No se pudo buscar al paciente: ${error.message}` };
      }
      const patient = data as PatientLookupRow | null;
      return patient ? { patient } : { notFound: true };
    }

    const { data, error } = await getSupabaseAdmin()
      .from("patients")
      .select("id, full_name, phone_e164")
      .ilike("full_name", name as string)
      .limit(5);
    if (error) {
      return { error: `No se pudo buscar al paciente: ${error.message}` };
    }

    const rows = (data ?? []) as PatientLookupRow[];
    if (rows.length === 0) return { notFound: true };
    if (rows.length === 1) return { patient: rows[0] };
    return { candidates: rows };
  } catch (error) {
    return {
      error: `No se pudo buscar al paciente: ${
        error instanceof Error ? error.message : "error desconocido"
      }`,
    };
  }
}

export type ResolvedCollectionsTarget =
  | { doctorId: string; patient: PatientLookupRow }
  | { doctorId: string; candidates: PatientLookupRow[] }
  | { doctorId: string; notFound: true }
  | { error: string };

/** Shared refusal for ambiguous or missing patient references (no financial data). */
export function buildPatientNotResolvedError(
  target: { candidates: PatientLookupRow[] } | { notFound: true },
): { success: false; error: string; candidates?: PatientLookupRow[] } {
  if ("candidates" in target) {
    const names = target.candidates
      .map((candidate) => `${candidate.full_name} (${candidate.phone_e164})`)
      .join(", ");
    return {
      success: false,
      error: `Encontré más de un paciente con ese nombre. Indica el teléfono registrado del paciente para continuar. Coincidencias: ${names}.`,
      candidates: target.candidates,
    };
  }
  return {
    success: false,
    error:
      "No encontré un paciente con esa referencia. Verifica el nombre o el teléfono registrado en el consultorio.",
  };
}

/**
 * One-call gate for collections tools: authorize the doctor, then resolve the
 * named patient. Returns the refusal when the doctor is unauthorized (before
 * any database access), the candidates when a name is ambiguous, a clean
 * not-found, or the resolved patient with the doctor id.
 */
export async function authorizeAndResolvePatient(
  ctx: DoctorAccessContext | undefined,
  reference: { patientPhone?: string; patientName?: string },
): Promise<ResolvedCollectionsTarget> {
  const doctor = resolveDoctorAccess(ctx);
  if ("error" in doctor) return doctor;

  const resolution = await resolvePatient({
    phone: reference.patientPhone,
    name: reference.patientName,
  });
  if ("error" in resolution) return resolution;
  if ("patient" in resolution) {
    return { doctorId: doctor.doctorId, patient: resolution.patient };
  }
  if ("candidates" in resolution) {
    return { doctorId: doctor.doctorId, candidates: resolution.candidates };
  }
  return { doctorId: doctor.doctorId, notFound: true };
}
