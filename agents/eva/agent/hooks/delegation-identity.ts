import { defineHook } from "eve/hooks";

import { saveDelegationBinding } from "@/lib/agent/delegation-bindings";

/**
 * Hook raíz de identidad de delegación (issue #140, fase 1).
 *
 * Eva es el único agente ligado a WhatsApp. Cuando delega a Mora, la sesión hija
 * corre en una ruta interna del runtime y pierde `ctx.session.auth` del canal.
 * Este hook observa `subagent.called` en la sesión raíz (donde el auth del canal
 * sigue presente) y persiste `child_session_id -> trusted_patient_phone` para que
 * las tools de Mora resuelvan la identidad server-side, nunca desde el chat.
 *
 * Es observe-only y degrada de forma segura: si la persistencia falla, la
 * delegación continúa y las tools de Mora niegan la consulta.
 */

const MORA_SUBAGENT_NAME = "mora";

type HookAuthContext = {
  session?: {
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/**
 * Extrae el `childSessionId` solo cuando el evento corresponde a Mora.
 * Se estrecha desde `unknown` porque la forma del evento no está tipada por
 * completo en la versión instalada de eve; se acepta `name` o el `toolName`
 * del tool aplanado (`mora`) como identidad del subagente.
 */
export function extractMoraChildSessionId(event: unknown): string | undefined {
  const data = asRecord(asRecord(event)?.data);
  if (!data) return undefined;

  const name = typeof data.name === "string" ? data.name : undefined;
  const toolName = typeof data.toolName === "string" ? data.toolName : undefined;
  if (name !== MORA_SUBAGENT_NAME && toolName !== MORA_SUBAGENT_NAME) {
    return undefined;
  }

  const childSessionId =
    typeof data.childSessionId === "string" ? data.childSessionId.trim() : "";
  return childSessionId || undefined;
}

function firstString(value: string | readonly string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Lee `trustedPatientPhone` con la misma convención de
 * `agent/trusted-contact-context.ts`: primero `auth.current`, luego
 * `auth.initiator`, y solo cuando el origen es el canal de WhatsApp.
 */
export function readTrustedPatientPhone(ctx: unknown): string | undefined {
  const auth = (ctx as HookAuthContext | undefined)?.session?.auth;
  if (!auth) return undefined;

  for (const context of [auth.current, auth.initiator]) {
    const attributes = context?.attributes;
    if (!attributes) continue;
    if (firstString(attributes.trustedContactSource) !== "whatsapp") continue;
    const phone = firstString(attributes.trustedPatientPhone);
    if (typeof phone === "string" && phone.trim()) return phone.trim();
  }

  return undefined;
}

async function handleSubagentCalled(event: unknown, ctx: unknown): Promise<void> {
  try {
    const childSessionId = extractMoraChildSessionId(event);
    if (!childSessionId) return;

    const trustedPatientPhone = readTrustedPatientPhone(ctx);
    if (!trustedPatientPhone) return;

    const result = await saveDelegationBinding({
      childSessionId,
      trustedPatientPhone,
    });

    if (!result.ok) {
      console.error(
        `[delegation-identity] No se pudo persistir el binding de identidad para Mora (childSessionId=${childSessionId}); sus tools negarán la consulta.`,
      );
    }
  } catch (error) {
    // Degradación segura: la delegación continúa; las tools de Mora se niegan.
    const childSessionId = extractMoraChildSessionId(event);
    console.error(
      `[delegation-identity] Error al persistir el binding de identidad para Mora${
        childSessionId ? ` (childSessionId=${childSessionId})` : ""
      }; sus tools negarán la consulta.`,
      error,
    );
  }
}

export default defineHook({
  events: {
    "subagent.called": handleSubagentCalled,
  },
});
