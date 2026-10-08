import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * La página usa `getViewerTimezone()` (server) y `formatWccAppointmentStart`
 * del data layer. Se conservan las funciones reales del módulo y solo se
 * sustituye la lectura de la cola; la zona del observador se fija a una zona
 * distinta de la clínica para probar el efecto real.
 */
vi.mock('@/lib/wcc-appointments', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/wcc-appointments')>();
  return { ...actual, getWccUnconfirmedAppointments: vi.fn() };
});

vi.mock('@/lib/admin/viewer-timezone', () => ({
  getViewerTimezone: vi.fn(async () => 'America/Los_Angeles'),
}));

import Page from '../appointments/page';
import { getWccUnconfirmedAppointments } from '@/lib/wcc-appointments';

function buildQueue(overrides: Record<string, unknown> = {}) {
  return {
    isSupabaseConfigured: true,
    isConfiguredButUnavailable: false,
    windowHours: 72,
    generatedAt: '2026-10-03T12:00:00.000Z',
    appointments: [],
    ...overrides,
  };
}

describe('/whatsapp-command-center/appointments — zona del observador', () => {
  it('muestra el instante absoluto de la cita en la zona del observador', async () => {
    vi.mocked(getWccUnconfirmedAppointments).mockResolvedValue(
      buildQueue({
        appointments: [
          {
            appointmentId: 'appt-a',
            patientId: 'patient-1',
            patientName: 'María López',
            patientPhoneE164: null,
            providerName: 'Dr. Jorge',
            serviceName: 'Limpieza',
            startAt: '2026-10-03T18:00:00.000Z',
            status: 'requested',
            hoursUntilStart: 6,
            reminders: [],
          },
        ],
      }) as never
    );

    render(await Page());

    // 18:00Z = 11:00 en America/Los_Angeles (PDT, UTC-7); en la clínica serían 12:00.
    expect(
      screen.getByText(/En tu zona: 2026-10-03 11:00/)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/En tu zona: 2026-10-03 12:00/)
    ).not.toBeInTheDocument();
    // La línea existente (zona clínica + horas restantes) se conserva.
    expect(screen.getByText(/en 6 h/)).toBeInTheDocument();
  });
});
