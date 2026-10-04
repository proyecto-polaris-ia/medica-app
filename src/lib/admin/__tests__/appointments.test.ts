import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  acquireDbSuiteLock,
  applyLocalDbEnv,
  localDbEnabled,
  releaseDbSuiteLock,
  truncateAllTables,
} from '@/test-utils/local-db';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { createPatient } from '../patients';
import { createProvider } from '../providers';
import { createService } from '../services';
import {
  createAppointment,
  deleteAppointment,
  listAppointments,
  listAppointmentsRange,
  listByProviderRange,
  listUpcomingByProvider,
  updateAppointment,
} from '../appointments';
import { ConflictError, NotFoundError } from '../errors';
import { ValidationError } from '../validate';
import type { Appointment } from '../types';

/**
 * Suite contra Supabase local (ver openspec/changes/supabase-local-testing).
 * Corre solo con `npm run test:local` (SUPABASE_LOCAL=1 + supabase start);
 * con `npm run test` regular se omite.
 */
const d = localDbEnabled ? describe : describe.skip;

// Las suites de datos se serializan con un advisory lock (ver
// src/test-utils/local-db.ts) porque vitest corre los archivos en paralelo
// y todas truncan el esquema `public`.

d('appointments service', () => {
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

  /** Fixtures deterministas vía funciones de dominio (patient/service/provider). */
  async function seedFixtures() {
    const patient = await createPatient({
      fullName: 'Juan Pérez',
      phoneE164: '+5215512345678',
    });
    const service = await createService({ name: 'Limpieza', durationMinutes: 30 });
    const provider = await createProvider({ name: 'Dra. Ana' });
    return { patient, service, provider };
  }

  /**
   * Lectura cruda de la fila: las columnas de transición (`confirmed_at`,
   * `cancelled_at`, `no_show_at`) no las expone el mapper del dominio.
   */
  async function readAppointmentRow(id: string): Promise<Record<string, unknown>> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) throw new Error(error?.message ?? 'Appointment row not found');
    return data as Record<string, unknown>;
  }

  /**
   * No existe función de dominio para recordatorios: se insertan directo en la
   * tabla, con `created_at` explícito para controlar el orden "más reciente primero".
   */
  async function insertReminder(input: {
    appointmentId: string;
    key: string;
    cadence: 'h24' | 'same_day';
    status: 'scheduled' | 'sent' | 'failed';
    dryRun: boolean;
    sentAt: string | null;
    createdAt: string;
  }): Promise<void> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('appointment_reminders').insert({
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

  it('lists mapped appointments', async () => {
    const { patient, service, provider } = await seedFixtures();
    const created = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: '2026-09-10T14:00:00.000Z',
      endAt: '2026-09-10T14:30:00.000Z',
      status: 'confirmed',
      notes: 'Paciente nerviosa',
    });

    const appointments = await listAppointments();

    expect(appointments).toHaveLength(1);
    const appointment = appointments[0];
    expect(appointment).toMatchObject({
      id: created.id,
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      status: 'confirmed',
      notes: 'Paciente nerviosa',
      reminders: [],
    });
    // timestamptz vuelve con offset `+00:00`: se normaliza a ISO.
    expect(iso(appointment.startAt)).toBe('2026-09-10T14:00:00.000Z');
    expect(iso(appointment.endAt)).toBe('2026-09-10T14:30:00.000Z');
    expect(iso(appointment.createdAt)).toBe(iso(created.createdAt));
    expect(iso(appointment.updatedAt)).toBe(iso(created.updatedAt));
  });

  it('groups appointment reminders by appointment_id, newest first', async () => {
    const { patient, service, provider } = await seedFixtures();
    const first = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: '2026-09-10T14:00:00.000Z',
      endAt: '2026-09-10T14:30:00.000Z',
      status: 'confirmed',
    });
    const second = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: '2026-09-11T14:00:00.000Z',
      endAt: '2026-09-11T14:30:00.000Z',
    });

    await insertReminder({
      appointmentId: first.id,
      key: `${first.id}-same_day`,
      cadence: 'same_day',
      status: 'scheduled',
      dryRun: true,
      sentAt: null,
      createdAt: '2026-09-02T10:00:00Z',
    });
    await insertReminder({
      appointmentId: first.id,
      key: `${first.id}-h24`,
      cadence: 'h24',
      status: 'sent',
      dryRun: false,
      sentAt: '2026-09-01T15:15:00Z',
      createdAt: '2026-09-01T15:15:00Z',
    });
    await insertReminder({
      appointmentId: second.id,
      key: `${second.id}-h24`,
      cadence: 'h24',
      status: 'failed',
      dryRun: false,
      sentAt: null,
      createdAt: '2026-09-01T16:00:00Z',
    });

    const appointments = await listAppointments();
    const byId = new Map(appointments.map((appointment) => [appointment.id, appointment]));

    const normalize = (
      reminders: Appointment['reminders']
    ) =>
      reminders.map((reminder) => ({
        cadence: reminder.cadence,
        status: reminder.status,
        dryRun: reminder.dryRun,
        sentAt: reminder.sentAt ? iso(reminder.sentAt) : null,
        createdAt: iso(reminder.createdAt),
      }));

    expect(normalize(byId.get(first.id)?.reminders ?? [])).toEqual([
      {
        cadence: 'same_day',
        status: 'scheduled',
        sentAt: null,
        dryRun: true,
        createdAt: '2026-09-02T10:00:00.000Z',
      },
      {
        cadence: 'h24',
        status: 'sent',
        sentAt: '2026-09-01T15:15:00.000Z',
        dryRun: false,
        createdAt: '2026-09-01T15:15:00.000Z',
      },
    ]);
    expect(normalize(byId.get(second.id)?.reminders ?? [])).toEqual([
      {
        cadence: 'h24',
        status: 'failed',
        sentAt: null,
        dryRun: false,
        createdAt: '2026-09-01T16:00:00.000Z',
      },
    ]);
  });

  it('leaves reminders empty when an appointment has none', async () => {
    const { patient, service, provider } = await seedFixtures();
    await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: '2026-09-10T14:00:00.000Z',
      endAt: '2026-09-10T14:30:00.000Z',
      status: 'confirmed',
    });

    const appointments = await listAppointments();

    expect(appointments[0].reminders).toEqual([]);
  });

  it('attaches reminders to ranged appointments too', async () => {
    const { patient, service, provider } = await seedFixtures();
    const created = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: '2026-06-10T14:00:00.000Z',
      endAt: '2026-06-10T14:30:00.000Z',
      status: 'pending',
    });
    await insertReminder({
      appointmentId: created.id,
      key: `${created.id}-same_day`,
      cadence: 'same_day',
      status: 'sent',
      dryRun: false,
      sentAt: '2026-06-10T14:00:00Z',
      createdAt: '2026-06-10T14:00:00Z',
    });

    const appointments = await listAppointmentsRange(
      '2026-06-01T06:00:00.000Z',
      '2026-07-01T06:00:00.000Z'
    );

    expect(appointments).toHaveLength(1);
    const reminders = appointments[0].reminders;
    expect(
      reminders.map((reminder) => ({
        cadence: reminder.cadence,
        status: reminder.status,
        dryRun: reminder.dryRun,
        sentAt: reminder.sentAt ? iso(reminder.sentAt) : null,
        createdAt: iso(reminder.createdAt),
      }))
    ).toEqual([
      {
        cadence: 'same_day',
        status: 'sent',
        sentAt: '2026-06-10T14:00:00.000Z',
        dryRun: false,
        createdAt: '2026-06-10T14:00:00.000Z',
      },
    ]);
  });

  it('creates an appointment', async () => {
    const { patient, service, provider } = await seedFixtures();

    const appointment = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: '2026-09-10T14:00:00.000Z',
      endAt: '2026-09-10T14:30:00.000Z',
    });

    expect(appointment.status).toBe('requested');
    expect(appointment.notes).toBeNull();
    // Outcome observable en la BD: la cita quedó persistida con sus FKs.
    const stored = await listAppointments();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id: appointment.id,
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
    });
  });

  it('trims and stores notes when creating an appointment', async () => {
    const { patient, service, provider } = await seedFixtures();

    const appointment = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: '2026-09-10T14:00:00.000Z',
      endAt: '2026-09-10T14:30:00.000Z',
      notes: '  Prefiere mañana  ',
    });

    expect(appointment.notes).toBe('Prefiere mañana');
    const row = await readAppointmentRow(appointment.id);
    expect(row.notes).toBe('Prefiere mañana');
  });

  it('stores null for empty notes when creating an appointment', async () => {
    const { patient, service, provider } = await seedFixtures();

    const appointment = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: '2026-09-10T14:00:00.000Z',
      endAt: '2026-09-10T14:30:00.000Z',
      notes: '   ',
    });

    expect(appointment.notes).toBeNull();
    const row = await readAppointmentRow(appointment.id);
    expect(row.notes).toBeNull();
  });

  it('rejects notes longer than 1000 characters', async () => {
    await expect(createAppointment({
      patientId: '550e8400-e29b-41d4-a716-446655440001',
      serviceId: '550e8400-e29b-41d4-a716-446655440002',
      providerId: '550e8400-e29b-41d4-a716-446655440003',
      startAt: '2026-09-10T14:00:00.000Z',
      endAt: '2026-09-10T14:30:00.000Z',
      notes: 'a'.repeat(1001),
    })).rejects.toThrow(ValidationError);
  });

  it('translates a 23P01 exclusion violation into ConflictError', async () => {
    const { service, provider } = await seedFixtures();
    // Primera cita en el slot: la restricción real EXCLUDE impide el solape.
    await createAppointment({
      serviceId: service.id,
      providerId: provider.id,
      startAt: '2026-09-10T14:00:00.000Z',
      endAt: '2026-09-10T14:30:00.000Z',
    });

    await expect(createAppointment({
      serviceId: service.id,
      providerId: provider.id,
      startAt: '2026-09-10T14:15:00.000Z',
      endAt: '2026-09-10T14:45:00.000Z',
    })).rejects.toThrow(ConflictError);
  });

  it('rejects an end time before start time', async () => {
    await expect(createAppointment({
      serviceId: '550e8400-e29b-41d4-a716-446655440002',
      providerId: '550e8400-e29b-41d4-a716-446655440003',
      startAt: '2026-09-10T14:30:00.000Z',
      endAt: '2026-09-10T14:00:00.000Z',
    })).rejects.toThrow(ValidationError);
  });

  it('updates an appointment', async () => {
    const { patient, service, provider } = await seedFixtures();
    const created = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: '2026-09-10T14:00:00.000Z',
      endAt: '2026-09-10T14:30:00.000Z',
    });

    const appointment = await updateAppointment(created.id, {
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: '2026-09-10T15:00:00.000Z',
      endAt: '2026-09-10T15:30:00.000Z',
      status: 'confirmed',
    });

    expect(appointment.status).toBe('confirmed');
    const row = await readAppointmentRow(created.id);
    expect(row.status).toBe('confirmed');
    expect(iso(row.start_at as string)).toBe('2026-09-10T15:00:00.000Z');
  });

  it('updateAppointment throws NotFoundError for a missing appointment', async () => {
    const { service, provider } = await seedFixtures();

    await expect(
      updateAppointment('00000000-0000-4000-8000-00000000dead', {
        serviceId: service.id,
        providerId: provider.id,
        startAt: '2026-09-10T15:00:00.000Z',
        endAt: '2026-09-10T15:30:00.000Z',
        status: 'confirmed',
      })
    ).rejects.toThrow(NotFoundError);
  });

  it('updateAppointment estampa confirmed_at cuando el status cambia', async () => {
    const { patient, service, provider } = await seedFixtures();
    const created = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: '2026-09-10T15:00:00.000Z',
      endAt: '2026-09-10T15:30:00.000Z',
    });
    expect((await readAppointmentRow(created.id)).confirmed_at).toBeNull();

    await updateAppointment(created.id, {
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: '2026-09-10T15:00:00.000Z',
      endAt: '2026-09-10T15:30:00.000Z',
      status: 'confirmed',
    });

    expect((await readAppointmentRow(created.id)).confirmed_at).toBeTruthy();
  });

  it('updateAppointment no reescribe el instante si el status no cambia', async () => {
    const { patient, service, provider } = await seedFixtures();
    const created = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: '2026-09-10T15:00:00.000Z',
      endAt: '2026-09-10T15:30:00.000Z',
      status: 'confirmed',
      notes: 'original',
    });
    const before = (await readAppointmentRow(created.id)).confirmed_at as string;
    expect(before).toBeTruthy();

    await updateAppointment(created.id, {
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: '2026-09-10T15:00:00.000Z',
      endAt: '2026-09-10T15:30:00.000Z',
      status: 'confirmed',
      notes: 'actualizado',
    });

    const after = await readAppointmentRow(created.id);
    expect(after.confirmed_at).toBe(before);
    expect(after.notes).toBe('actualizado');
    expect(after.cancelled_at).toBeNull();
    expect(after.no_show_at).toBeNull();
  });

  it('updateAppointment reestampa el nuevo estado sin tocar el anterior', async () => {
    const { patient, service, provider } = await seedFixtures();
    const created = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: '2026-09-10T15:00:00.000Z',
      endAt: '2026-09-10T15:30:00.000Z',
      status: 'cancelled',
    });
    const cancelledAt = (await readAppointmentRow(created.id)).cancelled_at as string;
    expect(cancelledAt).toBeTruthy();

    await updateAppointment(created.id, {
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: '2026-09-10T15:00:00.000Z',
      endAt: '2026-09-10T15:30:00.000Z',
      status: 'confirmed',
    });

    const row = await readAppointmentRow(created.id);
    expect(row.confirmed_at).toBeTruthy();
    expect(row.cancelled_at).toBe(cancelledAt);
  });

  it('createAppointment estampa el status inicial estampable', async () => {
    const { patient, service, provider } = await seedFixtures();

    const created = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: '2026-09-10T15:00:00.000Z',
      endAt: '2026-09-10T15:30:00.000Z',
      status: 'confirmed',
    });

    expect((await readAppointmentRow(created.id)).confirmed_at).toBeTruthy();
  });

  it('createAppointment no agrega columnas de transición para requested', async () => {
    const { patient, service, provider } = await seedFixtures();

    const created = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: '2026-09-10T15:00:00.000Z',
      endAt: '2026-09-10T15:30:00.000Z',
    });

    const row = await readAppointmentRow(created.id);
    expect(row.confirmed_at).toBeNull();
    expect(row.cancelled_at).toBeNull();
    expect(row.no_show_at).toBeNull();
  });

  it('deletes an appointment', async () => {
    const { patient, service, provider } = await seedFixtures();
    const created = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: '2026-09-10T15:00:00.000Z',
      endAt: '2026-09-10T15:30:00.000Z',
    });

    await deleteAppointment(created.id);

    const appointments = await listAppointments();
    expect(appointments.find((appointment) => appointment.id === created.id)).toBeUndefined();
  });

  describe('listUpcomingByProvider', () => {
    it('returns future appointments sorted ascending with patient/service names', async () => {
      const { patient, service, provider } = await seedFixtures();
      await createAppointment({
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        startAt: '2026-08-01T14:00:00.000Z',
        endAt: '2026-08-01T14:30:00.000Z',
        status: 'attended',
      });
      await createAppointment({
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        startAt: '2026-09-10T14:00:00.000Z',
        endAt: '2026-09-10T14:30:00.000Z',
        status: 'confirmed',
      });
      await createAppointment({
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        startAt: '2026-09-05T14:00:00.000Z',
        endAt: '2026-09-05T14:30:00.000Z',
        status: 'confirmed',
      });

      const now = new Date('2026-09-01T10:00:00.000Z');
      const appointments = await listUpcomingByProvider(provider.id, now);

      expect(appointments).toHaveLength(2);
      expect(appointments.map((appointment) => iso(appointment.startAt))).toEqual([
        '2026-09-05T14:00:00.000Z',
        '2026-09-10T14:00:00.000Z',
      ]);
      expect(appointments[0].patientName).toBe('Juan Pérez');
      expect(appointments[0].serviceName).toBe('Limpieza');
    });

    it('respects a custom limit', async () => {
      const { patient, service, provider } = await seedFixtures();
      for (const day of ['2026-09-05', '2026-09-06', '2026-09-07']) {
        await createAppointment({
          patientId: patient.id,
          serviceId: service.id,
          providerId: provider.id,
          startAt: `${day}T14:00:00.000Z`,
          endAt: `${day}T14:30:00.000Z`,
          status: 'confirmed',
        });
      }

      const appointments = await listUpcomingByProvider(
        provider.id,
        new Date('2026-09-01T10:00:00.000Z'),
        2
      );

      expect(appointments).toHaveLength(2);
      expect(appointments.map((appointment) => iso(appointment.startAt))).toEqual([
        '2026-09-05T14:00:00.000Z',
        '2026-09-06T14:00:00.000Z',
      ]);
    });
  });

  describe('listByProviderRange', () => {
    it('returns appointments within the half-open range and maps embeds', async () => {
      const { patient, service, provider } = await seedFixtures();
      const inRange = await createAppointment({
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        startAt: '2026-09-03T14:00:00.000Z',
        endAt: '2026-09-03T14:30:00.000Z',
        status: 'attended',
      });
      await createAppointment({
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        startAt: '2026-09-05T14:00:00.000Z',
        endAt: '2026-09-05T14:30:00.000Z',
        status: 'attended',
      });

      const start = new Date('2026-09-03T06:00:00.000Z');
      const end = new Date('2026-09-04T06:00:00.000Z');
      const appointments = await listByProviderRange(provider.id, start, end);

      expect(appointments).toHaveLength(1);
      expect(appointments[0]).toMatchObject({
        id: inRange.id,
        patientId: patient.id,
        patientName: 'Juan Pérez',
        serviceName: 'Limpieza',
        status: 'attended',
      });
      expect(iso(appointments[0].startAt)).toBe('2026-09-03T14:00:00.000Z');
      expect(iso(appointments[0].endAt)).toBe('2026-09-03T14:30:00.000Z');
    });
  });

  it('lists appointments within a date range', async () => {
    const { patient, service, provider } = await seedFixtures();
    const first = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: '2026-06-10T14:00:00.000Z',
      endAt: '2026-06-10T14:30:00.000Z',
      status: 'confirmed',
    });
    const second = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: '2026-06-12T09:00:00.000Z',
      endAt: '2026-06-12T09:30:00.000Z',
      status: 'confirmed',
    });
    // Fuera del rango: el filtro real `gte`/`lt` lo excluye.
    await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: '2026-07-05T09:00:00.000Z',
      endAt: '2026-07-05T09:30:00.000Z',
      status: 'confirmed',
    });

    const appointments = await listAppointmentsRange(
      '2026-06-01T06:00:00.000Z',
      '2026-07-01T06:00:00.000Z'
    );

    expect(appointments.map((appointment) => appointment.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(iso(appointments[0].startAt)).toBe('2026-06-10T14:00:00.000Z');
  });

  it('rejects a range where end is before or equal to start', async () => {
    await expect(
      listAppointmentsRange(
        '2026-06-10T06:00:00.000Z',
        '2026-06-10T06:00:00.000Z'
      )
    ).rejects.toThrow(ValidationError);

    await expect(
      listAppointmentsRange(
        '2026-06-10T06:00:00.000Z',
        '2026-06-09T06:00:00.000Z'
      )
    ).rejects.toThrow(ValidationError);
  });

  it('rejects a range span greater than 62 days', async () => {
    await expect(
      listAppointmentsRange(
        '2026-06-01T06:00:00.000Z',
        '2026-08-15T06:00:00.000Z'
      )
    ).rejects.toThrow(ValidationError);
  });
});
