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
import { applyAcceptedSuggestion, rejectSuggestion } from '../apply';

/**
 * Suite de datos de la ruta de aplicación de Nora (Fase 2, tarea 2.4). Corre
 * solo con `npm run test:local`.
 *
 * La única mutación de agenda permitida es `rescheduleAppointment`; aquí se
 * comprueba el ciclo `proposed → accepted → (applied | expired)` contra la
 * base real, incluido el rastro de auditoría en `appointments.notes`.
 */
const d = localDbEnabled ? describe : describe.skip;

const MX_OFFSET_HOURS = 6;
const DECIDED_BY = '00000000-0000-4000-8000-0000000000a1';
const OCCURRED_AT = new Date('2026-10-01T15:30:00.000Z'); // 09:30 clínica

function mx(year: number, month: number, day: number, hour = 0, minute = 0): string {
  return new Date(
    Date.UTC(year, month - 1, day, hour + MX_OFFSET_HOURS, minute)
  ).toISOString();
}

d('applyAcceptedSuggestion (datos locales)', () => {
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

  const supabase = () => getSupabaseAdmin();

  async function seed() {
    const patient = await createPatient({
      fullName: 'Juan Pérez',
      phoneE164: '+5215512345678',
    });
    const service = await createService({ name: 'Limpieza', durationMinutes: 60 });
    const provider = await createProvider({ name: 'Dra. Ana' });
    await createBusinessHour({
      providerId: provider.id,
      dayOfWeek: 4,
      startTime: '09:00:00',
      endTime: '12:00:00',
    });
    return { patient, service, provider };
  }

  /** Inserta una sugerencia persistida directamente (como la dejaría el loader). */
  async function insertSuggestion(input: {
    appointmentId: string;
    providerId: string;
    originalStartAt?: string;
    originalEndAt?: string;
    suggestedStartAt?: string;
    suggestedEndAt?: string;
    status?: string;
    reasonCode?: string;
  }): Promise<string> {
    const { data, error } = await supabase()
      .from('nora_reschedule_suggestions')
      .insert({
        appointment_id: input.appointmentId,
        provider_id: input.providerId,
        original_start_at: input.originalStartAt ?? mx(2026, 10, 1, 10),
        original_end_at: input.originalEndAt ?? mx(2026, 10, 1, 11),
        suggested_start_at: input.suggestedStartAt ?? mx(2026, 10, 1, 9),
        suggested_end_at: input.suggestedEndAt ?? mx(2026, 10, 1, 10),
        status: input.status ?? 'proposed',
        reason_code: input.reasonCode ?? 'gap_before',
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'insert failed');
    return data.id as string;
  }

  async function readSuggestion(id: string): Promise<Record<string, unknown>> {
    const { data, error } = await supabase()
      .from('nora_reschedule_suggestions')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) throw new Error(error?.message ?? 'not found');
    return data as Record<string, unknown>;
  }

  async function readAppointment(id: string): Promise<Record<string, unknown>> {
    const { data, error } = await supabase()
      .from('appointments')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) throw new Error(error?.message ?? 'not found');
    return data as Record<string, unknown>;
  }

  const iso = (value: unknown) => new Date(value as string).toISOString();

  it('aceptar aplica por rescheduleAppointment y marca la sugerencia como applied', async () => {
    const { patient, service, provider } = await seed();
    const appointment = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: mx(2026, 10, 1, 10),
      endAt: mx(2026, 10, 1, 11),
      status: 'confirmed',
    });
    const suggestionId = await insertSuggestion({
      appointmentId: appointment.id,
      providerId: provider.id,
    });

    const result = await applyAcceptedSuggestion({
      suggestionId,
      decidedBy: DECIDED_BY,
      occurredAt: OCCURRED_AT,
    });

    expect(result).toEqual({ ok: true, appointmentId: appointment.id });

    const row = await readAppointment(appointment.id);
    expect(iso(row.start_at)).toBe(mx(2026, 10, 1, 9));
    expect(iso(row.end_at)).toBe(mx(2026, 10, 1, 10));
    // El status de la cita permanece dentro de requested|pending|confirmed.
    expect(['requested', 'pending', 'confirmed']).toContain(row.status);

    const suggestion = await readSuggestion(suggestionId);
    expect(suggestion.status).toBe('applied');
    expect(suggestion.decided_by).toBe(DECIDED_BY);
    expect(iso(suggestion.decided_at)).toBe(OCCURRED_AT.toISOString());
  });

  it('anexa el rastro auditable con hora de la clínica sin sobrescribir notes', async () => {
    const { patient, service, provider } = await seed();
    const appointment = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: mx(2026, 10, 1, 10),
      endAt: mx(2026, 10, 1, 11),
      status: 'confirmed',
      notes: 'nota previa',
    });
    const suggestionId = await insertSuggestion({
      appointmentId: appointment.id,
      providerId: provider.id,
    });

    await applyAcceptedSuggestion({
      suggestionId,
      decidedBy: DECIDED_BY,
      occurredAt: OCCURRED_AT,
    });

    const row = await readAppointment(appointment.id);
    const notes = row.notes as string;
    expect(notes.startsWith('nota previa')).toBe(true);
    expect(notes).toContain('[2026-10-01 09:30 America/Mexico_City]');
    expect(notes).toContain(`Reacomodo aplicado (sugerencia ${suggestionId})`);
    expect(notes).toContain('10:00 → 09:00');
  });

  it('un conflicto 23P01 no aplica, no sobrescribe y deja la sugerencia sin applied', async () => {
    const { patient, service, provider } = await seed();
    const appointment = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: mx(2026, 10, 1, 10),
      endAt: mx(2026, 10, 1, 11),
      status: 'confirmed',
    });
    // Otra cita ya ocupa el hueco destino 09:00–10:00.
    const occupier = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: mx(2026, 10, 1, 9),
      endAt: mx(2026, 10, 1, 10),
      status: 'confirmed',
    });
    const suggestionId = await insertSuggestion({
      appointmentId: appointment.id,
      providerId: provider.id,
    });

    const result = await applyAcceptedSuggestion({
      suggestionId,
      decidedBy: DECIDED_BY,
      occurredAt: OCCURRED_AT,
    });

    expect(result).toEqual({ ok: false, reason: 'conflict' });
    // Ni la cita original ni la que ocupa el horario se tocan.
    const original = await readAppointment(appointment.id);
    const occupant = await readAppointment(occupier.id);
    expect(iso(original.start_at)).toBe(mx(2026, 10, 1, 10));
    expect(iso(occupant.start_at)).toBe(mx(2026, 10, 1, 9));
    expect((await readSuggestion(suggestionId)).status).toBe('accepted');
  });

  it('una cita movida desde la propuesta expira y no se aplica', async () => {
    const { patient, service, provider } = await seed();
    const appointment = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: mx(2026, 10, 1, 10),
      endAt: mx(2026, 10, 1, 11),
      status: 'confirmed',
    });
    const suggestionId = await insertSuggestion({
      appointmentId: appointment.id,
      providerId: provider.id,
    });

    // La cita se mueve por otra vía después de generarse la propuesta.
    const { error } = await supabase()
      .from('appointments')
      .update({ start_at: mx(2026, 10, 1, 14), end_at: mx(2026, 10, 1, 15) })
      .eq('id', appointment.id);
    if (error) throw new Error(error.message);

    const result = await applyAcceptedSuggestion({
      suggestionId,
      decidedBy: DECIDED_BY,
      occurredAt: OCCURRED_AT,
    });

    expect(result).toEqual({ ok: false, reason: 'expired' });
    expect((await readSuggestion(suggestionId)).status).toBe('expired');
    // No se aplicó una reprogramación sobre el horario nuevo.
    const row = await readAppointment(appointment.id);
    expect(iso(row.start_at)).toBe(mx(2026, 10, 1, 14));
  });

  it('una sugerencia expirada no se aplica', async () => {
    const { patient, service, provider } = await seed();
    const appointment = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: mx(2026, 10, 1, 10),
      endAt: mx(2026, 10, 1, 11),
      status: 'confirmed',
    });
    const suggestionId = await insertSuggestion({
      appointmentId: appointment.id,
      providerId: provider.id,
      status: 'expired',
    });

    const result = await applyAcceptedSuggestion({
      suggestionId,
      decidedBy: DECIDED_BY,
      occurredAt: OCCURRED_AT,
    });

    expect(result).toEqual({ ok: false, reason: 'already_decided' });
    expect((await readSuggestion(suggestionId)).status).toBe('expired');
    expect(iso((await readAppointment(appointment.id)).start_at)).toBe(
      mx(2026, 10, 1, 10)
    );
  });

  it('una cita cancelada no se mueve: invalid_status', async () => {
    const { patient, service, provider } = await seed();
    const appointment = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: mx(2026, 10, 1, 10),
      endAt: mx(2026, 10, 1, 11),
      status: 'confirmed',
    });
    const suggestionId = await insertSuggestion({
      appointmentId: appointment.id,
      providerId: provider.id,
    });
    await supabase()
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', appointment.id);

    const result = await applyAcceptedSuggestion({
      suggestionId,
      decidedBy: DECIDED_BY,
      occurredAt: OCCURRED_AT,
    });

    expect(result).toEqual({ ok: false, reason: 'invalid_status' });
    expect((await readSuggestion(suggestionId)).status).toBe('accepted');
  });

  it('TRIANGULATE: doble aceptación concurrente, solo una gana', async () => {
    const { patient, service, provider } = await seed();
    const appointment = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: mx(2026, 10, 1, 10),
      endAt: mx(2026, 10, 1, 11),
      status: 'confirmed',
    });
    const suggestionId = await insertSuggestion({
      appointmentId: appointment.id,
      providerId: provider.id,
    });

    const results = await Promise.all([
      applyAcceptedSuggestion({ suggestionId, decidedBy: DECIDED_BY, occurredAt: OCCURRED_AT }),
      applyAcceptedSuggestion({ suggestionId, decidedBy: DECIDED_BY, occurredAt: OCCURRED_AT }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect((await readSuggestion(suggestionId)).status).toBe('applied');
    expect(iso((await readAppointment(appointment.id)).start_at)).toBe(
      mx(2026, 10, 1, 9)
    );
  });

  it('TRIANGULATE: una sugerencia inexistente reporta not_found', async () => {
    await seed();
    const result = await applyAcceptedSuggestion({
      suggestionId: '00000000-0000-4000-8000-00000000dead',
      decidedBy: DECIDED_BY,
      occurredAt: OCCURRED_AT,
    });
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('rechazar registra la decisión sin mover la cita', async () => {
    const { patient, service, provider } = await seed();
    const appointment = await createAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: mx(2026, 10, 1, 10),
      endAt: mx(2026, 10, 1, 11),
      status: 'confirmed',
    });
    const suggestionId = await insertSuggestion({
      appointmentId: appointment.id,
      providerId: provider.id,
    });

    const result = await rejectSuggestion({
      suggestionId,
      decidedBy: DECIDED_BY,
      decidedAt: OCCURRED_AT,
    });

    expect(result).toEqual({ ok: true });
    const suggestion = await readSuggestion(suggestionId);
    expect(suggestion.status).toBe('rejected');
    expect(suggestion.decided_by).toBe(DECIDED_BY);
    expect(iso((await readAppointment(appointment.id)).start_at)).toBe(
      mx(2026, 10, 1, 10)
    );
  });
});
