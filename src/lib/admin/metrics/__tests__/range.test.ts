import { describe, expect, it } from 'vitest';
import {
  clinicDateKeyToUtc,
  clinicDateRangeUtc,
  resolveRange,
} from '../range';

describe('clinicDateKeyToUtc', () => {
  it('convierte una fecha local a su medianoche local (UTC-6)', () => {
    expect(clinicDateKeyToUtc('2026-10-01')?.toISOString()).toBe(
      '2026-10-01T06:00:00.000Z'
    );
  });

  it('no desplaza el límite cuando en UTC ya es el día siguiente', () => {
    // 2026-10-01T06:00Z es exactamente la medianoche local del 1 de octubre.
    expect(clinicDateKeyToUtc('2026-10-01')?.toISOString()).toBe(
      '2026-10-01T06:00:00.000Z'
    );
  });

  it('rechaza fechas inválidas', () => {
    expect(clinicDateKeyToUtc('2026-13-01')).toBeNull();
    expect(clinicDateKeyToUtc('2026-02-30')).toBeNull();
    expect(clinicDateKeyToUtc('no-es-fecha')).toBeNull();
  });
});

describe('clinicDateRangeUtc', () => {
  it('devuelve [from 00:00, to+1d 00:00) en la zona clínica', () => {
    const range = clinicDateRangeUtc('2026-10-01', '2026-10-15');
    expect(range?.start.toISOString()).toBe('2026-10-01T06:00:00.000Z');
    expect(range?.end.toISOString()).toBe('2026-10-16T06:00:00.000Z');
  });

  it('un solo día produce una ventana de 24 h', () => {
    const range = clinicDateRangeUtc('2026-10-01', '2026-10-01');
    expect(range?.start.toISOString()).toBe('2026-10-01T06:00:00.000Z');
    expect(range?.end.toISOString()).toBe('2026-10-02T06:00:00.000Z');
  });

  it('fechas inválidas o invertidas → null', () => {
    expect(clinicDateRangeUtc('2026-10-05', '2026-10-01')).toBeNull();
    expect(clinicDateRangeUtc('2026-10-01', 'invalido')).toBeNull();
  });
});

describe('resolveRange', () => {
  it('default = mes clínico', () => {
    const now = new Date('2026-10-15T20:00:00.000Z'); // 14:00 local
    const result = resolveRange({}, now);

    expect(result.preset).toBe('month');
    expect(result.range.start.toISOString()).toBe('2026-10-01T06:00:00.000Z');
    expect(result.range.end.toISOString()).toBe('2026-11-01T06:00:00.000Z');
  });

  it('mes usa el mes clínico, no la fecha UTC del servidor', () => {
    // 2026-10-01T03:00Z es 2026-09-30 21:00 local: debe resolver septiembre.
    const now = new Date('2026-10-01T03:00:00.000Z');
    const result = resolveRange({ preset: 'month' }, now);

    expect(result.preset).toBe('month');
    expect(result.range.start.toISOString()).toBe('2026-09-01T06:00:00.000Z');
    expect(result.range.end.toISOString()).toBe('2026-10-01T06:00:00.000Z');
  });

  it('semana empieza el lunes a medianoche local y termina el lunes siguiente', () => {
    // 2026-10-02 es viernes local.
    const now = new Date('2026-10-02T20:00:00.000Z');
    const result = resolveRange({ preset: 'week' }, now);

    expect(result.preset).toBe('week');
    // Lunes 2026-09-28 → lunes 2026-10-05.
    expect(result.range.start.toISOString()).toBe('2026-09-28T06:00:00.000Z');
    expect(result.range.end.toISOString()).toBe('2026-10-05T06:00:00.000Z');
  });

  it('la semana se calcula desde el día clínico aunque el día UTC ya sea el siguiente', () => {
    // 2026-10-01T03:00Z = miércoles 2026-09-30 21:00 local → semana del 28 de septiembre.
    const now = new Date('2026-10-01T03:00:00.000Z');
    const result = resolveRange({ preset: 'week' }, now);

    expect(result.range.start.toISOString()).toBe('2026-09-28T06:00:00.000Z');
    expect(result.range.end.toISOString()).toBe('2026-10-05T06:00:00.000Z');
  });

  it('custom usa [from 00:00, to+1d 00:00)', () => {
    const now = new Date('2026-10-20T20:00:00.000Z');
    const result = resolveRange(
      { preset: 'custom', from: '2026-10-01', to: '2026-10-15' },
      now
    );

    expect(result.preset).toBe('custom');
    expect(result.range.start.toISOString()).toBe('2026-10-01T06:00:00.000Z');
    expect(result.range.end.toISOString()).toBe('2026-10-16T06:00:00.000Z');
  });

  it('custom de un solo día', () => {
    const now = new Date('2026-10-20T20:00:00.000Z');
    const result = resolveRange(
      { preset: 'custom', from: '2026-10-01', to: '2026-10-01' },
      now
    );

    expect(result.range.start.toISOString()).toBe('2026-10-01T06:00:00.000Z');
    expect(result.range.end.toISOString()).toBe('2026-10-02T06:00:00.000Z');
  });

  it('custom incompleto → fallback a mes', () => {
    const now = new Date('2026-10-15T20:00:00.000Z');
    const result = resolveRange({ preset: 'custom', from: '2026-10-01' }, now);

    expect(result.preset).toBe('month');
    expect(result.range.start.toISOString()).toBe('2026-10-01T06:00:00.000Z');
    expect(result.range.end.toISOString()).toBe('2026-11-01T06:00:00.000Z');
  });

  it('custom inválido o invertido → fallback a mes', () => {
    const now = new Date('2026-10-15T20:00:00.000Z');
    const invalid = resolveRange(
      { preset: 'custom', from: '2026-13-01', to: '2026-13-10' },
      now
    );
    const inverted = resolveRange(
      { preset: 'custom', from: '2026-10-15', to: '2026-10-01' },
      now
    );

    expect(invalid.preset).toBe('month');
    expect(inverted.preset).toBe('month');
    expect(inverted.range.start.toISOString()).toBe('2026-10-01T06:00:00.000Z');
  });

  it('preset desconocido → fallback a mes', () => {
    const now = new Date('2026-10-15T20:00:00.000Z');
    const result = resolveRange({ preset: 'anio' }, now);

    expect(result.preset).toBe('month');
  });
});
