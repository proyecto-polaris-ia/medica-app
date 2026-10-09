import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  acquireDbSuiteLock,
  applyLocalDbEnv,
  localDbEnabled,
  releaseDbSuiteLock,
  truncateAllTables,
} from '@/test-utils/local-db';
import { NotFoundError } from '../errors';
import { createPatient } from '../patients';
import { createProvider } from '../providers';
import { createService } from '../services';
import { createAppointment } from '../appointments';
import { ValidationError } from '../validate';
import {
  getPatientRecord,
  listPatientAttendedAppointmentsPage,
  listPatientUpcomingAppointmentsPage,
} from '../patient-record';

/**
 * Suite de datos del expediente contra Supabase local (ver
 * openspec/changes/agregar-paginacion-citas-expediente). Corre solo con
 * `npm run test:local` (SUPABASE_LOCAL=1 + supabase start); sin la BD local
 * se salta por completo para no depender de mocks del query builder.
 */
const d = localDbEnabled ? describe : describe.skip;

const NOW = new Date('2026-09-12T00:00:00.000Z');
const MINUTE_MS = 60 * 1000;
const SLOT_MINUTES = 30;

type SeedStatus =
  | 'requested'
  | 'confirmed'
  | 'pending'
  | 'cancelled'
  | 'rescheduled'
  | 'no_show'
  | 'attended';

d('patient record appointments data layer (Supabase local)', () => {
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

  async function seedPatient() {
    const patient = await createPatient({
      fullName: 'Daniel Rodríguez',
      phoneE164: '+5215512345678',
    });
    const service = await createService({
      name: 'Limpieza dental',
      durationMinutes: SLOT_MINUTES,
    });
    const provider = await createProvider({ name: 'Dra. Ana Martínez' });
    return { patient, service, provider };
  }

  /**
   * Crea citas consecutivas de 30 min desde `baseIso`, sin solapes para el
   * mismo proveedor (EXCLUDE constraint). Devuelve los ids en el orden creado.
   */
  async function seedSeries(input: {
    count: number;
    status: SeedStatus | ((index: number) => SeedStatus);
    patientId: string;
    serviceId: string;
    providerId: string;
    baseIso: string;
  }): Promise<string[]> {
    const base = new Date(input.baseIso);
    const ids: string[] = [];
    for (let index = 0; index < input.count; index += 1) {
      const start = new Date(base.getTime() + index * SLOT_MINUTES * MINUTE_MS);
      const end = new Date(start.getTime() + SLOT_MINUTES * MINUTE_MS);
      const status =
        typeof input.status === 'function' ? input.status(index) : input.status;
      const appointment = await createAppointment({
        patientId: input.patientId,
        serviceId: input.serviceId,
        providerId: input.providerId,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        status,
      });
      ids.push(appointment.id);
    }
    return ids;
  }

  describe('listPatientUpcomingAppointmentsPage', () => {
    it('returns the nearest active future appointments ascending with the exact total', async () => {
      const { patient, service, provider } = await seedPatient();
      const activeIds = await seedSeries({
        count: 12,
        status: 'confirmed',
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        baseIso: '2026-09-13T08:00:00.000Z',
      });
      // Estados inactivos futuros: nunca deben aparecer.
      await seedSeries({
        count: 1,
        status: 'cancelled',
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        baseIso: '2026-09-13T14:00:00.000Z',
      });
      await seedSeries({
        count: 1,
        status: 'rescheduled',
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        baseIso: '2026-09-13T14:30:00.000Z',
      });
      await seedSeries({
        count: 1,
        status: 'no_show',
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        baseIso: '2026-09-13T15:00:00.000Z',
      });
      await seedSeries({
        count: 1,
        status: 'attended',
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        baseIso: '2026-09-13T15:30:00.000Z',
      });
      // Activa pero en el pasado: fuera de "futuras".
      await seedSeries({
        count: 1,
        status: 'confirmed',
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        baseIso: '2026-09-01T08:00:00.000Z',
      });

      const pageOne = await listPatientUpcomingAppointmentsPage(
        patient.id,
        1,
        10,
        NOW
      );

      expect(pageOne.total).toBe(12);
      expect(pageOne.appointments).toHaveLength(10);
      expect(pageOne.appointments.map((appointment) => appointment.id)).toEqual(
        activeIds.slice(0, 10)
      );
      const starts = pageOne.appointments.map((appointment) =>
        new Date(appointment.startAt).getTime()
      );
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
      expect(pageOne.appointments[0].serviceName).toBe('Limpieza dental');
      expect(pageOne.appointments[0].providerName).toBe('Dra. Ana Martínez');

      const pageTwo = await listPatientUpcomingAppointmentsPage(
        patient.id,
        2,
        10,
        NOW
      );
      expect(pageTwo.total).toBe(12);
      expect(pageTwo.appointments.map((appointment) => appointment.id)).toEqual(
        activeIds.slice(10)
      );
      const pageOneIds = new Set(pageOne.appointments.map((item) => item.id));
      expect(
        pageTwo.appointments.filter((item) => pageOneIds.has(item.id))
      ).toEqual([]);
    });

    it('returns an empty page beyond the total keeping the exact total', async () => {
      const { patient, service, provider } = await seedPatient();
      await seedSeries({
        count: 5,
        status: 'requested',
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        baseIso: '2026-09-13T08:00:00.000Z',
      });

      const result = await listPatientUpcomingAppointmentsPage(
        patient.id,
        3,
        10,
        NOW
      );

      expect(result.appointments).toEqual([]);
      expect(result.total).toBe(5);
    });

    it('returns an empty page with total 0 when there are no future appointments', async () => {
      const { patient, service, provider } = await seedPatient();
      await seedSeries({
        count: 2,
        status: 'attended',
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        baseIso: '2026-08-01T08:00:00.000Z',
      });

      const result = await listPatientUpcomingAppointmentsPage(
        patient.id,
        1,
        10,
        NOW
      );

      expect(result.appointments).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('rejects a malformed patient id and a missing patient', async () => {
      await expect(
        listPatientUpcomingAppointmentsPage('not-a-uuid', 1, 10, NOW)
      ).rejects.toBeInstanceOf(ValidationError);

      await expect(
        listPatientUpcomingAppointmentsPage(
          '00000000-0000-4000-8000-000000000099',
          1,
          10,
          NOW
        )
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('listPatientAttendedAppointmentsPage', () => {
    it('returns the attended history descending with the exact total', async () => {
      const { patient, service, provider } = await seedPatient();
      const attendedIds = await seedSeries({
        count: 12,
        status: 'attended',
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        baseIso: '2026-08-01T08:00:00.000Z',
      });
      // Activas pero no asistidas: nunca deben aparecer en el historial.
      await seedSeries({
        count: 1,
        status: 'confirmed',
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        baseIso: '2026-08-01T14:00:00.000Z',
      });
      await seedSeries({
        count: 1,
        status: 'requested',
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        baseIso: '2026-08-01T14:30:00.000Z',
      });

      const pageOne = await listPatientAttendedAppointmentsPage(
        patient.id,
        1,
        10
      );

      expect(pageOne.total).toBe(12);
      expect(pageOne.appointments).toHaveLength(10);
      // Descendente: la más reciente primero.
      expect(pageOne.appointments.map((appointment) => appointment.id)).toEqual(
        attendedIds.slice(2).reverse()
      );
      const starts = pageOne.appointments.map((appointment) =>
        new Date(appointment.startAt).getTime()
      );
      expect(starts).toEqual([...starts].sort((a, b) => b - a));

      const pageTwo = await listPatientAttendedAppointmentsPage(
        patient.id,
        2,
        10
      );
      expect(pageTwo.total).toBe(12);
      expect(pageTwo.appointments.map((appointment) => appointment.id)).toEqual(
        attendedIds.slice(0, 2).reverse()
      );
    });

    it('returns an empty history and total 0 when the patient has no attended appointments', async () => {
      const { patient, service, provider } = await seedPatient();
      await seedSeries({
        count: 3,
        status: 'confirmed',
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        baseIso: '2026-09-13T08:00:00.000Z',
      });

      const result = await listPatientAttendedAppointmentsPage(
        patient.id,
        1,
        10
      );

      expect(result.appointments).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('getPatientRecord', () => {
    it('returns the patient identity without appointment lists', async () => {
      const { patient, service, provider } = await seedPatient();
      await seedSeries({
        count: 1,
        status: 'confirmed',
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        baseIso: '2026-09-13T08:00:00.000Z',
      });

      const record = await getPatientRecord(patient.id);

      expect(record.patient.id).toBe(patient.id);
      expect(record.patient.fullName).toBe('Daniel Rodríguez');
      expect('upcomingAppointments' in record).toBe(false);
      expect('attendedAppointments' in record).toBe(false);
    });

    it('rejects a missing patient with NotFoundError', async () => {
      await expect(
        getPatientRecord('00000000-0000-4000-8000-000000000099')
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rejects a malformed patient id with ValidationError', async () => {
      await expect(getPatientRecord('not-a-uuid')).rejects.toBeInstanceOf(
        ValidationError
      );
    });
  });
});
