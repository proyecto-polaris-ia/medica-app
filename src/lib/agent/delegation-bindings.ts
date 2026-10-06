import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Bindings de identidad de delegación (issue #140, fase 1).
 *
 * La sesión hija de un subagente corre en una ruta interna del runtime de Eve,
 * donde `ctx.session.auth.current`/`.initiator` son `null`. Para que las tools
 * de Mora sigan resolviendo la identidad desde el canal de WhatsApp (y nunca
 * desde texto del paciente), el hook raíz `subagent.called` persiste
 * `child_session_id -> trusted_patient_phone` en el momento de la delegación.
 *
 * Solo se accede con el cliente admin (service role): la tabla tiene RLS
 * habilitado sin políticas públicas.
 */

const TABLE = 'agent_delegation_bindings';

/** Vigencia de un binding: una hora. Compartido con el purge y el TTL de diseño. */
export const DELEGATION_BINDING_TTL_SECONDS = 3600;

export type SaveDelegationBindingInput = {
  childSessionId: string;
  trustedPatientPhone: string;
};

export type MutationResult = { ok: true } | { ok: false };

export type PurgeResult = { ok: true; deleted: number } | { ok: false; deleted: 0 };

/**
 * Resultado de la lectura de identidad.
 *
 * `{ ok: true, phone: null }` significa "sin binding" (not-found) y es lo que el
 * resolver reintenta antes de negarse. `{ ok: false }` significa falla de base de
 * datos y es un fallo cerrado: nunca se revela información.
 */
export type ResolveDelegationBindingResult =
  | { ok: true; phone: string | null }
  | { ok: false };

/**
 * Inserta o refresca el binding de un hijo. Idempotente por
 * `onConflict: 'child_session_id'`; nunca lanza (falla a `{ ok: false }`).
 */
export async function saveDelegationBinding(
  input: SaveDelegationBindingInput,
): Promise<MutationResult> {
  try {
    const { error } = await getSupabaseAdmin()
      .from(TABLE)
      .upsert(
        {
          child_session_id: input.childSessionId,
          trusted_patient_phone: input.trustedPatientPhone,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'child_session_id' },
      );

    return error ? { ok: false } : { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Lee el teléfono confiable ligado a la sesión hija.
 *
 * Devuelve un resultado discriminado en vez de lanzar: la ruta de las tools
 * nunca debe recibir una excepción (fallo cerrado ante error de BD).
 */
export async function resolveDelegationBinding(
  childSessionId: string,
): Promise<ResolveDelegationBindingResult> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(TABLE)
      .select('trusted_patient_phone')
      .eq('child_session_id', childSessionId)
      .maybeSingle();

    if (error) return { ok: false };

    const phone = (data as { trusted_patient_phone?: unknown } | null)
      ?.trusted_patient_phone;
    return { ok: true, phone: typeof phone === 'string' && phone.trim() ? phone.trim() : null };
  } catch {
    return { ok: false };
  }
}

/** Borra el binding de una sesión hija (cleanup explícito). */
export async function deleteDelegationBinding(
  childSessionId: string,
): Promise<MutationResult> {
  try {
    const { error } = await getSupabaseAdmin()
      .from(TABLE)
      .delete()
      .eq('child_session_id', childSessionId);

    return error ? { ok: false } : { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Borra los bindings más viejos que `maxAgeSeconds` y reporta cuántos borró.
 * Exportado para reutilizarse en un cleanup programado.
 */
export async function purgeExpiredDelegationBindings(
  maxAgeSeconds: number = DELEGATION_BINDING_TTL_SECONDS,
): Promise<PurgeResult> {
  const cutoff = new Date(Date.now() - maxAgeSeconds * 1000).toISOString();
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(TABLE)
      .delete()
      .lt('created_at', cutoff)
      .select('child_session_id');

    if (error) return { ok: false, deleted: 0 };
    return { ok: true, deleted: (data ?? []).length };
  } catch {
    return { ok: false, deleted: 0 };
  }
}
