import { describe, expect, it } from 'vitest';
import {
  parseIsoDate,
  parseLocalDate,
  parseNotes,
  parsePhoneE164,
  parseUuid,
  ValidationError,
} from './validate';

describe('parseUuid', () => {
  it('accepts a valid UUID', () => {
    expect(parseUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000'
    );
  });

  it('rejects an empty value', () => {
    expect(() => parseUuid('')).toThrow(ValidationError);
    expect(() => parseUuid('')).toThrow('Invalid id');
  });

  it('uses the provided field name in the error', () => {
    expect(() => parseUuid('', 'providerId')).toThrow('providerId');
  });

  it('rejects a malformed UUID', () => {
    expect(() => parseUuid('not-a-uuid')).toThrow(ValidationError);
  });
});

describe('parseLocalDate', () => {
  it('builds a noon-UTC date for the requested local day', () => {
    const date = parseLocalDate('2026-09-10');
    expect(date.toISOString()).toBe('2026-09-10T12:00:00.000Z');
  });

  it('rejects malformed dates', () => {
    expect(() => parseLocalDate('13-45-99')).toThrow(ValidationError);
    expect(() => parseLocalDate('')).toThrow(ValidationError);
    expect(() => parseLocalDate('2026/09/10')).toThrow(ValidationError);
  });
});

describe('parseIsoDate', () => {
  it('parses a full ISO string', () => {
    const date = parseIsoDate('2026-09-10T14:30:00.000Z');
    expect(date.toISOString()).toBe('2026-09-10T14:30:00.000Z');
  });

  it('rejects non-dates', () => {
    expect(() => parseIsoDate('tomorrow')).toThrow(ValidationError);
    expect(() => parseIsoDate('')).toThrow(ValidationError);
  });
});

describe('parsePhoneE164', () => {
  it('accepts a valid E.164 phone', () => {
    expect(parsePhoneE164('+5215512345678')).toBe('+5215512345678');
  });

  it('rejects a phone without a country code', () => {
    expect(() => parsePhoneE164('5512345678')).toThrow(ValidationError);
  });

  it('rejects an empty phone', () => {
    expect(() => parsePhoneE164('')).toThrow(ValidationError);
  });

  it('rejects a phone with non-numeric characters after +', () => {
    expect(() => parsePhoneE164('+52-155-1234-5678')).toThrow(ValidationError);
  });
});

describe('parseNotes', () => {
  it('returns the trimmed value for non-empty strings', () => {
    expect(parseNotes('  Prefiero mañana  ')).toBe('Prefiero mañana');
  });

  it('returns null for whitespace-only strings', () => {
    expect(parseNotes('   ')).toBeNull();
    expect(parseNotes('\t\n')).toBeNull();
  });

  it('returns null when value is undefined or null', () => {
    expect(parseNotes(undefined)).toBeNull();
    expect(parseNotes(null)).toBeNull();
  });

  it('rejects strings longer than 1000 characters', () => {
    const long = 'a'.repeat(1001);
    expect(() => parseNotes(long)).toThrow(ValidationError);
    expect(() => parseNotes(long)).toThrow('Invalid notes');
  });

  it('accepts strings up to 1000 characters', () => {
    const max = 'a'.repeat(1000);
    expect(parseNotes(max)).toBe(max);
  });

  it('uses the provided field name in the error', () => {
    expect(() => parseNotes('a'.repeat(1001), 'appointmentNotes')).toThrow(
      'Invalid appointmentNotes'
    );
  });
});
