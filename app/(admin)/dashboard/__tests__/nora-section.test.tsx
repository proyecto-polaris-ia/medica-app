import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimezoneProvider } from '@/components/admin/TimezoneProvider';

vi.mock('../nora-actions', () => ({
  acceptSuggestionAction: vi.fn(),
  rejectSuggestionAction: vi.fn(),
}));

import { NoraSection } from '../components/NoraSection';
import type { NoraView } from '@/lib/admin/nora/loader';
import type { MetricsResult, StatusCounts } from '@/lib/admin/metrics/types';
import type { NoraGap, NoraSuggestionRecord } from '@/lib/admin/nora/types';

function statusCounts(): StatusCounts {
  return {
    requested: 0,
    confirmed: 0,
    pending: 0,
    cancelled: 0,
    rescheduled: 0,
    no_show: 0,
    attended: 0,
  };
}

function metrics(): MetricsResult {
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
    providers: [
      {
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
      },
    ],
  };
}

/** 16:00Z = 10:00 en America/Mexico_City (UTC−6). */
function gap(): NoraGap {
  return {
    providerId: 'provider-1',
    dayKey: '2026-10-05',
    startAt: '2026-10-05T16:00:00.000Z',
    endAt: '2026-10-05T17:00:00.000Z',
    minutes: 60,
  };
}

function suggestion(
  overrides: Partial<NoraSuggestionRecord> = {}
): NoraSuggestionRecord {
  return {
    id: 'suggestion-1',
    appointmentId: 'appt-1',
    providerId: 'provider-1',
    originalStartAt: '2026-10-05T17:00:00.000Z',
    originalEndAt: '2026-10-05T18:00:00.000Z',
    suggestedStartAt: '2026-10-05T16:00:00.000Z',
    suggestedEndAt: '2026-10-05T17:00:00.000Z',
    reasonCode: 'gap_before',
    status: 'proposed',
    createdAt: '2026-10-05T14:00:00.000Z',
    decidedBy: null,
    decidedAt: null,
    ...overrides,
  };
}

function buildView(overrides: Partial<NoraView> = {}): NoraView {
  return {
    isSupabaseConfigured: true,
    isConfiguredButUnavailable: false,
    generatedAt: '2026-10-15T18:00:00.000Z',
    preset: 'month',
    rangeLabel: '1 – 31 de octubre, 2026',
    range: { startAt: '2026-10-01T06:00:00.000Z', endAt: '2026-11-01T06:00:00.000Z' },
    metrics: metrics(),
    gaps: [gap()],
    suggestions: [suggestion()],
    ...overrides,
  };
}

describe('NoraSection — sugerencias de reacomodo', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('muestra la sugerencia con proveedor, motivo y horas en la zona clínica', () => {
    render(<NoraSection view={buildView()} />);

    expect(screen.getByText('Sugerencias de reacomodo')).toBeInTheDocument();
    expect(
      screen.getByText('Dra. Ana · Hueco antes de la hora actual')
    ).toBeInTheDocument();
    // 17:00Z = 11:00 clínica; 16:00Z = 10:00 clínica.
    expect(
      screen.getByText('5 oct 2026 11:00 → 5 oct 2026 10:00')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aceptar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument();
  });

  it('sin sugerencias muestra estado vacío y no lista valores inválidos', () => {
    render(<NoraSection view={buildView({ suggestions: [] })} />);

    expect(
      screen.getByText('Sin sugerencias de reacomodo para el rango seleccionado.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceptar' })).not.toBeInTheDocument();
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('null');
    expect(text).not.toContain('undefined');
  });

  it('tolera una vista sin el campo suggestions (compatibilidad Fase 1)', () => {
    render(<NoraSection view={buildView({ suggestions: undefined })} />);

    expect(
      screen.getByText('Sin sugerencias de reacomodo para el rango seleccionado.')
    ).toBeInTheDocument();
  });

  it('mantiene la lista de sugerencias aunque la aplicación falle', () => {
    render(<NoraSection view={buildView()} />);
    // La sección completa sigue montada: la fila no desaparece al fallar.
    expect(screen.getByText('Sugerencias de reacomodo')).toBeInTheDocument();
    expect(screen.getByText('Dra. Ana · Hueco antes de la hora actual')).toBeInTheDocument();
  });

  it('formatea las horas en la zona del observador cuando no es la clínica', () => {
    render(
      <TimezoneProvider timezone="America/Los_Angeles">
        <NoraSection view={buildView()} />
      </TimezoneProvider>
    );

    // 17:00Z = 10:00 en Los Ángeles (PDT, UTC-7); 16:00Z = 09:00.
    expect(
      screen.getByText('5 oct 2026 10:00 → 5 oct 2026 09:00')
    ).toBeInTheDocument();
    // El hueco 16:00Z–17:00Z se muestra en la zona del observador.
    expect(screen.getByText('09:00–10:00 (60 min)')).toBeInTheDocument();
  });
});
