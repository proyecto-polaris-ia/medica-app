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
import { createAppointment, listAppointmentsPaged } from '../appointments';
import { ValidationError } from '../validate';

/**
 * Suite de paginación de citas contra Supabase local (ver
 * openspec/changes/supabase-local-testing y
 * openspec/changes/agregar-paginacion-citas). Corre solo con
 * `npm run test:local` (SUPABASE_LOCAL=1 + supabase start).
 */
const d = localDbEnabled ? describe : describe.skip;

const iso = (value: string) => new Date(value).toISOString();
const MINUTE_MS = 60 * 1000;

d('listAppointmentsPaged', () => {
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

  async function seedFixtures() {
    const service = await createService({ name: 'Limpieza', durationMinutes: 30 });
    const provider = await createProvider({ name: 'Dra. Ana' });
    const patient = await createPatient({
      fullName: 'Juan Pérez',
      phoneE164: '+5215512345678',
    });
    return { patient, service, provider };
  }

  /**
   * Crea `count` citas consecutivas de 30 min por proveedor desde una base fija,
   * garantizando `start_at` distintos y sin solapes (EXCLUDE constraint).
   */
  async function seedSeries(input: {
    count: number;
    serviceId: string;
    providerId: string;
    patientId?: string | null;
    baseIso?: string;
  }): Promise<string[]> {
    const base = new Date(input.baseIso ?? '2026-09-01T08:00:00.000Z');
    const ids: string[] = [];
    for (let index = 0; index < input.count; index += 1) {
      const start = new Date(base.getTime() + index * 30 * MINUTE_MS);
      const end = new Date(start.getTime() + 30 * MINUTE_MS);
      const appointment = await createAppointment({
        patientId: input.patientId ?? null,
        serviceId: input.serviceId,
        providerId: input.providerId,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        status: 'confirmed',
      });
      ids.push(appointment.id);
    }
    return ids;
  }

  /** Escribe `created_at` explícito: la suite necesita un orden determinista. */
  async function setCreatedAt(id: string, createdAtIso: string): Promise<void> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('appointments')
      .update({ created_at: createdAtIso })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async function insertReminder(appointmentId: string): Promise<void> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('appointment_reminders').insert({
      appointment_id: appointmentId,
      reminder_key: `${appointmentId}-h24`,
      cadence: 'h24',
      status: 'sent',
      dry_run: false,
      sent_at: '2026-09-01T08:00:00Z',
      created_at: '2026-09-01T08:00:00Z',
    });
    if (error) throw new Error(error.message);
  }

  describe('paginación', () => {
    it('uses the default page 1 / pageSize 20 and returns an exact total', async () => {
      const { service, provider, patient } = await seedFixtures();
      await seedSeries({
        count: 25,
        serviceId: service.id,
        providerId: provider.id,
        patientId: patient.id,
      });

      const result = await listAppointmentsPaged({});

      expect(result.appointments).toHaveLength(20);
      expect(result.total).toBe(25);
    });

    it('returns disjoint consecutive pages and counts the filtered set', async () => {
      const { service, provider } = await seedFixtures();
      await seedSeries({ count: 45, serviceId: service.id, providerId: provider.id });

      const firstPage = await listAppointmentsPaged({ page: 1, pageSize: 20 });
      const secondPage = await listAppointmentsPaged({ page: 2, pageSize: 20 });
      const thirdPage = await listAppointmentsPaged({ page: 3, pageSize: 20 });

      expect(firstPage.appointments).toHaveLength(20);
      expect(secondPage.appointments).toHaveLength(20);
      expect(thirdPage.appointments).toHaveLength(5);
      expect(firstPage.total).toBe(45);
      expect(Math.ceil(firstPage.total / 20)).toBe(3);

      const firstIds = new Set(firstPage.appointments.map((appointment) => appointment.id));
      const overlap = secondPage.appointments.filter((appointment) =>
        firstIds.has(appointment.id)
      );
      expect(overlap).toEqual([]);
    });

    it('returns an empty page beyond the total keeping the exact total', async () => {
      const { service, provider } = await seedFixtures();
      await seedSeries({ count: 5, serviceId: service.id, providerId: provider.id });

      const result = await listAppointmentsPaged({ page: 9, pageSize: 20 });

      expect(result.appointments).toEqual([]);
      expect(result.total).toBe(5);
    });

    it('returns an empty page with total 0 when the filtered set is empty', async () => {
      const { service, provider } = await seedFixtures();
      await seedSeries({ count: 2, serviceId: service.id, providerId: provider.id });

      const result = await listAppointmentsPaged({
        page: 5,
        pageSize: 20,
        startAtIso: '2030-01-01T00:00:00.000Z',
        endAtIso: '2030-02-01T00:00:00.000Z',
      });

      expect(result.appointments).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('supports the upper pageSize boundary of 100 and a single row page', async () => {
      const { service, provider } = await seedFixtures();
      await seedSeries({ count: 5, serviceId: service.id, providerId: provider.id });

      const wide = await listAppointmentsPaged({ page: 1, pageSize: 100 });
      const narrow = await listAppointmentsPaged({ page: 1, pageSize: 1 });

      expect(wide.appointments).toHaveLength(5);
      expect(wide.total).toBe(5);
      expect(narrow.appointments).toHaveLength(1);
      expect(narrow.total).toBe(5);
    });
  });

  describe('filtros', () => {
    it('counts the filtered set for each filter and applies AND between them', async () => {
      const serviceX = await createService({ name: 'Servicio X', durationMinutes: 30 });
      const serviceY = await createService({ name: 'Servicio Y', durationMinutes: 30 });
      const providerA = await createProvider({ name: 'Proveedor A' });
      const providerB = await createProvider({ name: 'Proveedor B' });
      const patientOne = await createPatient({
        fullName: 'Paciente Uno',
        phoneE164: '+5215512345601',
      });
      const patientTwo = await createPatient({
        fullName: 'Paciente Dos',
        phoneE164: '+5215512345602',
      });

      // A + X + P1 (junio), A + Y + P1 (junio), B + X + P2 (junio), A + X + P2 (julio)
      await createAppointment({
        patientId: patientOne.id,
        serviceId: serviceX.id,
        providerId: providerA.id,
        startAt: '2026-06-10T09:00:00.000Z',
        endAt: '2026-06-10T09:30:00.000Z',
        status: 'confirmed',
      });
      await createAppointment({
        patientId: patientOne.id,
        serviceId: serviceY.id,
        providerId: providerA.id,
        startAt: '2026-06-11T09:00:00.000Z',
        endAt: '2026-06-11T09:30:00.000Z',
        status: 'confirmed',
      });
      await createAppointment({
        patientId: patientTwo.id,
        serviceId: serviceX.id,
        providerId: providerB.id,
        startAt: '2026-06-12T09:00:00.000Z',
        endAt: '2026-06-12T09:30:00.000Z',
        status: 'confirmed',
      });
      await createAppointment({
        patientId: patientTwo.id,
        serviceId: serviceX.id,
        providerId: providerA.id,
        startAt: '2026-07-10T09:00:00.000Z',
        endAt: '2026-07-10T09:30:00.000Z',
        status: 'confirmed',
      });

      const byProvider = await listAppointmentsPaged({
        providerId: providerA.id,
        pageSize: 100,
      });
      expect(byProvider.total).toBe(3);
      expect(
        byProvider.appointments.every((appointment) => appointment.providerId === providerA.id)
      ).toBe(true);

      const byPatient = await listAppointmentsPaged({
        patientId: patientOne.id,
        pageSize: 100,
      });
      expect(byPatient.total).toBe(2);

      const byService = await listAppointmentsPaged({
        serviceId: serviceX.id,
        pageSize: 100,
      });
      expect(byService.total).toBe(3);

      const byRange = await listAppointmentsPaged({
        startAtIso: '2026-06-01T00:00:00.000Z',
        endAtIso: '2026-07-01T00:00:00.000Z',
        pageSize: 100,
      });
      expect(byRange.total).toBe(3);
      expect(
        byRange.appointments.every(
          (appointment) =>
            iso(appointment.startAt) >= '2026-06-01T00:00:00.000Z' &&
            iso(appointment.startAt) < '2026-07-01T00:00:00.000Z'
        )
      ).toBe(true);

      const intersection = await listAppointmentsPaged({
        providerId: providerA.id,
        serviceId: serviceX.id,
        startAtIso: '2026-06-01T00:00:00.000Z',
        endAtIso: '2026-07-01T00:00:00.000Z',
        pageSize: 100,
      });
      expect(intersection.total).toBe(1);
      expect(intersection.appointments).toHaveLength(1);
      expect(intersection.appointments[0]).toMatchObject({
        providerId: providerA.id,
        serviceId: serviceX.id,
        patientId: patientOne.id,
      });
    });
  });

  describe('ordenamiento', () => {
    it('orders by each whitelisted column and direction', async () => {
      const providerZeta = await createProvider({ name: 'Zeta Dr' });
      const providerAlfa = await createProvider({ name: 'Alfa Dr' });
      const serviceBeta = await createService({ name: 'Beta Svc', durationMinutes: 30 });
      const serviceAlfa = await createService({ name: 'Alfa Svc', durationMinutes: 30 });
      const patientCarla = await createPatient({
        fullName: 'Carla Orden',
        phoneE164: '+5215512345603',
      });
      const patientAna = await createPatient({
        fullName: 'Ana Orden',
        phoneE164: '+5215512345604',
      });

      // Fechas deliberadamente cruzadas para que end_at no coincida con start_at.
      const first = await createAppointment({
        patientId: patientCarla.id,
        serviceId: serviceBeta.id,
        providerId: providerZeta.id,
        startAt: '2026-06-03T15:00:00.000Z',
        endAt: '2026-06-03T15:30:00.000Z',
        status: 'confirmed',
      });
      const second = await createAppointment({
        patientId: patientAna.id,
        serviceId: serviceAlfa.id,
        providerId: providerAlfa.id,
        startAt: '2026-06-01T09:00:00.000Z',
        endAt: '2026-06-05T09:00:00.000Z',
        status: 'attended',
      });
      const third = await createAppointment({
        patientId: patientAna.id,
        serviceId: serviceAlfa.id,
        providerId: providerZeta.id,
        startAt: '2026-06-02T12:00:00.000Z',
        endAt: '2026-06-02T12:30:00.000Z',
        status: 'requested',
      });

      await setCreatedAt(first.id, '2026-01-02T00:00:00.000Z');
      await setCreatedAt(second.id, '2026-01-03T00:00:00.000Z');
      await setCreatedAt(third.id, '2026-01-01T00:00:00.000Z');

      const ids = async (params: Parameters<typeof listAppointmentsPaged>[0]) =>
        (await listAppointmentsPaged({ pageSize: 100, ...params })).appointments.map(
          (appointment) => appointment.id
        );

      expect(await ids({ sort: 'start_at', sortDir: 'asc' })).toEqual([
        second.id,
        third.id,
        first.id,
      ]);
      expect(await ids({ sort: 'start_at', sortDir: 'desc' })).toEqual([
        first.id,
        third.id,
        second.id,
      ]);

      expect(await ids({ sort: 'end_at', sortDir: 'asc' })).toEqual([
        third.id,
        first.id,
        second.id,
      ]);
      expect(await ids({ sort: 'end_at', sortDir: 'desc' })).toEqual([
        second.id,
        first.id,
        third.id,
      ]);

      expect(await ids({ sort: 'created_at', sortDir: 'asc' })).toEqual([
        third.id,
        first.id,
        second.id,
      ]);
      expect(await ids({ sort: 'created_at', sortDir: 'desc' })).toEqual([
        second.id,
        first.id,
        third.id,
      ]);

      const statusAsc = await ids({ sort: 'status', sortDir: 'asc' });
      const statusDesc = await ids({ sort: 'status', sortDir: 'desc' });
      expect(statusAsc).toEqual([third.id, first.id, second.id]);
      expect(statusDesc).toEqual([...statusAsc].reverse());
    });

    it('orders by patient, service and provider names with pagination', async () => {
      const providerZeta = await createProvider({ name: 'Zeta Dr' });
      const providerAlfa = await createProvider({ name: 'Alfa Dr' });
      const serviceBeta = await createService({ name: 'Beta Svc', durationMinutes: 30 });
      const serviceAlfa = await createService({ name: 'Alfa Svc', durationMinutes: 30 });
      const patientCarla = await createPatient({
        fullName: 'Carla Orden',
        phoneE164: '+5215512345605',
      });
      const patientAna = await createPatient({
        fullName: 'Ana Orden',
        phoneE164: '+5215512345606',
      });

      const carlaAppointment = await createAppointment({
        patientId: patientCarla.id,
        serviceId: serviceBeta.id,
        providerId: providerZeta.id,
        startAt: '2026-06-03T15:00:00.000Z',
        endAt: '2026-06-03T15:30:00.000Z',
        status: 'confirmed',
      });
      const anaAppointment = await createAppointment({
        patientId: patientAna.id,
        serviceId: serviceAlfa.id,
        providerId: providerAlfa.id,
        startAt: '2026-06-01T09:00:00.000Z',
        endAt: '2026-06-01T09:30:00.000Z',
        status: 'confirmed',
      });
      const anaAppointmentTwo = await createAppointment({
        patientId: patientAna.id,
        serviceId: serviceAlfa.id,
        providerId: providerZeta.id,
        startAt: '2026-06-02T09:00:00.000Z',
        endAt: '2026-06-02T09:30:00.000Z',
        status: 'confirmed',
      });

      const byPatient = await listAppointmentsPaged({
        sort: 'patient',
        sortDir: 'asc',
        pageSize: 100,
      });
      expect(
        byPatient.appointments.map((appointment) =>
          appointment.patientId === patientAna.id ? 'Ana' : 'Carla'
        )
      ).toEqual(['Ana', 'Ana', 'Carla']);

      const byPatientDesc = await listAppointmentsPaged({
        sort: 'patient',
        sortDir: 'desc',
        pageSize: 100,
      });
      expect(
        byPatientDesc.appointments.map((appointment) =>
          appointment.patientId === patientAna.id ? 'Ana' : 'Carla'
        )
      ).toEqual(['Carla', 'Ana', 'Ana']);

      const byService = await listAppointmentsPaged({
        sort: 'service',
        sortDir: 'asc',
        pageSize: 100,
      });
      expect(
        byService.appointments.map((appointment) =>
          appointment.serviceId === serviceAlfa.id ? 'Alfa' : 'Beta'
        )
      ).toEqual(['Alfa', 'Alfa', 'Beta']);
      const byServiceDesc = await listAppointmentsPaged({
        sort: 'service',
        sortDir: 'desc',
        pageSize: 100,
      });
      expect(
        byServiceDesc.appointments.map((appointment) =>
          appointment.serviceId === serviceAlfa.id ? 'Alfa' : 'Beta'
        )
      ).toEqual(['Beta', 'Alfa', 'Alfa']);

      const byProvider = await listAppointmentsPaged({
        sort: 'provider',
        sortDir: 'asc',
        pageSize: 100,
      });
      expect(
        byProvider.appointments.map((appointment) =>
          appointment.providerId === providerAlfa.id ? 'Alfa' : 'Zeta'
        )
      ).toEqual(['Alfa', 'Zeta', 'Zeta']);
      const byProviderDesc = await listAppointmentsPaged({
        sort: 'provider',
        sortDir: 'desc',
        pageSize: 100,
      });
      expect(
        byProviderDesc.appointments.map((appointment) =>
          appointment.providerId === providerAlfa.id ? 'Alfa' : 'Zeta'
        )
      ).toEqual(['Zeta', 'Zeta', 'Alfa']);

      // Con paginación: la primera página del orden por nombre no repite filas.
      const namePageOne = await listAppointmentsPaged({
        sort: 'patient',
        sortDir: 'asc',
        page: 1,
        pageSize: 2,
      });
      const namePageTwo = await listAppointmentsPaged({
        sort: 'patient',
        sortDir: 'asc',
        page: 2,
        pageSize: 2,
      });
      expect(namePageOne.appointments).toHaveLength(2);
      expect(namePageTwo.appointments).toHaveLength(1);
      expect(namePageOne.total).toBe(3);
      const pageOneIds = new Set(namePageOne.appointments.map((a) => a.id));
      expect(
        namePageTwo.appointments.filter((a) => pageOneIds.has(a.id))
      ).toEqual([]);
      expect([carlaAppointment.id, anaAppointment.id, anaAppointmentTwo.id]).toContain(
        namePageTwo.appointments[0].id
      );
    });
  });

  describe('validación', () => {
    it('rejects an invalid page or pageSize', async () => {
      await expect(listAppointmentsPaged({ page: 0 })).rejects.toThrow(ValidationError);
      await expect(listAppointmentsPaged({ page: -1 })).rejects.toThrow(ValidationError);
      await expect(listAppointmentsPaged({ page: 1.5 })).rejects.toThrow(ValidationError);
      await expect(listAppointmentsPaged({ pageSize: 0 })).rejects.toThrow(
        ValidationError
      );
      await expect(listAppointmentsPaged({ pageSize: 101 })).rejects.toThrow(
        ValidationError
      );
      await expect(listAppointmentsPaged({ pageSize: 20.5 })).rejects.toThrow(
        ValidationError
      );
    });

    it('rejects an unknown sort column or direction', async () => {
      await expect(
        listAppointmentsPaged({ sort: 'bogus' as never })
      ).rejects.toThrow(ValidationError);
      await expect(
        listAppointmentsPaged({ sortDir: 'up' as never })
      ).rejects.toThrow(ValidationError);
    });

    it('rejects a partial date range in list mode', async () => {
      await expect(
        listAppointmentsPaged({ startAtIso: '2026-06-01T00:00:00.000Z' })
      ).rejects.toThrow(ValidationError);
      await expect(
        listAppointmentsPaged({ endAtIso: '2026-06-01T00:00:00.000Z' })
      ).rejects.toThrow(ValidationError);
    });

    it('accepts a 62-day range and rejects anything longer', async () => {
      const exact = await listAppointmentsPaged({
        startAtIso: '2026-06-01T00:00:00.000Z',
        endAtIso: '2026-08-02T00:00:00.000Z',
      });
      expect(exact.total).toBe(0);

      await expect(
        listAppointmentsPaged({
          startAtIso: '2026-06-01T00:00:00.000Z',
          endAtIso: '2026-08-02T00:01:00.000Z',
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  it('enriches the returned page with reminders', async () => {
    const { service, provider, patient } = await seedFixtures();
    const [firstId] = await seedSeries({
      count: 3,
      serviceId: service.id,
      providerId: provider.id,
      patientId: patient.id,
    });
    await insertReminder(firstId);

    const result = await listAppointmentsPaged({ page: 2, pageSize: 2 });

    expect(result.total).toBe(3);
    expect(result.appointments).toHaveLength(1);
    expect(result.appointments[0].id).toBe(firstId);
    expect(result.appointments[0].reminders).toHaveLength(1);
    expect(result.appointments[0].reminders[0]).toMatchObject({
      cadence: 'h24',
      status: 'sent',
      dryRun: false,
    });
  });
});
