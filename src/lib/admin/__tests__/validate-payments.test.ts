import { describe, expect, it } from 'vitest';
import {
  parseMoneyPositive,
  parsePaidAt,
  parsePaymentMethod,
  parseThresholdDays,
  parseVoidReason,
  ValidationError,
} from '../validate';

describe('parsePaymentMethod', () => {
  it.each(['cash', 'card', 'transfer', 'other'] as const)(
    'accepts %s as a valid payment method',
    (method) => {
      expect(parsePaymentMethod(method)).toBe(method);
    }
  );

  it('throws ValidationError for an invalid payment method', () => {
    expect(() => parsePaymentMethod('check')).toThrow(ValidationError);
    expect(() => parsePaymentMethod('check')).toThrow('Invalid method');
  });
});

describe('parseMoneyPositive', () => {
  it('accepts a positive amount with cents', () => {
    expect(parseMoneyPositive(100.5, 'amount')).toBe(100.5);
  });

  it('rejects zero and negative amounts', () => {
    expect(() => parseMoneyPositive(0, 'amount')).toThrow(ValidationError);
    expect(() => parseMoneyPositive(-1, 'amount')).toThrow(ValidationError);
  });
});

describe('parsePaidAt', () => {
  it('returns a normalized ISO date for a valid value', () => {
    expect(parsePaidAt('2026-09-10T12:30:00Z')).toBe(
      '2026-09-10T12:30:00.000Z'
    );
  });

  it('throws ValidationError for an invalid date', () => {
    expect(() => parsePaidAt('not-a-date')).toThrow(ValidationError);
    expect(() => parsePaidAt('not-a-date')).toThrow('Invalid paidAt');
  });
});

describe('parseVoidReason', () => {
  it('returns a trimmed reversal reason', () => {
    expect(parseVoidReason('  Captura duplicada  ')).toBe('Captura duplicada');
  });

  it('throws ValidationError for an empty reversal reason', () => {
    expect(() => parseVoidReason('')).toThrow(ValidationError);
    expect(() => parseVoidReason('   ')).toThrow(ValidationError);
  });
});

describe('parseThresholdDays', () => {
  it('defaults to 30 days when no value is provided', () => {
    expect(parseThresholdDays(undefined)).toBe(30);
  });

  it('accepts a positive integer threshold', () => {
    expect(parseThresholdDays(15)).toBe(15);
    expect(parseThresholdDays('45')).toBe(45);
  });

  it('throws ValidationError for an invalid threshold', () => {
    expect(() => parseThresholdDays(0)).toThrow(ValidationError);
    expect(() => parseThresholdDays(-1)).toThrow(ValidationError);
    expect(() => parseThresholdDays('abc')).toThrow(ValidationError);
  });
});
