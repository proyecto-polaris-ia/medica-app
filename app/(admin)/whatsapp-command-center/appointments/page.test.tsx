import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Page from './page';

vi.mock('@/lib/wcc-appointments', () => ({
  getWccUnconfirmedAppointments: vi.fn(),
}));

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

describe('/whatsapp-command-center/appointments', () => {
  it('lists unconfirmed appointments with their hours and reminder state', async () => {
    vi.mocked(getWccUnconfirmedAppointments).mockResolvedValue(
      buildQueue({
        appointments: [
          {
            appointmentId: 'appt-a',
            patientId: 'patient-1',
            patientName: 'María López',
            patientPhoneE164: '+5215512345678',
            providerName: 'Dr. Jorge',
            serviceName: 'Limpieza',
            startAt: '2026-10-03T18:00:00.000Z',
            status: 'requested',
            hoursUntilStart: 6,
            reminders: [
              {
                cadence: 'h24',
                status: 'sent',
                sentAt: '2026-10-02T15:15:00.000Z',
                dryRun: false,
              },
            ],
          },
        ],
      }) as never
    );

    render(await Page());

    expect(screen.getByText('María López')).toBeInTheDocument();
    expect(screen.getByText('+5215512345678')).toBeInTheDocument();
    expect(screen.getByText('Limpieza')).toBeInTheDocument();
    expect(screen.getByText('Dr. Jorge')).toBeInTheDocument();
    expect(screen.getByText(/en 6 h/)).toBeInTheDocument();
    expect(screen.getByText(/Recordatorio H-24 enviado/)).toBeInTheDocument();
  });

  it('shows a dry-run reminder badge', async () => {
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
            reminders: [
              {
                cadence: 'h24',
                status: 'scheduled',
                sentAt: null,
                dryRun: true,
              },
            ],
          },
        ],
      }) as never
    );

    render(await Page());

    expect(screen.getByText('Simulado (dry-run)')).toBeInTheDocument();
  });

  it('shows a neutral reminder state when an appointment has no reminders', async () => {
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
            status: 'pending',
            hoursUntilStart: 6,
            reminders: [],
          },
        ],
      }) as never
    );

    render(await Page());

    expect(screen.getByText('Sin recordatorio')).toBeInTheDocument();
  });

  it('shows a clear empty state when there are no unconfirmed appointments', async () => {
    vi.mocked(getWccUnconfirmedAppointments).mockResolvedValue(
      buildQueue({ appointments: [] }) as never
    );

    render(await Page());

    expect(screen.getByText('Todas las citas están confirmadas')).toBeInTheDocument();
  });

  it('warns when the database is configured but unavailable', async () => {
    vi.mocked(getWccUnconfirmedAppointments).mockResolvedValue(
      buildQueue({
        isConfiguredButUnavailable: true,
        appointments: [],
      }) as never
    );

    render(await Page());

    expect(
      screen.getByText(/No se pudieron leer las citas/)
    ).toBeInTheDocument();
  });
});
