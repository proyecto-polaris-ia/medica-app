import {
  currentRoundDate,
  listDailyFollowUpCases,
  loadFollowUpContactsForRound,
} from "@/lib/admin/follow-up/follow-up";
import { parseUuid } from "@/lib/admin/validate";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Capa de acceso, resolución de paciente y precondición de ronda de Clara
 * (issue #161, Fase 4).
 *
 * Clara es staff-facing: un usuario de Discord autorizado nombra a un paciente
 * y las tools de seguimiento lo resuelven contra `patients`. La autorización
 * sale del principal del canal (`channels/discord.ts` → `onCommand`, allowlist
 * `CLARA_DISCORD_STAFF_IDS`) y se re-verifica aquí en cada tool (defensa en
 * profundidad: el principal viaja en `ctx.session.auth`, nunca en el texto del
 * modelo ni en argumentos de la tool).
 *
 * El actor de auditoría (`CLARA_DISCORD_ACTOR_MAP`) es un UUID de Supabase: el
 * camino determinista existente (`markFollowUpContact`, `createFollowUpDraft`,
 * `transitionFollowUpDraft`) escribe `created_by` / `approved_by` con
 * `parseUuid`, así que un ID de Discord no sirve como actor. Sin mapeo, la
 * lectura sigue funcionando y la escritura se niega.
 */

const STAFF_ALLOWLIST_ENV = "CLARA_DISCORD_STAFF_IDS";
const ACTOR_MAP_ENV = "CLARA_DISCORD_ACTOR_MAP";

const PATIENT_COLUMNS = "id, full_name, phone_e164";

export const CLARA_ACCESS_REFUSAL =
  "No estás autorizado para consultar el seguimiento de pacientes. Pide al administrador que agregue tu usuario de Discord a la lista del equipo autorizado.";

export const CLARA_ACTOR_REFUSAL =
  "Tu usuario puede consultar el seguimiento, pero no registrar cambios: falta el mapeo de tu usuario a un usuario del consultorio en la configuración.";

/** Contexto mínimo que las tools de Clara necesitan del runtime de Eve. */
export type ClaraAccessContext = {
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

export type ClaraAccess =
  | { discordId: string; actorUserId: string | null }
  | { error: string };

export type PatientLookupRow = {
  id: string;
  full_name: string;
  phone_e164: string | null;
};

export type PatientResolution =
  | { patient: PatientLookupRow }
  | { candidates: PatientLookupRow[] }
  | { notFound: true }
  | { error: string };

export type RoundCaseResolution =
  | { inRound: true; alreadyMarked: boolean }
  | { inRound: false }
  | { error: string };

/**
 * Normaliza la allowlist de staff y doctores autorizados: comas, `trim`,
 * minúsculas y descarte de entradas vacías. Exportado para test.
 */
export function parseStaffAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isValidUuid(value: string): boolean {
  try {
    parseUuid(value, "actorUserId");
    return true;
  } catch {
    return false;
  }
}

/**
 * Normaliza el mapa `<discordUserId>=<supabaseUserUuid>` y descarta cualquier
 * entrada mal formada o cuyo UUID no pase `parseUuid`. Exportado para test.
 */
export function parseActorMap(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of (raw ?? "").split(",")) {
    const separator = entry.indexOf("=");
    if (separator === -1) continue;
    const key = entry.slice(0, separator).trim().toLowerCase();
    const value = entry.slice(separator + 1).trim();
    if (!key || !value || !isValidUuid(value)) continue;
    map.set(key, value);
  }
  return map;
}

/**
 * Resuelve el acceso desde el principal del canal de Discord.
 *
 * Falla cerrado: allowlist ausente o vacía, principal que no viene de Discord,
 * principal que no es `user`, o un ID fuera de la allowlist producen la misma
 * negativa. Nunca lanza.
 */
export function resolveClaraAccess(
  ctx: ClaraAccessContext | undefined,
  options: { env?: Record<string, string | undefined> } = {},
): ClaraAccess {
  const env = options.env ?? process.env;
  const allowlist = parseStaffAllowlist(env[STAFF_ALLOWLIST_ENV]);

  const principal = ctx?.session?.auth?.current;
  if (
    !allowlist.size ||
    !principal?.principalId ||
    principal.authenticator !== "discord" ||
    principal.principalType !== "user"
  ) {
    return { error: CLARA_ACCESS_REFUSAL };
  }

  const discordId = principal.principalId.trim().toLowerCase();
  if (!allowlist.has(discordId)) {
    return { error: CLARA_ACCESS_REFUSAL };
  }

  return {
    discordId,
    actorUserId: parseActorMap(env[ACTOR_MAP_ENV]).get(discordId) ?? null,
  };
}

/**
 * Exige un actor de auditoría válido para las tools de escritura. Sin mapeo (o
 * con un valor inválido) la escritura se niega; la lectura no pasa por aquí.
 */
export function requireClaraActor(access: {
  discordId: string;
  actorUserId: string | null;
}): { actorUserId: string } | { error: string } {
  const actorUserId = access.actorUserId;
  if (!actorUserId || !isValidUuid(actorUserId)) {
    return { error: CLARA_ACTOR_REFUSAL };
  }
  return { actorUserId };
}

function normalizeE164(value: string): string | undefined {
  const digits = value.replace(/[^0-9]/g, "");
  return digits ? `+${digits}` : undefined;
}

/**
 * Resuelve a un paciente nombrado por staff autorizado.
 *
 * `patientId` busca por `id`; un teléfono (con cualquier formato) se compara
 * exacto contra `patients.phone_e164`; un nombre usa `ilike` sobre `full_name`
 * con tope 5: un match resuelve, varios devuelven candidatos (solo identidad:
 * nombre y teléfono, sin datos clínicos ni financieros), cero reporta limpio.
 * Los fallos de base se devuelven como `{ error }`, nunca se lanzan.
 */
export async function resolvePatient(reference: {
  patientId?: string;
  phone?: string;
  name?: string;
}): Promise<PatientResolution> {
  const patientId = reference.patientId?.trim() || undefined;
  const phone = reference.phone ? normalizeE164(reference.phone) : undefined;
  const name = reference.name?.trim() || undefined;
  if (!patientId && !phone && !name) return { notFound: true };

  try {
    if (patientId) {
      const { data, error } = await getSupabaseAdmin()
        .from("patients")
        .select(PATIENT_COLUMNS)
        .eq("id", patientId)
        .maybeSingle();
      if (error) {
        return { error: `No se pudo buscar al paciente: ${error.message}` };
      }
      const patient = data as PatientLookupRow | null;
      return patient ? { patient } : { notFound: true };
    }

    if (phone) {
      const { data, error } = await getSupabaseAdmin()
        .from("patients")
        .select(PATIENT_COLUMNS)
        .eq("phone_e164", phone)
        .maybeSingle();
      if (error) {
        return { error: `No se pudo buscar al paciente: ${error.message}` };
      }
      const patient = data as PatientLookupRow | null;
      return patient ? { patient } : { notFound: true };
    }

    if (!name) return { notFound: true };

    const { data, error } = await getSupabaseAdmin()
      .from("patients")
      .select(PATIENT_COLUMNS)
      .ilike("full_name", name)
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

/**
 * Precondición de ronda (design §D3): el paciente debe estar en la lista del
 * día o ya tener un contacto registrado en la ronda vigente. Lo segundo
 * mantiene la idempotencia: tras marcar, el paciente sale de la lista y la
 * segunda marca debe poder resolverse.
 */
export async function resolveRoundCase(
  reference: { patientId: string },
  options: { now?: Date } = {},
): Promise<RoundCaseResolution> {
  const now = options.now ?? new Date();
  const roundDate = currentRoundDate(now);

  try {
    const [cases, contacts] = await Promise.all([
      listDailyFollowUpCases({ now }),
      loadFollowUpContactsForRound(roundDate),
    ]);

    if (cases.some((followUpCase) => followUpCase.patientId === reference.patientId)) {
      return { inRound: true, alreadyMarked: false };
    }

    const alreadyMarked = contacts.some(
      (contact) =>
        contact.patientId === reference.patientId && contact.roundDate === roundDate,
    );
    if (alreadyMarked) return { inRound: true, alreadyMarked: true };

    return { inRound: false };
  } catch (error) {
    return {
      error: `No se pudo verificar la ronda de seguimiento: ${
        error instanceof Error ? error.message : "error desconocido"
      }`,
    };
  }
}

/** Negativa compartida para una referencia de paciente ambigua o inexistente. */
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
