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
import { createBusinessHour } from '@/lib/admin/business-hours';
import { createPatient } from '@/lib/admin/patients';
import { createProvider } from '@/lib/admin/providers';
import { createService } from '@/lib/admin/services';
import { getNoraView } from '../loader';

/**
 * Suite de datos del loader de Nora (Fase 2, tarea 2.3). Corre solo con
 * `npm run test:local` (SUPABASE_LOCAL=1 + supabase start).
 *
 * Verifica la persistencia idempotente de sugerencias `proposed`: el loader
 * puede escribir, pero NUNCA decide ni aplica. Cada aserción se comprueba
 * contra la tabla real `nora_reschedule_suggestions`.
 */
const d = localDbEnabled ? describe : describe.skip;

const MX_OFFSET_HOURS = 6;
const NOW = new Date('2026-10-15T18:00:00.000Z');

/** Instante UTC de una hora local en America/Mexico_City (UTC−6 fijo). */
function mx(year: number, month: number, day: number, hour = 0, minute = 0): string {
  return new Date(
    Date.UTC(year, month - 1, day, hour + MX_OFFSET_HOURS, minute)
  ).toISOString();
}

const DAY_RANGE = { preset: 'custom', from: '2026-10-01', to: '2026-10-01' };

d('getNoraView — persistencia de sugerencias (datos locales)', () => {
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

  async function readSuggestionRows(): Promise<Record<string, unknown>[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('nora_reschedule_suggestions')
      .select('*');
    if (error) throw new Error(error.message);
    return (data ?? []) as Record<string, unknown>[];
  }

  async function seed() {
    const patient = await createPatient({
      fullName: 'Juan Pérez',
      phoneE164: '+5215512345678',
    });
    const service = await createService({ name: 'Limpieza', durationMinutes: 60 });
    const provider = await createProvider({ name: 'Dra. Ana' });
    // Jueves 1 de octubre de 2026: ventana 09:00–12:00 local.
    await createBusinessHour({
      providerId: provider.id,
      dayOfWeek: 4,
      startTime: '09:00:00',
      endTime: '12:00:00',
    });
    const appointment = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: mx(2026, 10, 1, 10),
      endAt: mx(2026, 10, 1, 11),
      status: 'confirmed',
    });
    return { patient, service, provider, appointment };
  }

  it('persiste las sugerencias nuevas como proposed y las devuelve en la vista', async () => {
    const { appointment } = await seed();

    const view = await getNoraView(DAY_RANGE, NOW);
    const suggestions = view.suggestions ?? [];

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      appointmentId: appointment.id,
      suggestedStartAt: mx(2026, 10, 1, 9),
      suggestedEndAt: mx(2026, 10, 1, 10),
      reasonCode: 'gap_before',
      status: 'proposed',
    });

    const rows = await readSuggestionRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      appointment_id: appointment.id,
      status: 'proposed',
      reason_code: 'gap_before',
    });
    // La escritura de la propuesta no mueve la cita.
    expect(rows[0].decided_by).toBeNull();
    expect(rows[0].decided_at).toBeNull();
  });

  it('reejecutar el loader no duplica (appointment_id, suggested_start_at)', async () => {
    await seed();

    const first = await getNoraView(DAY_RANGE, NOW);
    const second = await getNoraView(DAY_RANGE, NOW);

    const rows = await readSuggestionRows();
    expect(rows).toHaveLength(1);
    const firstSuggestions = first.suggestions ?? [];
    const secondSuggestions = second.suggestions ?? [];
    expect(firstSuggestions).toHaveLength(1);
    expect(secondSuggestions).toHaveLength(1);
    expect(secondSuggestions[0].id).toBe(firstSuggestions[0].id);
  });

  it('estado vacío sin datos: metrics null, gaps y suggestions vacíos', async () => {
    const view = await getNoraView(DAY_RANGE, NOW);

    expect(view.metrics).toBeNull();
    expect(view.gaps).toEqual([]);
    expect(view.suggestions).toEqual([]);
    expect(view.isConfiguredButUnavailable).toBe(false);
  });

  it('TRIANGULATE: una cita que deja de ser movible no genera sugerencia nueva', async () => {
    const { appointment } = await seed();
    await getNoraView(DAY_RANGE, NOW);
    expect(await readSuggestionRows()).toHaveLength(1);

    // La cita pasa a un estado terminal: ya no es movible.
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', appointment.id);
    if (error) throw new Error(error.message);

    await getNoraView(DAY_RANGE, NOW);
    // No hay sugerencia nueva; la propuesta previa permanece sin decidir y no
    // se movió nada (el loader nunca decide ni aplica).
    const rows = await readSuggestionRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'proposed', decided_by: null });
    const { data: appointmentRow } = await getSupabaseAdmin()
      .from('appointments')
      .select('status, start_at')
      .eq('id', appointment.id)
      .single();
    expect(appointmentRow).toMatchObject({
      status: 'cancelled',
    });
    expect(new Date(appointmentRow?.start_at as string).toISOString()).toBe(
      mx(2026, 10, 1, 10)
    );
  });

  it('TRIANGULATE: un hueco que se llena entre corridas no duplica la clave original', async () => {
    const { patient, service, provider } = await seed();
    await getNoraView(DAY_RANGE, NOW);
    const originalKey = (await readSuggestionRows()).map(
      (row) => `${row.appointment_id}::${row.suggested_start_at}`
    );

    // Otra cita ocupa el hueco de 09:00–10:00 detectado en la primera corrida.
    await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: mx(2026, 10, 1, 9),
      endAt: mx(2026, 10, 1, 10),
      status: 'confirmed',
    });

    await getNoraView(DAY_RANGE, NOW);
    const rows = await readSuggestionRows();
    const keys = rows.map((row) => `${row.appointment_id}::${row.suggested_start_at}`);

    // La clave original no se duplica (idempotencia por appointment + inicio).
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of originalKey) {
      expect(keys.filter((k) => k === key)).toHaveLength(1);
    }
  });
});
