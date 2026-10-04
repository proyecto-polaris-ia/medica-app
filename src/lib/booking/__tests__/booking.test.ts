import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquireDbSuiteLock,
  applyLocalDbEnv,
  localDbEnabled,
  releaseDbSuiteLock,
  truncateAllTables,
} from '@/test-utils/local-db';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { createPatient } from '@/lib/admin/patients';
import { createProvider } from '@/lib/admin/providers';
import { createService } from '@/lib/admin/services';
import { bookAppointment } from '../booking';

/**
 * Suite contra Supabase local (ver openspec/changes/supabase-local-testing).
 * Corre solo con `npm run test:local` (SUPABASE_LOCAL=1 + supabase start);
 * con `npm run test` regular se omite.
 *
 * El booking público toca la agenda real: los pacientes, servicios y
 * proveedores se crean con funciones de dominio, y el resultado se comprueba
 * leyendo la fila persistida (no hay mock del query builder).
 */
const d = localDbEnabled ? describe : describe.skip;

// Las suites de datos se serializan con un advisory lock (ver
// src/test-utils/local-db.ts) porque vitest corre los archivos en paralelo
// y todas truncan el esquema `public`.

const START_AT = new Date('2026-09-10T14:00:00.000Z');
const END_AT = new Date('2026-09-10T14:30:00.000Z');

d('bookAppointment', () => {
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
   * Lectura cruda de las citas del proveedor: `bookAppointment` devuelve solo
   * `{ ok: true }` y no expone el id de la fila insertada.
   */
  async function readBookedRows(providerId: string): Promise<Record<string, unknown>[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('provider_id', providerId);
    if (error) throw new Error(error.message);
    return (data ?? []) as Record<string, unknown>[];
  }

  it('books an appointment without notes', async () => {
    const { patient, service, provider } = await seedFixtures();

    const result = await bookAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: START_AT,
      endAt: END_AT,
    });

    expect(result).toEqual({ ok: true });
    // Outcome observable en la BD: la cita quedó persistida con sus FKs.
    const rows = await readBookedRows(provider.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      patient_id: patient.id,
      service_id: service.id,
      provider_id: provider.id,
      status: 'requested',
      notes: null,
    });
    // timestamptz vuelve con offset `+00:00`: se normaliza a ISO.
    expect(new Date(rows[0].start_at as string).toISOString()).toBe(START_AT.toISOString());
    expect(new Date(rows[0].end_at as string).toISOString()).toBe(END_AT.toISOString());
  });

  it('trims notes before inserting', async () => {
    const { patient, service, provider } = await seedFixtures();

    await bookAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: START_AT,
      endAt: END_AT,
      notes: '  Prefiere mañana  ',
    });

    const rows = await readBookedRows(provider.id);
    expect(rows[0].notes).toBe('Prefiere mañana');
  });

  it('stores null for whitespace-only notes', async () => {
    const { patient, service, provider } = await seedFixtures();

    await bookAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: START_AT,
      endAt: END_AT,
      notes: '   ',
    });

    const rows = await readBookedRows(provider.id);
    expect(rows[0].notes).toBeNull();
  });

  it('returns a conflict when the slot overlaps an existing appointment (23P01)', async () => {
    const { patient, service, provider } = await seedFixtures();
    await bookAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: START_AT,
      endAt: END_AT,
    });

    // Solape real: la restricción EXCLUDE del proveedor dispara 23P01.
    const result = await bookAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: new Date('2026-09-10T14:15:00.000Z'),
      endAt: new Date('2026-09-10T14:45:00.000Z'),
    });

    expect(result).toEqual({
      type: 'conflict',
      message: 'This time slot is no longer available. Please select another time.',
    });
    // La cita original sigue siendo la única fila: no se persistió el solape.
    expect(await readBookedRows(provider.id)).toHaveLength(1);
  });

  it('retries transient failures and fails after three attempts', async () => {
    const { patient, service, provider } = await seedFixtures();
    // Falla de red real vista por el cliente de Supabase: se inyecta a nivel
    // `fetch` (no se mockea el query builder) y el reintento del dominio corre.
    const fetchSpy = vi.fn().mockRejectedValue(new Error('connection lost'));
    vi.stubGlobal('fetch', fetchSpy);

    try {
      await expect(
        bookAppointment({
          patientId: patient.id,
          serviceId: service.id,
          providerId: provider.id,
          startAt: START_AT,
          endAt: END_AT,
        })
      ).rejects.toThrow('Booking failed after 3 attempts');
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(await readBookedRows(provider.id)).toHaveLength(0);
  });
});
