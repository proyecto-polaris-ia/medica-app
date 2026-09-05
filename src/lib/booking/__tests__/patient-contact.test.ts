import { describe, expect, it } from 'vitest';
import { normalizePatientContact } from '../patient-contact';

describe('normalizePatientContact', () => {
  it('normalizes email-only contact and preserves a missing phone', () => {
    expect(normalizePatientContact({ email: '  MARIA@Example.COM ' })).toEqual({
      phone: undefined,
      email: 'maria@example.com',
    });
  });

  it('accepts both contact methods and rejects no contact', () => {
    expect(normalizePatientContact({ phone: '+5215512345678', email: 'juan@example.com' })).toEqual({
      phone: '+5215512345678',
      email: 'juan@example.com',
    });
    expect(() => normalizePatientContact({})).toThrow('contact');
  });
});
