import { describe, expect, it } from 'vitest';
import { isEveWhatsAppEnabled } from '@/lib/whatsapp/eve-flag';

describe('isEveWhatsAppEnabled', () => {
  it('is false when unset or null', () => {
    expect(isEveWhatsAppEnabled(undefined)).toBe(false);
    expect(isEveWhatsAppEnabled(null)).toBe(false);
    expect(isEveWhatsAppEnabled('')).toBe(false);
  });

  it('is false for falsy values', () => {
    expect(isEveWhatsAppEnabled('false')).toBe(false);
    expect(isEveWhatsAppEnabled('0')).toBe(false);
    expect(isEveWhatsAppEnabled('no')).toBe(false);
  });

  it('is true for truthy values (true / 1 / yes)', () => {
    expect(isEveWhatsAppEnabled('true')).toBe(true);
    expect(isEveWhatsAppEnabled('1')).toBe(true);
    expect(isEveWhatsAppEnabled('yes')).toBe(true);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(isEveWhatsAppEnabled(' TRUE ')).toBe(true);
    expect(isEveWhatsAppEnabled('Yes')).toBe(true);
    expect(isEveWhatsAppEnabled('  false  ')).toBe(false);
  });
});
