import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquireDbSuiteLock,
  applyLocalDbEnv,
  localDbEnabled,
  releaseDbSuiteLock,
  truncateAllTables,
} from '@/test-utils/local-db';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { createAppointment } from '@/lib/admin/appointments';
import { createPatient } from '@/lib/admin/patients';
import { createProvider } from '@/lib/admin/providers';
import { createService } from '@/lib/admin/services';
import {
  formatWccAppointmentStart,
  getWccUnconfirmedAppointments,
  resolveWccAppointmentsWindowHours,
  type WccAppointmentReminderRow,
} from './wcc-appointments';

/**
 * Suite contra Supabase local (ver openspec/changes/supabase-local-testing).
 * Corre solo con `npm run test:local` (SUPABASE_LOCAL=1 + supabase start);
 * con `npm run test` regular se omite.
 */
const d = localDbEnabled ? describe : describe.skip;

// Las suites de datos se serializan con un advisory lock (ver
// src/test-utils/local-db.ts) porque vitest corre los archivos en paralelo
// y todas truncan el esquema `public`.

const NOW = new Date('2026-10-03T12:00:00.000Z');

d('wcc appointments data layer', () => {
  beforeAll(async () => {
    applyLocalDbEnv();
    await acquireDbSuiteLock();
  });

  afterAll(async () => {
    await releaseDbSuiteLock();
  });

  beforeEach(async () => {
    await truncateAllTables();
  });

  const iso = (value: string) => new Date(value).toISOString();

  /** Congela solo `Date` durante la llamada: los timers reales siguen
   * activos para que el fetch/undici del cliente real no se bloquee. */
  async function withSystemTime<T>(run: () => Promise<T>): Promise<T> {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    try {
      return await run();
    } finally {
      vi.useRealTimers();
    }
  }

  /** Ejecuta `run` con la config de Supabase ausente (rama "not configured"). */
  async function withUnconfiguredSupabase<T>(run: () => Promise<T>): Promise<T> {
    const previous = {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      service: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      return await run();
    } finally {
      if (previous.url !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
      if (previous.anon !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previous.anon;
      if (previous.service !== undefined) {
        process.env.SUPABASE_SERVICE_ROLE_KEY = previous.service;
      }
    }
  }

  /**
   * Fuerza una respuesta de error de PostgREST (service key inválida contra la
   * API local ya corriendo): la consulta real falla y el módulo debe degradar a
   * `isConfiguredButUnavailable`.
   */
  async function withFailingSupabase<T>(run: () => Promise<T>): Promise<T> {
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'invalid-service-role-key';
    try {
      return await run();
    } finally {
      if (previousKey !== undefined) {
        process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
      }
    }
  }

  /** Catálogo determinista vía funciones de dominio. */
  async function seedCatalog() {
    const providerOne = await createProvider({ name: 'Dr. Jorge' });
    const providerTwo = await createProvider({ name: 'Dra. Ana' });
    const serviceOne = await createService({ name: 'Limpieza', durationMinutes: 30 });
    const serviceTwo = await createService({ name: 'Ortodoncia', durationMinutes: 30 });
    return { providerOne, providerTwo, serviceOne, serviceTwo };
  }

  /**
   * No existe función de dominio para recordatorios de cita: se insertan
   * directo en la tabla, con `created_at` explícito para controlar el orden
   * "más reciente primero" que aplica la consulta real.
   */
  async function insertReminder(input: {
    appointmentId: string;
    key: string;
    cadence: WccAppointmentReminderRow['cadence'];
    status: WccAppointmentReminderRow['status'];
    dryRun: boolean;
    sentAt: string | null;
    createdAt: string;
  }): Promise<void> {
    const { error } = await getSupabaseAdmin().from('appointment_reminders').insert({
      appointment_id: input.appointmentId,
      reminder_key: input.key,
      cadence: input.cadence,
      status: input.status,
      dry_run: input.dryRun,
      sent_at: input.sentAt,
      created_at: input.createdAt,
    });
    if (error) throw new Error(error.message);
  }

  const normalizeReminders = (reminders: WccAppointmentReminderRow[]) =>
    reminders.map((reminder) => ({
      cadence: reminder.cadence,
      status: reminder.status,
      sentAt: reminder.sentAt ? iso(reminder.sentAt) : null,
      dryRun: reminder.dryRun,
    }));

  describe('getWccUnconfirmedAppointments', () => {
    it('maps, sorts by start_at and attaches reminders for unconfirmed appointments', async () => {
      const { providerOne, providerTwo, serviceOne, serviceTwo } = await seedCatalog();
      const maria = await createPatient({
        fullName: 'María López',
        phoneE164: '+5215512345678',
      });
      const juan = await createPatient({
        fullName: 'Juan Pérez',
        phoneE164: null,
        email: 'juan@example.com',
      });

      const apptB = await createAppointment({
        patientId: maria.id,
        serviceId: serviceOne.id,
        providerId: providerOne.id,
        startAt: '2026-10-04T12:00:00.000Z',
        endAt: '2026-10-04T12:30:00.000Z',
        status: 'pending',
      });
      const apptA = await createAppointment({
        patientId: juan.id,
        serviceId: serviceTwo.id,
        providerId: providerTwo.id,
        startAt: '2026-10-03T18:00:00.000Z',
        endAt: '2026-10-03T18:30:00.000Z',
        status: 'requested',
      });
      // Fuera de la ventana de 72 h: el filtro real `.lt('start_at')` la excluye.
      await createAppointment({
        patientId: juan.id,
        serviceId: serviceTwo.id,
        providerId: providerTwo.id,
        startAt: '2026-10-10T12:00:00.000Z',
        endAt: '2026-10-10T12:30:00.000Z',
        status: 'requested',
      });
      // Estado confirmado: el filtro real `.in('status')` la excluye.
      await createAppointment({
        patientId: maria.id,
        serviceId: serviceOne.id,
        providerId: providerOne.id,
        startAt: '2026-10-03T20:00:00.000Z',
        endAt: '2026-10-03T20:30:00.000Z',
        status: 'confirmed',
      });

      await insertReminder({
        appointmentId: apptA.id,
        key: `${apptA.id}-h24`,
        cadence: 'h24',
        status: 'sent',
        dryRun: false,
        sentAt: '2026-10-02T15:15:00Z',
        createdAt: '2026-10-02T16:00:00Z',
      });
      await insertReminder({
        appointmentId: apptA.id,
        key: `${apptA.id}-same_day`,
        cadence: 'same_day',
        status: 'scheduled',
        dryRun: true,
        sentAt: null,
        createdAt: '2026-10-02T15:00:00Z',
      });

      const result = await withSystemTime(() => getWccUnconfirmedAppointments());

      expect(result.isSupabaseConfigured).toBe(true);
      expect(result.isConfiguredButUnavailable).toBe(false);
      expect(result.windowHours).toBe(72);
      expect(result.generatedAt).toBe(NOW.toISOString());

      expect(result.appointments.map((appointment) => appointment.appointmentId)).toEqual([
        apptA.id,
        apptB.id,
      ]);

      const first = result.appointments[0];
      // timestamptz vuelve con offset `+00:00`: se normaliza a ISO.
      expect(iso(first.startAt)).toBe('2026-10-03T18:00:00.000Z');
      expect(first).toMatchObject({
        appointmentId: apptA.id,
        patientId: juan.id,
        patientName: 'Juan Pérez',
        patientPhoneE164: null,
        providerName: 'Dra. Ana',
        serviceName: 'Ortodoncia',
        status: 'requested',
        hoursUntilStart: 6,
      });
      expect(normalizeReminders(first.reminders)).toEqual([
        {
          cadence: 'h24',
          status: 'sent',
          sentAt: '2026-10-02T15:15:00.000Z',
          dryRun: false,
        },
        { cadence: 'same_day', status: 'scheduled', sentAt: null, dryRun: true },
      ]);

      const second = result.appointments[1];
      expect(iso(second.startAt)).toBe('2026-10-04T12:00:00.000Z');
      expect(second).toMatchObject({
        appointmentId: apptB.id,
        patientName: 'María López',
        patientPhoneE164: '+5215512345678',
        providerName: 'Dr. Jorge',
        serviceName: 'Limpieza',
        hoursUntilStart: 24,
        reminders: [],
      });
    });

    it('honors a custom windowHours filter', async () => {
      const { providerOne, serviceOne } = await seedCatalog();
      const patient = await createPatient({
        fullName: 'María López',
        phoneE164: '+5215512345678',
      });
      const within = await createAppointment({
        patientId: patient.id,
        serviceId: serviceOne.id,
        providerId: providerOne.id,
        startAt: '2026-10-04T08:00:00.000Z',
        endAt: '2026-10-04T08:30:00.000Z',
        status: 'requested',
      });
      // Fuera de la ventana de 24 h (NOW + 30 h): la consulta real lo excluye.
      await createAppointment({
        patientId: patient.id,
        serviceId: serviceOne.id,
        providerId: providerOne.id,
        startAt: '2026-10-04T18:00:00.000Z',
        endAt: '2026-10-04T18:30:00.000Z',
        status: 'requested',
      });

      const result = await withSystemTime(() =>
        getWccUnconfirmedAppointments({ windowHours: 24 })
      );

      expect(result.windowHours).toBe(24);
      expect(result.appointments.map((appointment) => appointment.appointmentId)).toEqual([
        within.id,
      ]);
    });

    it('degrades to empty when Supabase is not configured', async () => {
      const result = await withUnconfiguredSupabase(() =>
        getWccUnconfirmedAppointments()
      );

      expect(result.isSupabaseConfigured).toBe(false);
      expect(result.isConfiguredButUnavailable).toBe(false);
      expect(result.appointments).toEqual([]);
      expect(result.windowHours).toBe(72);
    });

    it('flags the queue as configured-but-unavailable when the upstream query fails', async () => {
      const result = await withFailingSupabase(() =>
        getWccUnconfirmedAppointments()
      );

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

    it('formats the instant in an explicit viewer timezone', () => {
      // 15:15 UTC == 08:15 en America/Los_Angeles (PDT, UTC-7).
      expect(
        formatWccAppointmentStart('2026-10-03T15:15:00.000Z', 'America/Los_Angeles')
      ).toBe('2026-10-03 08:15');
      // 2026-10-04T03:00Z == 2026-10-03 20:00 en America/Los_Angeles.
      expect(
        formatWccAppointmentStart('2026-10-04T03:00:00.000Z', 'America/Los_Angeles')
      ).toBe('2026-10-03 20:00');
    });
  });
});
