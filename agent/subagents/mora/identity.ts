import { resolveDelegationBinding } from "@/lib/agent/delegation-bindings";

import { requireTrustedWhatsAppPhone } from "../../trusted-contact-context";

/**
 * Identidad de cobranza de Mora.
 *
 * Prioridad:
 *  1. Teléfono confiable del canal en `ctx.session.auth` (contexto raíz/directo).
 *  2. Binding server-side creado por el hook de delegación, leído por el
 *     `child_session_id` de la propia sesión hija (`ctx.session.parent` señala
 *     que estamos en una delegación).
 *  3. Negativa de seguridad.
 *
 * El teléfono nunca llega por texto del paciente ni por argumentos de la tool.
 */

export const COLLECTIONS_SECURITY_REFUSAL =
  "Por seguridad no puedo consultar saldos sin un WhatsApp vinculado al paciente.";

/** Contexto mínimo que las tools de Mora necesitan del runtime de Eve. */
export type CollectionsToolContext = {
  session?: {
    id?: string;
    parent?: { sessionId?: string } | null;
    auth?: {
      current?: {
        attributes?: Readonly<Record<string, string | readonly string[]>>;
      } | null;
      initiator?: {
        attributes?: Readonly<Record<string, string | readonly string[]>>;
      } | null;
    };
  };
};

export type CollectionsIdentityOptions = {
  /** Intentos de lectura del binding antes de negarse. Default 3. */
  attempts?: number;
  /** Espera entre intentos en ms. Default 500. */
  delayMs?: number;
};

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resuelve el teléfono del paciente para las tools de colecciones.
 *
 * Nunca lanza: ante cualquier falla regresa la negativa de seguridad. Los
 * reintentos existen para cubrir la carrera entre el insert del hook raíz y la
 * primera tool del hijo (que siempre ocurre después de al menos un turno del LLM).
 */
export async function resolveCollectionsPatientPhone(
  ctx: CollectionsToolContext | undefined,
  error: string = COLLECTIONS_SECURITY_REFUSAL,
  options: CollectionsIdentityOptions = {},
): Promise<{ phone: string } | { error: string }> {
  const trusted = requireTrustedWhatsAppPhone(ctx, error);
  if ("phone" in trusted) return { phone: trusted.phone };

  try {
    const childSessionId = ctx?.session?.id;
    const isDelegated = Boolean(ctx?.session?.parent);
    if (!isDelegated || !childSessionId) return { error };

    const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
    const delayMs = Math.max(0, options.delayMs ?? DEFAULT_DELAY_MS);

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const binding = await resolveDelegationBinding(childSessionId);
      if (!binding.ok) return { error };
      if (binding.phone) return { phone: binding.phone };
      if (attempt < attempts - 1 && delayMs > 0) await sleep(delayMs);
    }

    return { error };
  } catch {
    return { error };
  }
}
