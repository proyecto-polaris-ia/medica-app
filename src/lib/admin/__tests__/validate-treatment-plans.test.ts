import { describe, expect, it } from 'vitest';
import {
  parseFdiTooth,
  parseMoney,
  parseQuantity,
  parseTreatmentPlanItemStatus,
  parseTreatmentPlanStatus,
  ValidationError,
} from '../validate';

describe('parseTreatmentPlanStatus', () => {
  it.each([
    'draft',
    'presented',
    'accepted',
    'in_progress',
    'completed',
    'cancelled',
  ] as const)('accepts %s', (status) => {
    expect(parseTreatmentPlanStatus(status)).toBe(status);
  });

  it('throws ValidationError for an unknown status', () => {
    expect(() => parseTreatmentPlanStatus('unknown_status')).toThrow(
      ValidationError
    );
    expect(() => parseTreatmentPlanStatus('unknown_status')).toThrow(
      'Invalid status'
    );
  });

  it('throws ValidationError for an empty string', () => {
    expect(() => parseTreatmentPlanStatus('')).toThrow(ValidationError);
  });

  it('throws ValidationError for undefined and null', () => {
    expect(() => parseTreatmentPlanStatus(undefined)).toThrow(ValidationError);
    expect(() => parseTreatmentPlanStatus(null)).toThrow(ValidationError);
  });

  it('uses the provided field name in the error', () => {
    expect(() =>
      parseTreatmentPlanStatus('bad', 'planStatus')
    ).toThrow('Invalid planStatus');
  });
});

describe('parseTreatmentPlanItemStatus', () => {
  it.each(['pending', 'done'] as const)('accepts %s', (status) => {
    expect(parseTreatmentPlanItemStatus(status)).toBe(status);
  });

  it('throws ValidationError for an invalid status', () => {
    expect(() => parseTreatmentPlanItemStatus('invalid')).toThrow(
      ValidationError
    );
    expect(() => parseTreatmentPlanItemStatus('invalid')).toThrow(
      'Invalid status'
    );
  });

  it('throws ValidationError for an empty string', () => {
    expect(() => parseTreatmentPlanItemStatus('')).toThrow(ValidationError);
  });

  it('throws ValidationError for undefined and null', () => {
    expect(() => parseTreatmentPlanItemStatus(undefined)).toThrow(
      ValidationError
    );
    expect(() => parseTreatmentPlanItemStatus(null)).toThrow(ValidationError);
  });
});

describe('parseMoney', () => {
  it('accepts zero', () => {
    expect(parseMoney(0)).toBe(0);
  });

  it('accepts a positive amount with up to two decimals', () => {
    expect(parseMoney(100.5)).toBe(100.5);
    expect(parseMoney(99.99)).toBe(99.99);
  });

  it('accepts a small positive amount', () => {
    expect(parseMoney(0.01)).toBe(0.01);
  });

  it('rejects negative amounts', () => {
    expect(() => parseMoney(-50.0)).toThrow(ValidationError);
    expect(() => parseMoney(-50.0)).toThrow('Invalid unitPrice');
  });

  it('rejects amounts with more than two decimals', () => {
    expect(() => parseMoney(100.555)).toThrow(ValidationError);
  });

  it('rejects non-numeric values', () => {
    expect(() => parseMoney('abc')).toThrow(ValidationError);
    expect(() => parseMoney(null)).toThrow(ValidationError);
    expect(() => parseMoney(undefined)).toThrow(ValidationError);
  });

  it('rejects NaN and Infinity', () => {
    expect(() => parseMoney(NaN)).toThrow(ValidationError);
    expect(() => parseMoney(Infinity)).toThrow(ValidationError);
  });

  it('uses the provided field name in the error', () => {
    expect(() => parseMoney(-1, 'totalAmount')).toThrow('Invalid totalAmount');
  });
});

describe('parseFdiTooth', () => {
  it.each(['11', '26', '47', '18'])('accepts %s as a valid FDI tooth', (tooth) => {
    expect(parseFdiTooth(tooth)).toBe(tooth);
  });

  it('returns null for null and undefined', () => {
    expect(parseFdiTooth(null)).toBeNull();
    expect(parseFdiTooth(undefined)).toBeNull();
  });

  it('throws ValidationError for invalid FDI notation', () => {
    expect(() => parseFdiTooth('99')).toThrow(ValidationError);
    expect(() => parseFdiTooth('1')).toThrow(ValidationError);
    expect(() => parseFdiTooth('a1')).toThrow(ValidationError);
    expect(() => parseFdiTooth('')).toThrow(ValidationError);
  });

  it('uses the provided field name in the error', () => {
    expect(() => parseFdiTooth('99', 'toothNumber')).toThrow(
      'Invalid toothNumber'
    );
  });
});

describe('parseQuantity', () => {
  it.each([1, 3, 100])('accepts positive integer %d', (quantity) => {
    expect(parseQuantity(quantity)).toBe(quantity);
  });

  it('rejects zero', () => {
    expect(() => parseQuantity(0)).toThrow(ValidationError);
  });

  it('rejects negative integers', () => {
    expect(() => parseQuantity(-1)).toThrow(ValidationError);
  });

  it('rejects non-integers', () => {
    expect(() => parseQuantity(1.5)).toThrow(ValidationError);
  });

  it('rejects non-numeric values', () => {
    expect(() => parseQuantity('abc')).toThrow(ValidationError);
    expect(() => parseQuantity(null)).toThrow(ValidationError);
    expect(() => parseQuantity(undefined)).toThrow(ValidationError);
  });

  it('uses the provided field name in the error', () => {
    expect(() => parseQuantity(-1, 'itemQuantity')).toThrow(
      'Invalid itemQuantity'
    );
  });
});
