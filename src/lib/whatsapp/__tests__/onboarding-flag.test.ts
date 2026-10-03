import { describe, expect, it } from 'vitest';
import {
  isOnboardingEnabled,
  isOnboardingNudgeEnabled,
} from '../onboarding-flag';

/**
 * Feature flag del onboarding (design.md D5, requirement ONB-R7).
 * `true | 1 | yes` (case-insensitive) encienden; ausente o cualquier otro valor
 * apagan: el default es **off**.
 */
describe('isOnboardingEnabled', () => {
  it('está apagado por default cuando la variable está ausente', () => {
    expect(isOnboardingEnabled(undefined)).toBe(false);
  });

  it('enciende con true, 1 y yes (case-insensitive)', () => {
    expect(isOnboardingEnabled('true')).toBe(true);
    expect(isOnboardingEnabled('TRUE')).toBe(true);
    expect(isOnboardingEnabled('1')).toBe(true);
    expect(isOnboardingEnabled('yes')).toBe(true);
    expect(isOnboardingEnabled('Yes')).toBe(true);
  });

  it('apaga con cualquier otro valor, incluido empty y null', () => {
    expect(isOnboardingEnabled('false')).toBe(false);
    expect(isOnboardingEnabled('0')).toBe(false);
    expect(isOnboardingEnabled('on')).toBe(false);
    expect(isOnboardingEnabled('')).toBe(false);
    expect(isOnboardingEnabled(null)).toBe(false);
  });

  it('lee la variable de entorno cuando no recibe argumento', () => {
    const previous = process.env.WHATSAPP_ONBOARDING_ENABLED;
    process.env.WHATSAPP_ONBOARDING_ENABLED = 'yes';
    try {
      expect(isOnboardingEnabled()).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.WHATSAPP_ONBOARDING_ENABLED;
      } else {
        process.env.WHATSAPP_ONBOARDING_ENABLED = previous;
      }
    }
  });
});

describe('isOnboardingNudgeEnabled', () => {
  it('está apagado por default cuando la variable está ausente', () => {
    expect(isOnboardingNudgeEnabled(undefined)).toBe(false);
  });

  it('enciende con true, 1 y yes (case-insensitive)', () => {
    expect(isOnboardingNudgeEnabled('true')).toBe(true);
    expect(isOnboardingNudgeEnabled('1')).toBe(true);
    expect(isOnboardingNudgeEnabled('YES')).toBe(true);
  });

  it('apaga con cualquier otro valor', () => {
    expect(isOnboardingNudgeEnabled('false')).toBe(false);
    expect(isOnboardingNudgeEnabled('nope')).toBe(false);
    expect(isOnboardingNudgeEnabled(null)).toBe(false);
  });

  it('lee WHATSAPP_ONBOARDING_NUDGE_ENABLED cuando no recibe argumento', () => {
    const previous = process.env.WHATSAPP_ONBOARDING_NUDGE_ENABLED;
    process.env.WHATSAPP_ONBOARDING_NUDGE_ENABLED = '1';
    try {
      expect(isOnboardingNudgeEnabled()).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.WHATSAPP_ONBOARDING_NUDGE_ENABLED;
      } else {
        process.env.WHATSAPP_ONBOARDING_NUDGE_ENABLED = previous;
      }
    }
  });
});
