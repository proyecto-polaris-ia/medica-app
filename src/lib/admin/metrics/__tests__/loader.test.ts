import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('@/lib/wcc-client', () => ({
  isSupabaseConfigured: vi.fn(() => true),
}));

import { getSupabaseAdmin } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/wcc-client';
import { getDashboardMetrics } from '../loader';

type Row = Record<string, unknown>;
type QueryResult = { data: Row[] | null; error: { message?: string } | null };

interface MockQuery extends PromiseLike<QueryResult> {
  select: ReturnType<typeof vi.fn>;
  lt: ReturnType<typeof vi.fn>;
  gt: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
}

function query(rows: Row[], error: { message?: string } | null = null): MockQuery {
  const value: QueryResult = { data: rows, error };
  return Object.assign(Promise.resolve(value), {
    select: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
  }) as unknown as MockQuery;
}

function makeDb(tables: Record<string, Row[]>, errors: Record<string, { message?: string }> = {}) {
  const created: Record<string, MockQuery[]> = {};
  const from = vi.fn((table: string) => {
    const q = query(tables[table] ?? [], errors[table] ?? null);
    (created[table] ??= []).push(q);
    return q;
  });
  (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({ from });
  return { from, created };
}

type MockMethod = 'select' | 'lt' | 'gt' | 'in' | 'range';

function callsFor(table: MockQuery[] | undefined, method: MockMethod) {
  return (table ?? []).flatMap((q) => q[method].mock.calls);
}

// Rango: el mes clínico de octubre 2026 (medianoche local UTC−6).
const NOW = new Date('2026-10-15T18:00:00.000Z');
const OCT_START = '2026-10-01T06:00:00.000Z';
const OCT_END = '2026-11-01T06:00:00.000Z';

const APPOINTMENT_ROW = {
  id: 'appt-1',
  provider_id: 'provider-1',
  start_at: '2026-10-05T16:00:00.000Z',
  end_at: '2026-10-05T17:00:00.000Z',
  status: 'confirmed',
};

const BUSINESS_HOUR_ROW = {
  id: 'bh-1',
  provider_id: 'provider-1',
  day_of_week: 1,
  start_time: '09:00:00',
  end_time: '18:00:00',
};

describe('getDashboardMetrics', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
  });

  it('lee citas del rango con el predicado de solape semiabierto y columnas mínimas', async () => {
    const { created } = makeDb({
      appointments: [APPOINTMENT_ROW],
      business_hours: [BUSINESS_HOUR_ROW],
      providers: [{ id: 'provider-1', name: 'Dra. Ana' }],
    });

    await getDashboardMetrics({ preset: 'month' }, NOW);

    expect(callsFor(created.appointments, 'select')).toEqual([
      ['id, provider_id, start_at, end_at, status'],
    ]);
    expect(callsFor(created.appointments, 'lt')).toEqual([['start_at', OCT_END]]);
    expect(callsFor(created.appointments, 'gt')).toEqual([['end_at', OCT_START]]);
    expect(created.appointments).toHaveLength(1);
  });

  it('lee business_hours una sola vez con sus columnas mínimas', async () => {
    const { created } = makeDb({
      appointments: [APPOINTMENT_ROW],
      business_hours: [BUSINESS_HOUR_ROW],
      providers: [{ id: 'provider-1', name: 'Dra. Ana' }],
    });

    await getDashboardMetrics({ preset: 'month' }, NOW);

    expect(callsFor(created.business_hours, 'select')).toEqual([
      ['id, provider_id, day_of_week, start_time, end_time'],
    ]);
    expect(created.business_hours).toHaveLength(1);
  });

  it('hace un join por lote a providers con la unión de ids de citas y business_hours (sin N+1)', async () => {
    const { from, created } = makeDb({
      appointments: [APPOINTMENT_ROW],
      business_hours: [
        BUSINESS_HOUR_ROW,
        { id: 'bh-2', provider_id: 'provider-2', day_of_week: 2, start_time: '10:00:00', end_time: '14:00:00' },
      ],
      providers: [
        { id: 'provider-1', name: 'Dra. Ana' },
        { id: 'provider-2', name: 'Dr. Beto' },
      ],
    });

    await getDashboardMetrics({ preset: 'month' }, NOW);

    // Una sola lectura por tabla, sin importar cuántos proveedores haya.
    expect(from.mock.calls.filter(([t]) => t === 'appointments')).toHaveLength(1);
    expect(from.mock.calls.filter(([t]) => t === 'business_hours')).toHaveLength(1);
    expect(from.mock.calls.filter(([t]) => t === 'providers')).toHaveLength(1);
    expect(callsFor(created.providers, 'select')).toEqual([['id, name']]);
    expect(callsFor(created.providers, 'in')).toEqual([
      ['id', ['provider-1', 'provider-2']],
    ]);
  });

  it('mapea las filas a la lib pura y resuelve los nombres de proveedor', async () => {
    makeDb({
      appointments: [APPOINTMENT_ROW],
      business_hours: [BUSINESS_HOUR_ROW],
      providers: [{ id: 'provider-1', name: 'Dra. Ana' }],
    });

    const view = await getDashboardMetrics({ preset: 'month' }, NOW);

    expect(view.isSupabaseConfigured).toBe(true);
    expect(view.isConfiguredButUnavailable).toBe(false);
    expect(view.metrics).not.toBeNull();
    expect(view.metrics?.totalAppointments).toBe(1);
    expect(view.metrics?.occupiedMinutes).toBe(60);
    expect(view.metrics?.providers).toEqual([
      expect.objectContaining({
        providerId: 'provider-1',
        providerName: 'Dra. Ana',
        occupiedMinutes: 60,
      }),
    ]);
    expect(view.preset).toBe('month');
    expect(view.range).toEqual({ startAt: OCT_START, endAt: OCT_END });
    expect(view.generatedAt).toBe(NOW.toISOString());
  });

  it('rango sin citas ni business_hours → metrics null (estado vacío)', async () => {
    const { from } = makeDb({ appointments: [], business_hours: [], providers: [] });

    const view = await getDashboardMetrics({ preset: 'month' }, NOW);

    expect(view.metrics).toBeNull();
    expect(from.mock.calls.filter(([t]) => t === 'providers')).toHaveLength(0);
  });

  it('proveedor con solo business_hours conserva su nombre por el join por lote', async () => {
    makeDb({
      appointments: [],
      business_hours: [
        { id: 'bh-2', provider_id: 'provider-2', day_of_week: 1, start_time: '09:00:00', end_time: '13:00:00' },
      ],
      providers: [{ id: 'provider-2', name: 'Dr. Beto' }],
    });

    const view = await getDashboardMetrics({ preset: 'month' }, NOW);

    expect(view.metrics).not.toBeNull();
    expect(view.metrics?.providers).toEqual([
      expect.objectContaining({ providerId: 'provider-2', providerName: 'Dr. Beto', occupancyPct: 0 }),
    ]);
  });

  it('sin configuración de Supabase devuelve isSupabaseConfigured false sin consultar', async () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);
    const { from } = makeDb({ appointments: [], business_hours: [], providers: [] });

    const view = await getDashboardMetrics({ preset: 'month' }, NOW);

    expect(view.isSupabaseConfigured).toBe(false);
    expect(view.isConfiguredButUnavailable).toBe(false);
    expect(view.metrics).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('cuando el cliente lanza devuelve isConfiguredButUnavailable true (nunca lanza)', async () => {
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('boom');
    });

    const view = await getDashboardMetrics({ preset: 'month' }, NOW);

    expect(view.isSupabaseConfigured).toBe(true);
    expect(view.isConfiguredButUnavailable).toBe(true);
    expect(view.metrics).toBeNull();
  });

  it('cuando una consulta devuelve error degrada sin lanzar', async () => {
    makeDb(
      { appointments: [], business_hours: [], providers: [] },
      { appointments: { message: 'db down' } }
    );

    const view = await getDashboardMetrics({ preset: 'month' }, NOW);

    expect(view.isConfiguredButUnavailable).toBe(true);
    expect(view.metrics).toBeNull();
  });

  it('etiqueta el rango en es-MX con la zona clínica (último día inclusivo)', async () => {
    makeDb({
      appointments: [APPOINTMENT_ROW],
      business_hours: [BUSINESS_HOUR_ROW],
      providers: [{ id: 'provider-1', name: 'Dra. Ana' }],
    });

    const view = await getDashboardMetrics({ preset: 'month' }, NOW);

    expect(view.rangeLabel).toBe('1 – 31 de octubre, 2026');
  });

  it('preset week usa la semana clínica (lunes a lunes)', async () => {
    const { created } = makeDb({
      appointments: [],
      business_hours: [BUSINESS_HOUR_ROW],
      providers: [{ id: 'provider-1', name: 'Dra. Ana' }],
    });

    const view = await getDashboardMetrics({ preset: 'week' }, NOW);

    expect(callsFor(created.appointments, 'lt')).toEqual([['start_at', '2026-10-19T06:00:00.000Z']]);
    expect(callsFor(created.appointments, 'gt')).toEqual([['end_at', '2026-10-12T06:00:00.000Z']]);
    expect(view.range).toEqual({
      startAt: '2026-10-12T06:00:00.000Z',
      endAt: '2026-10-19T06:00:00.000Z',
    });
  });

  it('preset custom usa from/to y cae a month cuando es inválido', async () => {
    const { created } = makeDb({
      appointments: [],
      business_hours: [BUSINESS_HOUR_ROW],
      providers: [{ id: 'provider-1', name: 'Dra. Ana' }],
    });

    const view = await getDashboardMetrics(
      { preset: 'custom', from: '2026-10-05', to: '2026-10-07' },
      NOW
    );

    expect(view.preset).toBe('custom');
    expect(callsFor(created.appointments, 'gt')).toEqual([['end_at', '2026-10-05T06:00:00.000Z']]);
    expect(callsFor(created.appointments, 'lt')).toEqual([['start_at', '2026-10-08T06:00:00.000Z']]);

    const fallback = await getDashboardMetrics(
      { preset: 'custom', from: '2026-10-10', to: '2026-10-05' },
      NOW
    );
    expect(fallback.preset).toBe('month');
  });
});
