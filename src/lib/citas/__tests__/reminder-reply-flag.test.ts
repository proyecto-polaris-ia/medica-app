import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isReminderReplyEnabled } from '@/lib/citas/reminder-reply-flag';

const ENV_KEY = 'WHATSAPP_REMINDER_REPLY_ENABLED';

/**
 * Fase 3.1 — Control por feature flag (design.md decisión 8, spec R11).
 * Convención estándar del repo: default **off**, `true|1|yes`
 * (case-insensitive) encienden. `WHATSAPP_REMINDER_REPLY_ENABLED` apagado = comportamiento actual.
 */
describe('isReminderReplyEnabled', () => {
  beforeEach(() => {
    vi.stubEnv(ENV_KEY, '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('es false cuando el valor está ausente, null o vacío', () => {
    expect(isReminderReplyEnabled(undefined)).toBe(false);
    expect(isReminderReplyEnabled(null)).toBe(false);
    expect(isReminderReplyEnabled('')).toBe(false);
  });

  it('lee la variable de entorno cuando no recibe argumento (default off)', () => {
    expect(isReminderReplyEnabled()).toBe(false);
    vi.stubEnv(ENV_KEY, 'true');
    expect(isReminderReplyEnabled()).toBe(true);
    vi.stubEnv(ENV_KEY, 'false');
    expect(isReminderReplyEnabled()).toBe(false);
  });

  it('es false para valores no reconocidos (incluye "on")', () => {
    expect(isReminderReplyEnabled('false')).toBe(false);
    expect(isReminderReplyEnabled('0')).toBe(false);
    expect(isReminderReplyEnabled('no')).toBe(false);
    expect(isReminderReplyEnabled('on')).toBe(false);
  });

  it('es true solo para true / 1 / yes', () => {
    expect(isReminderReplyEnabled('true')).toBe(true);
    expect(isReminderReplyEnabled('1')).toBe(true);
    expect(isReminderReplyEnabled('yes')).toBe(true);
  });

  it('ignora mayúsculas y espacios', () => {
    expect(isReminderReplyEnabled(' TRUE ')).toBe(true);
    expect(isReminderReplyEnabled('Yes')).toBe(true);
    expect(isReminderReplyEnabled('  false  ')).toBe(false);
  });
});
