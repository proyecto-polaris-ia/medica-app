/**
 * Feature-flag parsing for the WhatsApp agent routing switch.
 *
 * `WHATSAPP_EVE_ENABLED` routes inbound WhatsApp messages to the Eve agent
 * when truthy and to the legacy agent otherwise. Truthiness follows the same
 * convention as `WHATSAPP_FLOW_ENGINE_ENABLED`: `true`, `1`, or `yes`
 * (case-insensitive) enable the feature; anything else (and an unset value)
 * disables it, so the default is the legacy agent.
 */

const TRUTHY_VALUES = new Set(["true", "1", "yes"]);

export function isEveWhatsAppEnabled(rawValue: string | undefined | null): boolean {
  if (rawValue == null) return false;
  const normalized = rawValue.trim().toLowerCase();
  return TRUTHY_VALUES.has(normalized);
}
