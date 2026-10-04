import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
import { rescheduleAppointment } from '../reschedule';

/**
 * Suite contra Supabase local (ver openspec/changes/supabase-local-testing).
 * Corre solo con `npm run test:local` (SUPABASE_LOCAL=1 + supabase start);
 * con `npm run test` regular se omite.
 *
 * Reprogramar es una operación sobre la agenda real: las citas se crean con
 * funciones de dominio y cada resultado se comprueba leyendo la fila
 * persistida (sin mock del query builder).
 */
const d = localDbEnabled ? describe : describe.skip;

// Las suites de datos se serializan con un advisory lock (ver
// src/test-utils/local-db.ts) porque vitest corre los archivos en paralelo
// y todas truncan el esquema `public`.

const CURRENT_START = new Date('2026-09-15T20:00:00.000Z');
const CURRENT_END = new Date('2026-09-15T21:00:00.000Z');
const NEW_START = new Date('2026-09-15T21:00:00.000Z');
const NEW_END = new Date('2026-09-15T22:00:00.000Z');

d('rescheduleAppointment', () => {
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
    const service = await createService({ name: 'Limpieza', durationMinutes: 60 });
    const provider = await createProvider({ name: 'Dra. Ana' });
    return { patient, service, provider };
  }

  /** Lectura cruda de la fila: `reschedule` no expone el resto de columnas. */
  async function readRow(id: string): Promise<Record<string, unknown> | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Record<string, unknown> | null) ?? null;
  }

  async function countAppointments(): Promise<number> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('appointments').select('id');
    if (error) throw new Error(error.message);
    return (data ?? []).length;
  }

  it('updates the existing appointment without inserting a new row', async () => {
    const { patient, service, provider } = await seedFixtures();
    const created = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: CURRENT_START.toISOString(),
      endAt: CURRENT_END.toISOString(),
      status: 'requested',
      notes: 'original notes',
    });

    const result = await rescheduleAppointment({
      appointmentId: created.id,
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      newStartAt: NEW_START,
      newEndAt: NEW_END,
    });

    expect(result).toMatchObject({ ok: true });
    if (!('ok' in result)) throw new Error('expected an ok result');
    expect(result.appointment.id).toBe(created.id);
    expect(iso(result.appointment.startAt)).toBe(NEW_START.toISOString());
    expect(iso(result.appointment.endAt)).toBe(NEW_END.toISOString());

    // Outcome observable en la BD: misma fila, intervalo nuevo, notas intactas.
    const row = await readRow(created.id);
    expect(row).not.toBeNull();
    expect(iso(row?.start_at as string)).toBe(NEW_START.toISOString());
    expect(iso(row?.end_at as string)).toBe(NEW_END.toISOString());
    // Sin `notes`, se conserva la nota original.
    expect(row?.notes).toBe('original notes');
    expect(await countAppointments()).toBe(1);
  });

  it('finds the original appointment by exact interval when no id is provided', async () => {
    const { patient, service, provider } = await seedFixtures();
    const created = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: CURRENT_START.toISOString(),
      endAt: CURRENT_END.toISOString(),
      status: 'requested',
    });

    const result = await rescheduleAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      currentStartAt: CURRENT_START,
      currentEndAt: CURRENT_END,
      newStartAt: NEW_START,
      newEndAt: NEW_END,
    });

    expect(result).toMatchObject({ ok: true });
    const row = await readRow(created.id);
    expect(iso(row?.start_at as string)).toBe(NEW_START.toISOString());
    expect(await countAppointments()).toBe(1);
  });

  it('does not create a replacement when the original appointment is missing', async () => {
    const { patient, service, provider } = await seedFixtures();

    await expect(
      rescheduleAppointment({
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        currentStartAt: CURRENT_START,
        currentEndAt: CURRENT_END,
        newStartAt: NEW_START,
        newEndAt: NEW_END,
      })
    ).resolves.toEqual({
      type: 'not_found',
      message: 'Original appointment was not found.',
    });

    // Nada se persistió: no hay cita de reemplazo.
    expect(await countAppointments()).toBe(0);
  });

  it('returns a booking conflict when the new interval overlaps another appointment', async () => {
    const { patient, service, provider } = await seedFixtures();
    const created = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: CURRENT_START.toISOString(),
      endAt: CURRENT_END.toISOString(),
      status: 'requested',
    });
    // La cita de las 21:00 ocupa el hueco destino; la restricción EXCLUDE real
    // dispara 23P01 al intentar mover la primera encima.
    await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: NEW_START.toISOString(),
      endAt: NEW_END.toISOString(),
      status: 'requested',
    });

    await expect(
      rescheduleAppointment({
        appointmentId: created.id,
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        newStartAt: NEW_START,
        newEndAt: NEW_END,
      })
    ).resolves.toEqual({
      type: 'conflict',
      message: 'This time slot is no longer available. Please select another time.',
    });

    // El conflicto no movió la cita original.
    const row = await readRow(created.id);
    expect(iso(row?.start_at as string)).toBe(CURRENT_START.toISOString());
    expect(iso(row?.end_at as string)).toBe(CURRENT_END.toISOString());
    expect(await countAppointments()).toBe(2);
  });

  it('refuses to reschedule a cancelled appointment', async () => {
    const { patient, service, provider } = await seedFixtures();
    const created = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: CURRENT_START.toISOString(),
      endAt: CURRENT_END.toISOString(),
      status: 'cancelled',
    });

    await expect(
      rescheduleAppointment({
        appointmentId: created.id,
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        newStartAt: NEW_START,
        newEndAt: NEW_END,
      })
    ).resolves.toEqual({
      type: 'invalid_status',
      message: 'Appointment with status cancelled cannot be rescheduled.',
    });

    const row = await readRow(created.id);
    expect(iso(row?.start_at as string)).toBe(CURRENT_START.toISOString());
  });

  it('rejects a new end time that is not after the new start time', async () => {
    const { patient, service, provider } = await seedFixtures();

    await expect(
      rescheduleAppointment({
        appointmentId: '00000000-0000-4000-8000-00000000dead',
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        newStartAt: NEW_END,
        newEndAt: NEW_START,
      })
    ).resolves.toEqual({
      type: 'not_found',
      message: 'The new end time must be after the new start time.',
    });

    expect(await countAppointments()).toBe(0);
  });
});
