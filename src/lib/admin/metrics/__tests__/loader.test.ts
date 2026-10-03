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

/**
 * `tables` acepta filas fijas o una función por número de lectura de esa tabla
 * (0 = primera lectura), para distinguir la lectura del rango actual de la del
 * periodo anterior.
 */
function makeDb(
  tables: Record<string, Row[] | ((call: number) => Row[])>,
  errors: Record<string, { message?: string }> = {}
) {
  const created: Record<string, MockQuery[]> = {};
  const from = vi.fn((table: string) => {
    const entry = tables[table] ?? [];
    const tableReads = (created[table] ??= []);
    const tableRows = typeof entry === 'function' ? entry(tableReads.length) : entry;
    const q = query(tableRows, errors[table] ?? null);
    tableReads.push(q);
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
const SEP_START = '2026-09-01T06:00:00.000Z';
const SEP_END = '2026-10-01T06:00:00.000Z';
const APPOINTMENT_COLUMNS = 'id, provider_id, start_at, end_at, status';

const APPOINTMENT_ROW = {
  id: 'appt-1',
  provider_id: 'provider-1',
  start_at: '2026-10-05T16:00:00.000Z',
  end_at: '2026-10-05T17:00:00.000Z',
  status: 'confirmed',
};

// Cita del periodo anterior (septiembre) que no solapa octubre.
const PREVIOUS_APPOINTMENT_ROW = {
  id: 'appt-0',
  provider_id: 'provider-2',
  start_at: '2026-09-07T16:00:00.000Z',
  end_at: '2026-09-07T17:00:00.000Z',
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

  it('lee citas del rango actual y del periodo anterior con el predicado de solape semiabierto', async () => {
    const { created } = makeDb({
      appointments: [APPOINTMENT_ROW],
      business_hours: [BUSINESS_HOUR_ROW],
      providers: [{ id: 'provider-1', name: 'Dra. Ana' }],
    });

    await getDashboardMetrics({ preset: 'month' }, NOW);

    expect(created.appointments).toHaveLength(2);
    expect(callsFor(created.appointments, 'select')).toEqual([
      [APPOINTMENT_COLUMNS],
      [APPOINTMENT_COLUMNS],
    ]);
    expect(callsFor(created.appointments, 'lt')).toEqual([
      ['start_at', OCT_END],
      ['start_at', SEP_END],
    ]);
    expect(callsFor(created.appointments, 'gt')).toEqual([
      ['end_at', OCT_START],
      ['end_at', SEP_START],
    ]);
  });

  it('preset week lee la semana anterior completa (desplazada 7 días)', async () => {
    const { created } = makeDb({
      appointments: [],
      business_hours: [BUSINESS_HOUR_ROW],
      providers: [{ id: 'provider-1', name: 'Dra. Ana' }],
    });

    await getDashboardMetrics({ preset: 'week' }, NOW);

    // NOW = jueves 15 de octubre → semana del lunes 12 al lunes 19.
    expect(callsFor(created.appointments, 'lt')).toEqual([
      ['start_at', '2026-10-19T06:00:00.000Z'],
      ['start_at', '2026-10-12T06:00:00.000Z'],
    ]);
    expect(callsFor(created.appointments, 'gt')).toEqual([
      ['end_at', '2026-10-12T06:00:00.000Z'],
      ['end_at', '2026-10-05T06:00:00.000Z'],
    ]);
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

  it('mantiene 2 lecturas de citas + 1 de business_hours + 1 de providers (sin N+1)', async () => {
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

    expect(from.mock.calls.filter(([t]) => t === 'appointments')).toHaveLength(2);
    expect(from.mock.calls.filter(([t]) => t === 'business_hours')).toHaveLength(1);
    expect(from.mock.calls.filter(([t]) => t === 'providers')).toHaveLength(1);
    expect(callsFor(created.providers, 'select')).toEqual([['id, name']]);
    expect(callsFor(created.providers, 'in')).toEqual([
      ['id', ['provider-1', 'provider-2']],
    ]);
  });

  it('el join a providers cubre la unión de citas actuales, previas y business_hours', async () => {
    const { created } = makeDb({
      appointments: (call) =>
        call === 0 ? [APPOINTMENT_ROW] : [PREVIOUS_APPOINTMENT_ROW],
      business_hours: [
        { id: 'bh-3', provider_id: 'provider-3', day_of_week: 1, start_time: '09:00:00', end_time: '18:00:00' },
      ],
      providers: [
        { id: 'provider-1', name: 'Dra. Ana' },
        { id: 'provider-2', name: 'Dr. Beto' },
        { id: 'provider-3', name: 'Dra. Caro' },
      ],
    });

    await getDashboardMetrics({ preset: 'month' }, NOW);

    expect(callsFor(created.providers, 'in')).toEqual([
      ['id', ['provider-1', 'provider-2', 'provider-3']],
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

  it('expone la tendencia con el periodo anterior y la serie en el view model', async () => {
    makeDb({
      appointments: [APPOINTMENT_ROW],
      business_hours: [BUSINESS_HOUR_ROW],
      providers: [{ id: 'provider-1', name: 'Dra. Ana' }],
    });

    const view = await getDashboardMetrics({ preset: 'month' }, NOW);

    expect(view.trend).not.toBeNull();
    expect(view.trend?.previousRange).toEqual({
      start: new Date(SEP_START),
      end: new Date(SEP_END),
    });
    // Con capacidad (plantilla semanal) el periodo anterior sí es comparable.
    expect(view.trend?.previous).not.toBeNull();
    expect(view.trend?.current.totalAppointments).toBe(1);
    // Octubre tiene 31 días → 31 buckets diarios, sin consultas adicionales.
    expect(view.trend?.series).toHaveLength(31);
  });

  it('periodo anterior sin citas ni capacidad → trend.previous null (sin error ni caída)', async () => {
    makeDb({
      appointments: [APPOINTMENT_ROW],
      business_hours: [],
      providers: [{ id: 'provider-1', name: 'Dra. Ana' }],
    });

    const view = await getDashboardMetrics({ preset: 'month' }, NOW);

    expect(view.isConfiguredButUnavailable).toBe(false);
    expect(view.metrics).not.toBeNull();
    expect(view.trend).not.toBeNull();
    expect(view.trend?.previous).toBeNull();
  });

  it('rango sin citas ni business_hours → metrics y trend null (estado vacío)', async () => {
    const { from } = makeDb({ appointments: [], business_hours: [], providers: [] });

    const view = await getDashboardMetrics({ preset: 'month' }, NOW);

    expect(view.metrics).toBeNull();
    expect(view.trend).toBeNull();
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
    expect(view.trend).toBeNull();
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
    expect(view.trend).toBeNull();
  });

  it('cuando una consulta devuelve error degrada sin lanzar', async () => {
    makeDb(
      { appointments: [], business_hours: [], providers: [] },
      { appointments: { message: 'db down' } }
    );

    const view = await getDashboardMetrics({ preset: 'month' }, NOW);

    expect(view.isConfiguredButUnavailable).toBe(true);
    expect(view.metrics).toBeNull();
    expect(view.trend).toBeNull();
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

  it('preset custom lee el periodo anterior de igual duración', async () => {
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
    expect(callsFor(created.appointments, 'gt')).toEqual([
      ['end_at', '2026-10-05T06:00:00.000Z'],
      ['end_at', '2026-10-02T06:00:00.000Z'],
    ]);
    expect(callsFor(created.appointments, 'lt')).toEqual([
      ['start_at', '2026-10-08T06:00:00.000Z'],
      ['start_at', '2026-10-05T06:00:00.000Z'],
    ]);

    const fallback = await getDashboardMetrics(
      { preset: 'custom', from: '2026-10-10', to: '2026-10-05' },
      NOW
    );
    expect(fallback.preset).toBe('month');
  });
});
