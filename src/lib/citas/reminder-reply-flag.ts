/**
 * Feature-flag parsing for the reminder-reply pre-check (issue #87, design.md
 * decisión 8, spec R11).
 *
 * `WHATSAPP_REMINDER_REPLY_ENABLED` habilita el gancho de respuestas a
 * recordatorio en el pipeline de WhatsApp. Sigue la misma convención que
 * `src/lib/whatsapp/eve-flag.ts`: `true`, `1` o `yes` (case-insensitive)
 * encienden; cualquier otra cosa (y una variable ausente) la apaga, por lo que
 * el default es **off** y apagado el pipeline se comporta igual que hoy.
 *
 * Este módulo es la única lectura de la variable de entorno: los consumidores
 * llaman `isReminderReplyEnabled()` sin argumento (design.md → "Apagado =
 * comportamiento idéntico al actual (el hook ni se evalúa)").
 */

const TRUTHY_VALUES = new Set(['true', '1', 'yes']);

export function isReminderReplyEnabled(rawValue?: string | null): boolean {
  const value =
    rawValue === undefined ? process.env.WHATSAPP_REMINDER_REPLY_ENABLED : rawValue;
  if (value == null) return false;
  return TRUTHY_VALUES.has(value.trim().toLowerCase());
}
