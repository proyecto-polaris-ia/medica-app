import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/admin/metrics/loader', () => ({
  getDashboardMetrics: vi.fn(),
}));

vi.mock('@/lib/admin/nora/loader', () => ({
  getNoraView: vi.fn(),
}));

import Page from './page';
import { getDashboardMetrics, type DashboardMetricsView } from '@/lib/admin/metrics/loader';
import { getNoraView, type NoraView } from '@/lib/admin/nora/loader';
import type { MetricsResult, ProviderMetrics, StatusCounts } from '@/lib/admin/metrics/types';
import type { NoraGap } from '@/lib/admin/nora/types';
import type { MetricsSeriesBucket, MetricsTrend } from '@/lib/admin/metrics/trend';

function statusCounts(overrides: Partial<StatusCounts> = {}): StatusCounts {
  return {
    requested: 0,
    confirmed: 0,
    pending: 0,
    cancelled: 0,
    rescheduled: 0,
    no_show: 0,
    attended: 0,
    ...overrides,
  };
}

function provider(overrides: Partial<ProviderMetrics> = {}): ProviderMetrics {
  return {
    providerId: 'provider-1',
    providerName: 'Dra. Ana',
    occupancyPct: 40,
    occupiedMinutes: 400,
    capacityMinutes: 1000,
    noShowRatePct: 20,
    noShowCount: 2,
    attendedCount: 8,
    totalAppointments: 12,
    cancelledCount: 1,
    statusCounts: statusCounts(),
    ...overrides,
  };
}

function metrics(overrides: Partial<MetricsResult> = {}): MetricsResult {
  return {
    occupancyPct: 32.5,
    occupiedMinutes: 650,
    capacityMinutes: 2000,
    noShowRatePct: 25,
    noShowCount: 5,
    attendedCount: 15,
    totalAppointments: 24,
    cancelledCount: 3,
    statusCounts: statusCounts(),
    providers: [provider()],
    ...overrides,
  };
}

function bucket(
  dayKey: string,
  label: string,
  occupancyPct: number,
  noShowRatePct: number | null,
  totalAppointments = 1
): MetricsSeriesBucket {
  const start = new Date(`${dayKey}T06:00:00.000Z`);
  return {
    range: { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) },
    dayKey,
    label,
    metrics: metrics({ occupancyPct, noShowRatePct, totalAppointments }),
  };
}

function trend(overrides: Partial<MetricsTrend> = {}): MetricsTrend {
  return {
    current: metrics(),
    previous: metrics({
      occupancyPct: 30,
      noShowRatePct: 20,
      totalAppointments: 20,
      cancelledCount: 2,
    }),
    previousRange: {
      start: new Date('2026-09-01T06:00:00.000Z'),
      end: new Date('2026-10-01T06:00:00.000Z'),
    },
    series: [
      bucket('2026-10-01', '1 oct', 0, null, 0),
      bucket('2026-10-05', '5 oct', 100, 0),
      bucket('2026-10-06', '6 oct', 50, 100),
    ],
    ...overrides,
  };
}

function buildView(overrides: Partial<DashboardMetricsView> = {}): DashboardMetricsView {
  return {
    isSupabaseConfigured: true,
    isConfiguredButUnavailable: false,
    generatedAt: '2026-10-15T18:00:00.000Z',
    preset: 'month',
    rangeLabel: '1 – 31 de octubre, 2026',
    range: { startAt: '2026-10-01T06:00:00.000Z', endAt: '2026-11-01T06:00:00.000Z' },
    metrics: metrics(),
    trend: trend(),
    ...overrides,
  };
}

/** Hueco ficticio; 16:00Z = 10:00 en America/Mexico_City (UTC−6). */
function gap(overrides: Partial<NoraGap> = {}): NoraGap {
  return {
    providerId: 'provider-1',
    dayKey: '2026-10-05',
    startAt: '2026-10-05T16:00:00.000Z',
    endAt: '2026-10-05T17:00:00.000Z',
    minutes: 60,
    ...overrides,
  };
}

function buildNoraView(overrides: Partial<NoraView> = {}): NoraView {
  return {
    isSupabaseConfigured: true,
    isConfiguredButUnavailable: false,
    generatedAt: '2026-10-15T18:00:00.000Z',
    preset: 'month',
    rangeLabel: '1 – 31 de octubre, 2026',
    range: { startAt: '2026-10-01T06:00:00.000Z', endAt: '2026-11-01T06:00:00.000Z' },
    // Valores distintos a los de las métricas para aislar la sección en el DOM.
    metrics: metrics({ occupancyPct: 12.5, noShowRatePct: 33.3 }),
    gaps: [gap(), gap({ startAt: '2026-10-05T18:00:00.000Z', endAt: '2026-10-05T20:00:00.000Z', minutes: 120 })],
    ...overrides,
  };
}

describe('/dashboard (métricas de agenda)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getDashboardMetrics).mockResolvedValue(buildView());
    vi.mocked(getNoraView).mockResolvedValue(buildNoraView());
  });

  it('muestra las 4 cards, la etiqueta de rango y el desglose por proveedor', async () => {
    render(await Page({ searchParams: Promise.resolve({ preset: 'month' }) }));

    expect(screen.getByText('Ocupación %')).toBeInTheDocument();
    expect(screen.getByText('Tasa de no-show %')).toBeInTheDocument();
    expect(screen.getByText('Citas totales')).toBeInTheDocument();
    expect(screen.getByText('Cancelaciones')).toBeInTheDocument();
    expect(screen.getByText('32.5%')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1 – 31 de octubre, 2026')).toBeInTheDocument();
    expect(screen.getByText('Dra. Ana')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('renderiza la tendencia contra el periodo anterior con variación y serie', async () => {
    render(await Page({ searchParams: Promise.resolve({ preset: 'month' }) }));

    expect(screen.getByText('Tendencia vs periodo anterior')).toBeInTheDocument();
    // Ocupación 32.5 % − 30 % = +2.5 pp; no-show 25 % − 20 % = +5 pp.
    expect(screen.getByText('+2.5 pp')).toBeInTheDocument();
    expect(screen.getByText('+5 pp')).toBeInTheDocument();
    expect(screen.getByText('+4 citas')).toBeInTheDocument();
    expect(screen.getByText('+1 cancelaciones')).toBeInTheDocument();

    // Serie simple: una fila accesible por bucket, rotulada en la zona clínica.
    expect(screen.getByText('5 oct: ocupación 100%; citas: 1; no-show: 0%')).toBeInTheDocument();
    expect(
      screen.getByText('1 oct: ocupación 0%; citas: 0; no-show: no disponible')
    ).toBeInTheDocument();
  });

  it('muestra "Comparación no disponible" cuando no hay periodo anterior (nunca una caída)', async () => {
    vi.mocked(getDashboardMetrics).mockResolvedValue(
      buildView({ trend: trend({ previous: null }) })
    );

    render(await Page({ searchParams: Promise.resolve({ preset: 'month' }) }));

    expect(
      screen.getByText('Comparación no disponible con el periodo anterior.')
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Variación contra el periodo anterior')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('+2.5 pp')).not.toBeInTheDocument();
    // La serie sigue disponible aunque no haya comparación.
    expect(screen.getByText('5 oct: ocupación 100%; citas: 1; no-show: 0%')).toBeInTheDocument();
  });

  it('sin tasa de no-show en un periodo no hay variación de no-show, pero sí de ocupación', async () => {
    vi.mocked(getDashboardMetrics).mockResolvedValue(
      buildView({
        trend: trend({
          previous: metrics({ occupancyPct: 30, noShowRatePct: null, totalAppointments: 20 }),
        }),
      })
    );

    render(await Page({ searchParams: Promise.resolve({ preset: 'month' }) }));

    expect(screen.getByText('+2.5 pp')).toBeInTheDocument();
    expect(screen.getByText('Sin comparación')).toBeInTheDocument();
    expect(screen.queryByText('+5 pp')).not.toBeInTheDocument();
  });

  it('una variación negativa usa el signo tipográfico (nunca un porcentaje negativo crudo)', async () => {
    vi.mocked(getDashboardMetrics).mockResolvedValue(
      buildView({
        trend: trend({
          previous: metrics({ occupancyPct: 40, noShowRatePct: 20, totalAppointments: 20 }),
        }),
      })
    );

    render(await Page({ searchParams: Promise.resolve({ preset: 'month' }) }));

    // 32.5 % − 40 % = −7.5 puntos porcentuales.
    expect(screen.getByText('−7.5 pp')).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(/-\d/);
  });

  it('no renderiza el bloque de tendencia cuando no hay métricas', async () => {
    vi.mocked(getDashboardMetrics).mockResolvedValue(
      buildView({ metrics: null, trend: null })
    );

    render(await Page({ searchParams: Promise.resolve({ preset: 'week' }) }));

    expect(
      screen.queryByText('Tendencia vs periodo anterior')
    ).not.toBeInTheDocument();
  });

  it('conserva la rejilla de enlaces existente debajo de las métricas', async () => {
    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText('Reservar cita')).toBeInTheDocument();
    expect(screen.getByText('Horarios')).toBeInTheDocument();
    expect(screen.getByText('Proveedores')).toBeInTheDocument();
  });

  it('muestra "No disponible" cuando la tasa de no-show es null', async () => {
    vi.mocked(getDashboardMetrics).mockResolvedValue(
      buildView({ metrics: metrics({ noShowRatePct: null, noShowCount: 0, attendedCount: 0 }) })
    );

    render(await Page({ searchParams: Promise.resolve({ preset: 'month' }) }));

    expect(screen.getByText('No disponible')).toBeInTheDocument();
  });

  it('muestra el estado vacío cuando no hay datos en el rango', async () => {
    vi.mocked(getDashboardMetrics).mockResolvedValue(buildView({ metrics: null, trend: null }));

    render(await Page({ searchParams: Promise.resolve({ preset: 'week' }) }));

    expect(screen.getByText('Sin datos para el rango seleccionado.')).toBeInTheDocument();
    expect(screen.queryByText('Ocupación %')).not.toBeInTheDocument();
  });

  it('muestra el aviso de degradación cuando Supabase está configurado pero no disponible', async () => {
    vi.mocked(getDashboardMetrics).mockResolvedValue(
      buildView({ isConfiguredButUnavailable: true, metrics: null, trend: null })
    );

    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByText(/No se pudieron leer las métricas de agenda/)
    ).toBeInTheDocument();
  });

  it('recalcula las métricas al cambiar el preset en searchParams', async () => {
    vi.mocked(getDashboardMetrics).mockImplementation(async (params) =>
      params.preset === 'week'
        ? buildView({
            preset: 'week',
            rangeLabel: '12 – 18 de octubre, 2026',
            metrics: metrics({ totalAppointments: 7, occupancyPct: 10 }),
          })
        : buildView()
    );

    render(await Page({ searchParams: Promise.resolve({ preset: 'week' }) }));

    expect(getDashboardMetrics).toHaveBeenCalledWith({ preset: 'week' });
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('12 – 18 de octubre, 2026')).toBeInTheDocument();
  });

  it('pasa el rango personalizado al loader', async () => {
    render(
      await Page({
        searchParams: Promise.resolve({ preset: 'custom', from: '2026-10-05', to: '2026-10-07' }),
      })
    );

    expect(getDashboardMetrics).toHaveBeenCalledWith({
      preset: 'custom',
      from: '2026-10-05',
      to: '2026-10-07',
    });
  });

  it('no renderiza porcentajes negativos ni valores null crudos', async () => {
    render(await Page({ searchParams: Promise.resolve({ preset: 'month' }) }));

    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/-\d/);
    expect(text).not.toContain('null');
    expect(text).not.toContain('undefined');
  });

  it('muestra los huecos improductivos por proveedor y día con su conteo y minutos', async () => {
    render(await Page({ searchParams: Promise.resolve({ preset: 'month' }) }));

    expect(screen.getByText('Agenda productiva')).toBeInTheDocument();
    expect(screen.getByText('Ocupación del rango %')).toBeInTheDocument();
    expect(screen.getByText('No-show del rango %')).toBeInTheDocument();

    const gapsCard = screen.getByText('Huecos improductivos').closest('div');
    expect(gapsCard).toHaveTextContent('2');

    const minutesCard = screen.getByText('Minutos improductivos').closest('div');
    expect(minutesCard).toHaveTextContent('180 min');

    expect(screen.getByText('Dra. Ana · 5 oct 2026')).toBeInTheDocument();
    expect(screen.getByText('10:00–11:00 (60 min)')).toBeInTheDocument();
    expect(screen.getByText('12:00–14:00 (120 min)')).toBeInTheDocument();
  });

  it('resuelve getNoraView con el mismo rango (searchParams) que las métricas', async () => {
    render(
      await Page({
        searchParams: Promise.resolve({
          preset: 'custom',
          from: '2026-10-05',
          to: '2026-10-07',
        }),
      })
    );

    expect(getNoraView).toHaveBeenCalledWith({
      preset: 'custom',
      from: '2026-10-05',
      to: '2026-10-07',
    });
  });

  it('estado vacío de Nora cuando el rango no tiene datos, sin romper las métricas', async () => {
    vi.mocked(getNoraView).mockResolvedValue(buildNoraView({ metrics: null, gaps: [] }));

    render(await Page({ searchParams: Promise.resolve({ preset: 'month' }) }));

    expect(
      screen.getByText('Sin datos de agenda productiva para el rango seleccionado.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Huecos improductivos')).not.toBeInTheDocument();
    // Las métricas del rango siguen visibles.
    expect(screen.getByText('Ocupación %')).toBeInTheDocument();
  });

  it('sin huecos (agenda llena) muestra estado vacío y minutos cero, nunca negativos', async () => {
    vi.mocked(getNoraView).mockResolvedValue(buildNoraView({ gaps: [] }));

    render(await Page({ searchParams: Promise.resolve({ preset: 'month' }) }));

    expect(
      screen.getByText('Sin huecos improductivos en el rango seleccionado.')
    ).toBeInTheDocument();
    expect(screen.getByText('0 min')).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(/-\d/);
  });

  it('muestra el aviso de degradación de Nora y conserva el resto del panel', async () => {
    vi.mocked(getNoraView).mockResolvedValue(
      buildNoraView({ isConfiguredButUnavailable: true, metrics: null, gaps: [] })
    );

    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByText(/No se pudieron leer los indicadores de agenda productiva/)
    ).toBeInTheDocument();
    expect(screen.getByText('Ocupación %')).toBeInTheDocument();
  });

  it('recalcula los huecos de Nora al cambiar el preset', async () => {
    vi.mocked(getNoraView).mockImplementation(async (params) =>
      params.preset === 'week' ? buildNoraView({ preset: 'week', gaps: [] }) : buildNoraView()
    );

    render(await Page({ searchParams: Promise.resolve({ preset: 'week' }) }));

    expect(getNoraView).toHaveBeenCalledWith({ preset: 'week' });
    expect(
      screen.getByText('Sin huecos improductivos en el rango seleccionado.')
    ).toBeInTheDocument();
  });

  it('sin tasa de no-show en el rango, Nora muestra "No disponible" (nunca null crudo)', async () => {
    vi.mocked(getNoraView).mockResolvedValue(
      buildNoraView({ metrics: metrics({ noShowRatePct: null, noShowCount: 0, attendedCount: 0 }) })
    );

    render(await Page({ searchParams: Promise.resolve({ preset: 'month' }) }));

    expect(screen.getByText('No disponible')).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('null');
    expect(text).not.toContain('undefined');
    expect(text).not.toMatch(/-\d/);
  });
});
