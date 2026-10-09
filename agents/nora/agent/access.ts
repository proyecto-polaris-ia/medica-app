/**
 * Acceso de doctores autorizados para el canal Discord de Nora (issue #162,
 * Fase 5).
 *
 * Nora es doctor-facing y de solo lectura: un doctor autorizado consulta
 * métricas del consultorio (ocupación, no-shows, citas atendidas/canceladas)
 * a través de sus tools, que son proyecciones del motor de métricas. La
 * autorización sale del principal del canal (`channels/discord.ts` →
 * `onCommand`, allowlist `NORA_DISCORD_DOCTOR_IDS`) y se re-verifica aquí en
 * cada tool (defensa en profundidad: el principal viaja en `ctx.session.auth`,
 * nunca en el texto del modelo ni en argumentos de la tool).
 */

/**
 * Negativa uniforme para cualquier fallo de autorización. Es la misma cadena
 * sin importar si el ID no está en la allowlist o si la allowlist no existe,
 * para no revelar qué identificadores están registrados.
 */
export const DOCTOR_ACCESS_REFUSAL =
  "No estás autorizado para consultar métricas del consultorio. Pide al administrador que agregue tu usuario de Discord a la lista de doctores autorizados.";

const DOCTOR_ALLOWLIST_ENV = "NORA_DISCORD_DOCTOR_IDS";

/** Contexto mínimo que las tools de Nora necesitan del runtime de Eve. */
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

/**
 * Normaliza la allowlist de doctores: separa por coma, aplica `trim`, pasa a
 * minúsculas y descarta entradas vacías. Exportado para test.
 */
export function parseDoctorAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Resuelve el doctor autorizado desde el principal del canal de Discord.
 *
 * Falla cerrado: allowlist ausente o vacía, principal que no viene de Discord,
 * principal que no es `user`, o un ID fuera de la allowlist producen la misma
 * negativa. Nunca lanza y nunca toca la base de datos.
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

/**
 * Puerta de una sola llamada para las tools de métricas: autoriza al doctor y
 * devuelve el principal autorizado o la negativa. Las 5 tools invocan este
 * helper antes de consultar el motor de métricas, de modo que ninguna lectura
 * de Supabase ocurre sin un doctor autorizado.
 */
export function requireDoctor(
  ctx: DoctorAccessContext | undefined,
  options: { env?: Record<string, string | undefined> } = {},
): DoctorAccess {
  return resolveDoctorAccess(ctx, options);
}
