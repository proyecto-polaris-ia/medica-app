import { describe, expect, it } from 'vitest';
import {
  parseHexColor,
  parseNotes,
  parseDate,
  parseSex,
  parseStringArray,
  parseStatus,
  ValidationError,
} from '../validate';

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

describe('parseDate', () => {
  it('returns an ISO date string for a valid date', () => {
    expect(parseDate('1990-05-15')).toBe('1990-05-15');
  });

  it('returns null for missing or whitespace-only values', () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate('   ')).toBeNull();
  });

  it('throws ValidationError for an invalid date string', () => {
    expect(() => parseDate('not-a-date')).toThrow(ValidationError);
    expect(() => parseDate('not-a-date')).toThrow('Invalid date');
  });

  it('uses the provided field name in the error', () => {
    expect(() => parseDate('bad', 'birthDate')).toThrow('Invalid birthDate');
  });
});

describe('parseSex', () => {
  it('returns a valid sex value', () => {
    expect(parseSex('male')).toBe('male');
    expect(parseSex('female')).toBe('female');
    expect(parseSex('other')).toBe('other');
  });

  it('returns null for missing values', () => {
    expect(parseSex(null)).toBeNull();
    expect(parseSex(undefined)).toBeNull();
    expect(parseSex('')).toBeNull();
  });

  it('throws ValidationError for an invalid sex value', () => {
    expect(() => parseSex('unknown')).toThrow(ValidationError);
    expect(() => parseSex('unknown')).toThrow('Invalid sex');
  });
});

describe('parseStringArray', () => {
  it('returns an array of strings', () => {
    expect(parseStringArray(['penicillin', 'latex'])).toEqual([
      'penicillin',
      'latex',
    ]);
  });

  it('filters out non-string values', () => {
    expect(parseStringArray(['a', 1, null, 'b'])).toEqual(['a', 'b']);
  });

  it('returns an empty array for missing or empty input', () => {
    expect(parseStringArray(null)).toEqual([]);
    expect(parseStringArray(undefined)).toEqual([]);
    expect(parseStringArray([])).toEqual([]);
  });

  it('returns an empty array for a non-array value', () => {
    expect(parseStringArray('not-an-array')).toEqual([]);
  });
});

describe('parseStatus', () => {
  it('returns a value from the allowed list', () => {
    expect(parseStatus('yes', ['not_applicable', 'no', 'yes'])).toBe('yes');
  });

  it('returns null for missing values', () => {
    expect(parseStatus(null, ['not_applicable', 'no', 'yes'])).toBeNull();
    expect(parseStatus(undefined, ['not_applicable', 'no', 'yes'])).toBeNull();
    expect(parseStatus('', ['not_applicable', 'no', 'yes'])).toBeNull();
  });

  it('throws ValidationError for a value outside the allowed list', () => {
    expect(() =>
      parseStatus('maybe', ['not_applicable', 'no', 'yes'])
    ).toThrow(ValidationError);
    expect(() =>
      parseStatus('maybe', ['not_applicable', 'no', 'yes'])
    ).toThrow('Invalid status');
  });

  it('uses the provided field name in the error', () => {
    expect(() =>
      parseStatus('maybe', ['not_applicable', 'no', 'yes'], 'pregnancyStatus')
    ).toThrow('Invalid pregnancyStatus');
  });
});
