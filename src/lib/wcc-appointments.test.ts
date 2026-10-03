import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/wcc-client', () => ({
  createWccClient: vi.fn(),
  isSupabaseConfigured: vi.fn(() => true),
}));

import { createWccClient } from '@/lib/wcc-client';
import {
  formatWccAppointmentStart,
  getWccUnconfirmedAppointments,
  resolveWccAppointmentsWindowHours,
} from './wcc-appointments';

function query(data: Record<string, unknown>[]) {
  const value = Promise.resolve({ data, error: null });
  return Object.assign(value, {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
  });
}

type MockQuery = ReturnType<typeof query>;

function makeWccClient(tableQueues: Record<string, MockQuery[]>) {
  vi.mocked(createWccClient).mockResolvedValue({
    from: vi.fn((table: string) => {
      const queue = tableQueues[table];
      if (!queue || queue.length === 0) {
        throw new Error(`Unexpected table: ${table}`);
      }
      return queue.shift()!;
    }),
  } as never);
}

const NOW = new Date('2026-10-03T12:00:00.000Z');

describe('getWccUnconfirmedAppointments', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps, sorts by start_at and attaches reminders for unconfirmed appointments', async () => {
    const appointmentsQuery = query([
      {
        id: 'appt-b',
        patient_id: 'patient-1',
        service_id: 'service-1',
        provider_id: 'provider-1',
        start_at: '2026-10-04T12:00:00.000Z',
        status: 'pending',
      },
      {
        id: 'appt-a',
        patient_id: 'patient-2',
        service_id: 'service-2',
        provider_id: 'provider-2',
        start_at: '2026-10-03T18:00:00.000Z',
        status: 'requested',
      },
      {
        // Fuera de la ventana de 72 h: el data layer la descarta aunque el
        // mock la devuelva (filtro defensivo).
        id: 'appt-out',
        patient_id: 'patient-2',
        service_id: 'service-2',
        provider_id: 'provider-2',
        start_at: '2026-10-10T12:00:00.000Z',
        status: 'requested',
      },
      {
        // Estado confirmado: no debe aparecer en el indicador.
        id: 'appt-confirmed',
        patient_id: 'patient-1',
        service_id: 'service-1',
        provider_id: 'provider-1',
        start_at: '2026-10-03T20:00:00.000Z',
        status: 'confirmed',
      },
    ]);

    makeWccClient({
      appointments: [appointmentsQuery],
      patients: [
        query([
          { id: 'patient-1', full_name: 'María López', phone_e164: '+5215512345678' },
          { id: 'patient-2', full_name: 'Juan Pérez', phone_e164: null },
        ]),
      ],
      providers: [
        query([
          { id: 'provider-1', name: 'Dr. Jorge' },
          { id: 'provider-2', name: 'Dra. Ana' },
        ]),
      ],
      services: [
        query([
          { id: 'service-1', name: 'Limpieza' },
          { id: 'service-2', name: 'Ortodoncia' },
        ]),
      ],
      appointment_reminders: [
        query([
          {
            appointment_id: 'appt-a',
            cadence: 'h24',
            status: 'sent',
            dry_run: false,
            sent_at: '2026-10-02T15:15:00.000Z',
          },
          {
            appointment_id: 'appt-a',
            cadence: 'same_day',
            status: 'scheduled',
            dry_run: true,
            sent_at: null,
          },
        ]),
      ],
    });

    const result = await getWccUnconfirmedAppointments();

    expect(result.isSupabaseConfigured).toBe(true);
    expect(result.isConfiguredButUnavailable).toBe(false);
    expect(result.windowHours).toBe(72);
    expect(result.generatedAt).toBe(NOW.toISOString());

    expect(appointmentsQuery.in).toHaveBeenCalledWith('status', ['requested', 'pending']);
    expect(appointmentsQuery.gte).toHaveBeenCalledWith('start_at', NOW.toISOString());
    expect(appointmentsQuery.lt).toHaveBeenCalledWith('start_at', '2026-10-06T12:00:00.000Z');
    expect(appointmentsQuery.order).toHaveBeenCalledWith('start_at', { ascending: true });

    expect(result.appointments.map((a) => a.appointmentId)).toEqual(['appt-a', 'appt-b']);
    expect(result.appointments[0]).toMatchObject({
      appointmentId: 'appt-a',
      patientId: 'patient-2',
      patientName: 'Juan Pérez',
      patientPhoneE164: null,
      providerName: 'Dra. Ana',
      serviceName: 'Ortodoncia',
      startAt: '2026-10-03T18:00:00.000Z',
      status: 'requested',
      hoursUntilStart: 6,
    });
    expect(result.appointments[0].reminders).toEqual([
      {
        cadence: 'h24',
        status: 'sent',
        sentAt: '2026-10-02T15:15:00.000Z',
        dryRun: false,
      },
      { cadence: 'same_day', status: 'scheduled', sentAt: null, dryRun: true },
    ]);
    expect(result.appointments[1]).toMatchObject({
      appointmentId: 'appt-b',
      patientName: 'María López',
      patientPhoneE164: '+5215512345678',
      providerName: 'Dr. Jorge',
      serviceName: 'Limpieza',
      hoursUntilStart: 24,
      reminders: [],
    });
  });

  it('honors a custom windowHours filter', async () => {
    const appointmentsQuery = query([]);
    makeWccClient({
      appointments: [appointmentsQuery],
      patients: [query([])],
      providers: [query([])],
      services: [query([])],
      appointment_reminders: [query([])],
    });

    const result = await getWccUnconfirmedAppointments({ windowHours: 24 });

    expect(result.windowHours).toBe(24);
    expect(appointmentsQuery.lt).toHaveBeenCalledWith(
      'start_at',
      '2026-10-04T12:00:00.000Z'
    );
  });

  it('degrades to empty when Supabase is not configured', async () => {
    const wcc = await import('@/lib/wcc-client');
    vi.mocked(wcc.isSupabaseConfigured).mockReturnValueOnce(false);

    const result = await getWccUnconfirmedAppointments();

    expect(result.isSupabaseConfigured).toBe(false);
    expect(result.isConfiguredButUnavailable).toBe(false);
    expect(result.appointments).toEqual([]);
    expect(result.windowHours).toBe(72);
  });

  it('flags the queue as configured-but-unavailable when the client throws', async () => {
    vi.mocked(createWccClient).mockRejectedValueOnce(new Error('connection refused'));

    const result = await getWccUnconfirmedAppointments();

    expect(result.isSupabaseConfigured).toBe(true);
    expect(result.isConfiguredButUnavailable).toBe(true);
    expect(result.appointments).toEqual([]);
  });
});

describe('resolveWccAppointmentsWindowHours', () => {
  afterEach(() => {
    delete process.env.WCC_APPOINTMENTS_WINDOW_HOURS;
  });

  it('prefers an explicit positive value', () => {
    expect(resolveWccAppointmentsWindowHours(12)).toBe(12);
  });

  it('falls back to the env var, then to 72', () => {
    process.env.WCC_APPOINTMENTS_WINDOW_HOURS = '48';
    expect(resolveWccAppointmentsWindowHours()).toBe(48);

    process.env.WCC_APPOINTMENTS_WINDOW_HOURS = 'not-a-number';
    expect(resolveWccAppointmentsWindowHours()).toBe(72);
  });
});

describe('formatWccAppointmentStart', () => {
  it('formats the instant in America/Mexico_City even across UTC midnight', () => {
    // 15:15 UTC == 09:15 en CDMX (UTC-6, sin DST).
    expect(formatWccAppointmentStart('2026-10-03T15:15:00.000Z')).toBe(
      '2026-10-03 09:15'
    );
    // 2026-10-04T03:00Z == 2026-10-03 21:00 en CDMX.
    expect(formatWccAppointmentStart('2026-10-04T03:00:00.000Z')).toBe(
      '2026-10-03 21:00'
    );
  });
});
