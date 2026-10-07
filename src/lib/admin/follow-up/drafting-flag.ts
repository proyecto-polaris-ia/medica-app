/**
 * Kill switch de la redacción de borradores de seguimiento por LLM (issue #148,
 * design.md decisión 2, spec `clara-drafting` → "Degradación por kill switch").
 *
 * `CLARA_DRAFTING_ENABLED` habilita el camino LLM de Clara. Convención estándar
 * del repo (`src/lib/citas/reminder-reply-flag.ts`): `true`, `1` o `yes`
 * (case-insensitive) encienden; cualquier otra cosa —y una variable ausente—
 * apaga, por lo que el **default es off** y apagado el comportamiento es
 * idéntico al anterior a esta capacidad (plantilla determinista, cero llamadas
 * al LLM). También es el rollback inmediato en producción.
 *
 * Este módulo es la única lectura de la variable de entorno: los consumidores
 * llaman `isClaraDraftingEnabled()` sin argumento y los tests inyectan el valor.
 */

const TRUTHY_VALUES = new Set(['true', '1', 'yes']);

export function isClaraDraftingEnabled(rawValue?: string | null): boolean {
  const value =
    rawValue === undefined ? process.env.CLARA_DRAFTING_ENABLED : rawValue;
  if (value == null) return false;
  return TRUTHY_VALUES.has(value.trim().toLowerCase());
}
