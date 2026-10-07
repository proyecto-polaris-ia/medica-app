import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('@/lib/wcc-client', () => ({
  isSupabaseConfigured: vi.fn(() => true),
}));

import { getSupabaseAdmin } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/wcc-client';
import { computeMetrics } from '@/lib/admin/metrics/aggregate';
import { resolveRange } from '@/lib/admin/metrics/range';
import { getNoraView } from '../loader';

type Row = Record<string, unknown>;
type QueryResult = { data: Row[] | null; error: { message?: string } | null };

interface MockQuery extends PromiseLike<QueryResult> {
  select: ReturnType<typeof vi.fn>;
  lt: ReturnType<typeof vi.fn>;
  gt: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
}

function query(rows: Row[], error: { message?: string } | null = null): MockQuery {
  const value: QueryResult = { data: rows, error };
  return Object.assign(Promise.resolve(value), {
    select: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
  }) as unknown as MockQuery;
}

function makeDb(
  tables: Record<string, Row[]>,
  errors: Record<string, { message?: string }> = {}
) {
  const created: Record<string, MockQuery[]> = {};
  const from = vi.fn((table: string) => {
    const q = query(tables[table] ?? [], errors[table] ?? null);
    (created[table] ??= []).push(q);
    return q;
  });
  (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({ from });
  return { from, created };
}

type MockMethod = 'select' | 'lt' | 'gt' | 'in';

function callsFor(table: MockQuery[] | undefined, method: MockMethod) {
  return (table ?? []).flatMap((q) => q[method].mock.calls);
}

// Rango: mes clínico de octubre 2026 (medianoche local UTC−6).
const NOW = new Date('2026-10-15T18:00:00.000Z');
const OCT_START = '2026-10-01T06:00:00.000Z';
const OCT_END = '2026-11-01T06:00:00.000Z';

const APPOINTMENT_ROW = {
  id: 'appt-1',
  provider_id: 'provider-1',
  start_at: '2026-10-05T16:00:00.000Z', // lun 5 oct, 10:00 local
  end_at: '2026-10-05T17:00:00.000Z',
  status: 'confirmed',
};

const BUSINESS_HOUR_ROW = {
  id: 'bh-1',
  provider_id: 'provider-1',
  day_of_week: 1, // lunes
  start_time: '09:00:00',
  end_time: '18:00:00',
};

const PROVIDER_ROW = { id: 'provider-1', name: 'Dra. Ana' };

describe('getNoraView', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
  });

  it('reutiliza computeMetrics: la ocupación y el no-show son idénticos al motor', async () => {
    makeDb({
      appointments: [APPOINTMENT_ROW],
      business_hours: [BUSINESS_HOUR_ROW],
      providers: [PROVIDER_ROW],
    });

    const view = await getNoraView({ preset: 'month' }, NOW);

    const { range } = resolveRange({ preset: 'month' }, NOW);
    const expected = computeMetrics({
      appointments: [
        {
          id: 'appt-1',
          providerId: 'provider-1',
          startAt: '2026-10-05T16:00:00.000Z',
          endAt: '2026-10-05T17:00:00.000Z',
          status: 'confirmed',
        },
      ],
      businessHours: [
        {
          providerId: 'provider-1',
          dayOfWeek: 1,
          startTime: '09:00:00',
          endTime: '18:00:00',
        },
      ],
      providers: [{ id: 'provider-1', name: 'Dra. Ana' }],
      range,
    });

    expect(view.metrics).toEqual(expected);
    expect(view.metrics?.occupancyPct).toBe(expected.occupancyPct);
    expect(view.metrics?.noShowRatePct).toBe(expected.noShowRatePct);
    expect(view.isSupabaseConfigured).toBe(true);
    expect(view.isConfiguredButUnavailable).toBe(false);
  });

  it('lee las citas del rango con el predicado de solape semiabierto y una sola vez cada tabla', async () => {
    const { from, created } = makeDb({
      appointments: [APPOINTMENT_ROW],
      business_hours: [BUSINESS_HOUR_ROW],
      providers: [PROVIDER_ROW],
    });

    await getNoraView({ preset: 'month' }, NOW);

    expect(callsFor(created.appointments, 'lt')).toEqual([['start_at', OCT_END]]);
    expect(callsFor(created.appointments, 'gt')).toEqual([['end_at', OCT_START]]);
    expect(from.mock.calls.filter(([t]) => t === 'appointments')).toHaveLength(1);
    expect(from.mock.calls.filter(([t]) => t === 'business_hours')).toHaveLength(1);
    expect(from.mock.calls.filter(([t]) => t === 'providers')).toHaveLength(1);
    expect(callsFor(created.providers, 'in')).toEqual([['id', ['provider-1']]]);
  });

  it('calcula los huecos a partir de business_hours y citas activas', async () => {
    makeDb({
      appointments: [APPOINTMENT_ROW],
      business_hours: [BUSINESS_HOUR_ROW],
      providers: [PROVIDER_ROW],
    });

    // Un solo día clínico (lunes 5 de octubre) para acotar los huecos.
    const view = await getNoraView(
      { preset: 'custom', from: '2026-10-05', to: '2026-10-05' },
      NOW
    );

    expect(view.gaps).toEqual([
      {
        providerId: 'provider-1',
        dayKey: '2026-10-05',
        startAt: '2026-10-05T15:00:00.000Z',
        endAt: '2026-10-05T16:00:00.000Z',
        minutes: 60,
      },
      {
        providerId: 'provider-1',
        dayKey: '2026-10-05',
        startAt: '2026-10-05T17:00:00.000Z',
        endAt: '2026-10-06T00:00:00.000Z',
        minutes: 420,
      },
    ]);
  });

  it('sin configuración de Supabase reporta la vista no disponible sin consultar', async () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);
    const { from } = makeDb({ appointments: [], business_hours: [], providers: [] });

    const view = await getNoraView({ preset: 'month' }, NOW);

    expect(view.isSupabaseConfigured).toBe(false);
    expect(view.isConfiguredButUnavailable).toBe(false);
    expect(view.metrics).toBeNull();
    expect(view.gaps).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it('cuando la lectura falla degrada con isConfiguredButUnavailable y nunca lanza', async () => {
    makeDb(
      { appointments: [], business_hours: [], providers: [] },
      { appointments: { message: 'db down' } }
    );

    const view = await getNoraView({ preset: 'month' }, NOW);

    expect(view.isSupabaseConfigured).toBe(true);
    expect(view.isConfiguredButUnavailable).toBe(true);
    expect(view.metrics).toBeNull();
    expect(view.gaps).toEqual([]);
  });

  it('un rango sin citas ni business_hours produce estado vacío (metrics null, gaps [])', async () => {
    makeDb({ appointments: [], business_hours: [], providers: [] });

    const view = await getNoraView({ preset: 'month' }, NOW);

    expect(view.metrics).toBeNull();
    expect(view.gaps).toEqual([]);
    expect(view.isConfiguredButUnavailable).toBe(false);
  });

  it('expone preset, rango y etiqueta del rango en la zona clínica', async () => {
    makeDb({
      appointments: [APPOINTMENT_ROW],
      business_hours: [BUSINESS_HOUR_ROW],
      providers: [PROVIDER_ROW],
    });

    const view = await getNoraView({ preset: 'month' }, NOW);

    expect(view.preset).toBe('month');
    expect(view.range).toEqual({ startAt: OCT_START, endAt: OCT_END });
    expect(view.rangeLabel).toBe('1 – 31 de octubre, 2026');
    expect(view.generatedAt).toBe(NOW.toISOString());
  });

  it('el fallo de una sola lectura (business_hours) degrada toda la vista', async () => {
    makeDb(
      { appointments: [APPOINTMENT_ROW], business_hours: [], providers: [PROVIDER_ROW] },
      { business_hours: { message: 'timeout' } }
    );

    const view = await getNoraView({ preset: 'month' }, NOW);

    expect(view.isConfiguredButUnavailable).toBe(true);
    expect(view.metrics).toBeNull();
    expect(view.gaps).toEqual([]);
  });

  it('el fallo de la lectura de providers degrada toda la vista', async () => {
    makeDb(
      { appointments: [APPOINTMENT_ROW], business_hours: [BUSINESS_HOUR_ROW], providers: [] },
      { providers: { message: 'timeout' } }
    );

    const view = await getNoraView({ preset: 'month' }, NOW);

    expect(view.isConfiguredButUnavailable).toBe(true);
    expect(view.metrics).toBeNull();
  });

  it('un rango custom inválido cae al mes clínico sin romper', async () => {
    makeDb({
      appointments: [APPOINTMENT_ROW],
      business_hours: [BUSINESS_HOUR_ROW],
      providers: [PROVIDER_ROW],
    });

    const view = await getNoraView(
      { preset: 'custom', from: '2026-10-10', to: '2026-10-05' },
      NOW
    );

    expect(view.preset).toBe('month');
    expect(view.range).toEqual({ startAt: OCT_START, endAt: OCT_END });
    expect(view.metrics).not.toBeNull();
  });

  it('un proveedor sin business_hours no aporta huecos y no rompe los indicadores', async () => {
    makeDb({
      appointments: [
        APPOINTMENT_ROW,
        {
          id: 'appt-2',
          provider_id: 'provider-2',
          start_at: '2026-10-06T16:00:00.000Z',
          end_at: '2026-10-06T17:00:00.000Z',
          status: 'confirmed',
        },
      ],
      business_hours: [BUSINESS_HOUR_ROW],
      providers: [PROVIDER_ROW, { id: 'provider-2', name: 'Dr. Beto' }],
    });

    const view = await getNoraView({ preset: 'month' }, NOW);

    expect(view.gaps.every((gap) => gap.providerId === 'provider-1')).toBe(true);
    expect(
      view.metrics?.providers.find((p) => p.providerId === 'provider-2')
    ).toEqual(
      expect.objectContaining({ providerName: 'Dr. Beto', capacityMinutes: 0 })
    );
  });

  it('cuando el cliente de Supabase lanza degrada sin propagar la excepción', async () => {
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('boom');
    });

    const view = await getNoraView({ preset: 'month' }, NOW);

    expect(view.isConfiguredButUnavailable).toBe(true);
    expect(view.metrics).toBeNull();
    expect(view.gaps).toEqual([]);
  });
});
