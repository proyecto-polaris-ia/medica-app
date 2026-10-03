import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { transitionAppointmentFromReminder } from '../appointment-status';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

const APPOINTMENT_ID = '990e8400-e29b-41d4-a716-446655440000';
const OCCURRED_AT = new Date('2026-09-05T18:30:00.000Z'); // 12:30 America/Mexico_City

type QueryResult = { data: unknown; error: { message?: string; code?: string } | null };

interface MockStatusQuery {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  _write: QueryResult;
  _reads: QueryResult[];
  _updates: Record<string, unknown>[];
}

function buildStatusQuery(): MockStatusQuery {
  const query: MockStatusQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    update: vi.fn(),
    maybeSingle: vi.fn(),
    _write: { data: [], error: null },
    _reads: [],
    _updates: [],
  };
  query.update.mockImplementation((payload: Record<string, unknown>) => {
    query._updates.push(payload);
    return query;
  });
  query.maybeSingle.mockImplementation(() =>
    Promise.resolve(query._reads.shift() ?? { data: null, error: null })
  );
  Object.defineProperty(query, 'then', {
    get() {
      return (onFulfilled: (value: QueryResult) => unknown) =>
        Promise.resolve(query._write).then(onFulfilled);
    },
  });
  return query;
}

function mockAdmin(query: MockStatusQuery) {
  (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
    from: vi.fn(() => query),
  });
}

const NOT_FOUND: QueryResult = { data: null, error: null };
function readRow(status: string, notes: string | null = null): QueryResult {
  return { data: { id: APPOINTMENT_ID, status, notes }, error: null };
}
function updatedRow(): QueryResult {
  return { data: [{ id: APPOINTMENT_ID }], error: null };
}
function noRowsUpdated(): QueryResult {
  return { data: [], error: null };
}

/**
 * Fase 2 — Transición guardada de estado (design.md §4). Update status-only
 * (no `updateAppointment`, que es full-row), guardado por estado de origen.
 */
describe('transitionAppointmentFromReminder', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('cita inexistente → not_found sin escribir', async () => {
    const query = buildStatusQuery();
    query._reads = [NOT_FOUND];
    mockAdmin(query);

    const result = await transitionAppointmentFromReminder({
      appointmentId: APPOINTMENT_ID,
      to: 'confirmed',
      occurredAt: OCCURRED_AT,
    });

    expect(result).toEqual({ ok: false, reason: 'not_found' });
    expect(query.update).not.toHaveBeenCalled();
  });

  it('estado terminal → ineligible_status sin escribir', async () => {
    for (const status of ['cancelled', 'rescheduled', 'no_show', 'attended']) {
      vi.resetAllMocks();
      const query = buildStatusQuery();
      query._reads = [readRow(status)];
      mockAdmin(query);

      const result = await transitionAppointmentFromReminder({
        appointmentId: APPOINTMENT_ID,
        to: 'confirmed',
        occurredAt: OCCURRED_AT,
      });

      expect(result, status).toEqual({ ok: false, reason: 'ineligible_status' });
      expect(query.update, status).not.toHaveBeenCalled();
    }
  });

  it('requested → confirmed con update guardado por estado origen', async () => {
    const query = buildStatusQuery();
    query._reads = [readRow('requested')];
    query._write = updatedRow();
    mockAdmin(query);

    const result = await transitionAppointmentFromReminder({
      appointmentId: APPOINTMENT_ID,
      to: 'confirmed',
      occurredAt: OCCURRED_AT,
    });

    expect(result).toEqual({ ok: true, status: 'confirmed' });
    expect(query.update).toHaveBeenCalledTimes(1);
    expect(query._updates[0]).toEqual({
      status: 'confirmed',
      notes: '[2026-09-05 12:30 America/Mexico_City] Confirmada desde recordatorio (quién: sistema/recordatorio)',
    });
    expect(query.eq).toHaveBeenCalledWith('id', APPOINTMENT_ID);
    expect(query.in).toHaveBeenCalledWith('status', ['requested', 'pending']);
  });

  it('pending → confirmed', async () => {
    const query = buildStatusQuery();
    query._reads = [readRow('pending')];
    query._write = updatedRow();
    mockAdmin(query);

    const result = await transitionAppointmentFromReminder({
      appointmentId: APPOINTMENT_ID,
      to: 'confirmed',
      occurredAt: OCCURRED_AT,
    });

    expect(result).toEqual({ ok: true, status: 'confirmed' });
  });

  it('confirmed → cancelled anexa el motivo y usa el set de cancelación', async () => {
    const query = buildStatusQuery();
    query._reads = [readRow('confirmed', 'nota previa')];
    query._write = updatedRow();
    mockAdmin(query);

    const result = await transitionAppointmentFromReminder({
      appointmentId: APPOINTMENT_ID,
      to: 'cancelled',
      reasonText: 'no alcanzo, trabajo',
      occurredAt: OCCURRED_AT,
    });

    expect(result).toEqual({ ok: true, status: 'cancelled' });
    expect(query._updates[0]).toEqual({
      status: 'cancelled',
      notes:
        'nota previa | [2026-09-05 12:30 America/Mexico_City] Cancelada desde recordatorio (quién: sistema/recordatorio). Motivo: no alcanzo, trabajo',
    });
    expect(query.in).toHaveBeenCalledWith('status', ['requested', 'pending', 'confirmed']);
  });

  it('requested → cancelled', async () => {
    const query = buildStatusQuery();
    query._reads = [readRow('requested')];
    query._write = updatedRow();
    mockAdmin(query);

    const result = await transitionAppointmentFromReminder({
      appointmentId: APPOINTMENT_ID,
      to: 'cancelled',
      occurredAt: OCCURRED_AT,
    });

    expect(result).toEqual({ ok: true, status: 'cancelled' });
  });

  it('0 filas afectadas (carrera) → relee y devuelve ineligible_status', async () => {
    const query = buildStatusQuery();
    query._reads = [readRow('requested'), readRow('confirmed')];
    query._write = noRowsUpdated();
    mockAdmin(query);

    const result = await transitionAppointmentFromReminder({
      appointmentId: APPOINTMENT_ID,
      to: 'confirmed',
      occurredAt: OCCURRED_AT,
    });

    expect(result).toEqual({ ok: false, reason: 'ineligible_status' });
    expect(query.maybeSingle).toHaveBeenCalledTimes(2);
  });

  it('no permite confirmar una cita ya confirmada', async () => {
    const query = buildStatusQuery();
    query._reads = [readRow('confirmed')];
    mockAdmin(query);

    const result = await transitionAppointmentFromReminder({
      appointmentId: APPOINTMENT_ID,
      to: 'confirmed',
      occurredAt: OCCURRED_AT,
    });

    expect(result).toEqual({ ok: false, reason: 'ineligible_status' });
    expect(query.update).not.toHaveBeenCalled();
  });
});
