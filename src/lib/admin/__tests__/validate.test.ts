import { describe, expect, it } from 'vitest';
import { parseHexColor, parseNotes, ValidationError } from '../validate';

describe('parseHexColor', () => {
  it('returns a normalized lowercase hex color', () => {
    expect(parseHexColor('#1F77B4')).toBe('#1f77b4');
  });

  it('returns null for an invalid color string', () => {
    expect(parseHexColor('red')).toBeNull();
  });

  it('returns null when color is missing', () => {
    expect(parseHexColor(null)).toBeNull();
    expect(parseHexColor(undefined)).toBeNull();
    expect(parseHexColor('')).toBeNull();
  });

  it('rejects short or malformed hex strings', () => {
    expect(parseHexColor('#12345')).toBeNull();
    expect(parseHexColor('#gggggg')).toBeNull();
    expect(parseHexColor('123456')).toBeNull();
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
