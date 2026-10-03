import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/admin/metrics/loader', () => ({
  getDashboardMetrics: vi.fn(),
}));

import Page from './page';
import { getDashboardMetrics, type DashboardMetricsView } from '@/lib/admin/metrics/loader';
import type { MetricsResult, ProviderMetrics, StatusCounts } from '@/lib/admin/metrics/types';

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

function buildView(overrides: Partial<DashboardMetricsView> = {}): DashboardMetricsView {
  return {
    isSupabaseConfigured: true,
    isConfiguredButUnavailable: false,
    generatedAt: '2026-10-15T18:00:00.000Z',
    preset: 'month',
    rangeLabel: '1 – 31 de octubre, 2026',
    range: { startAt: '2026-10-01T06:00:00.000Z', endAt: '2026-11-01T06:00:00.000Z' },
    metrics: metrics(),
    ...overrides,
  };
}

describe('/dashboard (métricas de agenda)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getDashboardMetrics).mockResolvedValue(buildView());
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
    vi.mocked(getDashboardMetrics).mockResolvedValue(buildView({ metrics: null }));

    render(await Page({ searchParams: Promise.resolve({ preset: 'week' }) }));

    expect(screen.getByText('Sin datos para el rango seleccionado.')).toBeInTheDocument();
    expect(screen.queryByText('Ocupación %')).not.toBeInTheDocument();
  });

  it('muestra el aviso de degradación cuando Supabase está configurado pero no disponible', async () => {
    vi.mocked(getDashboardMetrics).mockResolvedValue(
      buildView({ isConfiguredButUnavailable: true, metrics: null })
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
});
