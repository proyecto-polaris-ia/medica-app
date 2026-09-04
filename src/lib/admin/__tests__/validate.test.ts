import { describe, expect, it } from 'vitest';
import { parseHexColor } from '../validate';

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
