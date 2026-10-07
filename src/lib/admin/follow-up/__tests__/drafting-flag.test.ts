import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isClaraDraftingEnabled } from '@/lib/admin/follow-up/drafting-flag';

const ENV_KEY = 'CLARA_DRAFTING_ENABLED';

/**
 * Slice 1.1 — Kill switch de la redacción por LLM (design.md decisión 2,
 * spec `clara-drafting` → "Degradación por kill switch").
 *
 * Convención estándar del repo (`WHATSAPP_REMINDER_REPLY_ENABLED`): default
 * **off**; `true|1|yes` (case-insensitive) encienden. Con el flag apagado el
 * flujo equivale al previo a esta capacidad (plantilla determinista).
 */
describe('isClaraDraftingEnabled', () => {
  beforeEach(() => {
    vi.stubEnv(ENV_KEY, '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('es false cuando el valor está ausente, null o vacío', () => {
    expect(isClaraDraftingEnabled(undefined)).toBe(false);
    expect(isClaraDraftingEnabled(null)).toBe(false);
    expect(isClaraDraftingEnabled('')).toBe(false);
  });

  it('lee la variable de entorno cuando no recibe argumento (default off)', () => {
    expect(isClaraDraftingEnabled()).toBe(false);
    vi.stubEnv(ENV_KEY, 'true');
    expect(isClaraDraftingEnabled()).toBe(true);
    vi.stubEnv(ENV_KEY, 'false');
    expect(isClaraDraftingEnabled()).toBe(false);
  });

  it('es false para valores no reconocidos (incluye "on")', () => {
    expect(isClaraDraftingEnabled('false')).toBe(false);
    expect(isClaraDraftingEnabled('0')).toBe(false);
    expect(isClaraDraftingEnabled('no')).toBe(false);
    expect(isClaraDraftingEnabled('on')).toBe(false);
  });

  it('es true solo para true / 1 / yes', () => {
    expect(isClaraDraftingEnabled('true')).toBe(true);
    expect(isClaraDraftingEnabled('1')).toBe(true);
    expect(isClaraDraftingEnabled('yes')).toBe(true);
  });

  it('ignora mayúsculas y espacios', () => {
    expect(isClaraDraftingEnabled(' TRUE ')).toBe(true);
    expect(isClaraDraftingEnabled('Yes')).toBe(true);
    expect(isClaraDraftingEnabled('  false  ')).toBe(false);
  });
});
