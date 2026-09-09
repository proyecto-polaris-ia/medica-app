import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { rescheduleAppointment } from '../reschedule';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

const APPOINTMENT_ID = 'appt-1';
const PATIENT_ID = 'pat-1';
const SERVICE_ID = 'svc-1';
const PROVIDER_ID = 'doc-1';
const CURRENT_START = new Date('2026-09-15T20:00:00.000Z');
const CURRENT_END = new Date('2026-09-15T21:00:00.000Z');
const NEW_START = new Date('2026-09-15T21:00:00.000Z');
const NEW_END = new Date('2026-09-15T22:00:00.000Z');

const existingRow = {
  id: APPOINTMENT_ID,
  patient_id: PATIENT_ID,
  service_id: SERVICE_ID,
  provider_id: PROVIDER_ID,
  start_at: CURRENT_START.toISOString(),
  end_at: CURRENT_END.toISOString(),
  status: 'requested',
  notes: 'original notes',
};

const updatedRow = {
  ...existingRow,
  start_at: NEW_START.toISOString(),
  end_at: NEW_END.toISOString(),
};

describe('rescheduleAppointment', () => {
  const from = vi.fn();
  const select = vi.fn();
  const match = vi.fn();
  const eq = vi.fn();
  const maybeSingle = vi.fn();
  const update = vi.fn();
  const single = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    const query = { select, match, eq, maybeSingle, update, single };
    select.mockReturnValue(query);
    match.mockReturnValue(query);
    eq.mockReturnValue(query);
    update.mockReturnValue(query);
    from.mockReturnValue(query);
    maybeSingle.mockResolvedValue({ data: existingRow, error: null });
    single.mockResolvedValue({ data: updatedRow, error: null });
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({ from });
  });

  it('updates the existing appointment without inserting a new row', async () => {
    const result = await rescheduleAppointment({
      appointmentId: APPOINTMENT_ID,
      patientId: PATIENT_ID,
      serviceId: SERVICE_ID,
      providerId: PROVIDER_ID,
      newStartAt: NEW_START,
      newEndAt: NEW_END,
    });

    expect(from).toHaveBeenCalledWith('appointments');
    expect(update).toHaveBeenCalledWith({
      start_at: NEW_START.toISOString(),
      end_at: NEW_END.toISOString(),
      notes: 'original notes',
    });
    expect(result).toMatchObject({
      ok: true,
      appointment: { id: APPOINTMENT_ID, startAt: NEW_START.toISOString() },
    });
  });

  it('finds the original appointment by exact interval when no id is provided', async () => {
    await rescheduleAppointment({
      patientId: PATIENT_ID,
      serviceId: SERVICE_ID,
      providerId: PROVIDER_ID,
      currentStartAt: CURRENT_START,
      currentEndAt: CURRENT_END,
      newStartAt: NEW_START,
      newEndAt: NEW_END,
    });

    expect(match).toHaveBeenCalledWith({
      start_at: CURRENT_START.toISOString(),
      end_at: CURRENT_END.toISOString(),
    });
  });

  it('does not create a replacement when the original appointment is missing', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(rescheduleAppointment({
      patientId: PATIENT_ID,
      serviceId: SERVICE_ID,
      providerId: PROVIDER_ID,
      currentStartAt: CURRENT_START,
      currentEndAt: CURRENT_END,
      newStartAt: NEW_START,
      newEndAt: NEW_END,
    })).resolves.toEqual({ type: 'not_found', message: 'Original appointment was not found.' });
    expect(update).not.toHaveBeenCalled();
  });

  it('returns a booking conflict when the new interval overlaps another appointment', async () => {
    single.mockResolvedValue({ data: null, error: { code: '23P01', message: 'overlap' } });

    await expect(rescheduleAppointment({
      appointmentId: APPOINTMENT_ID,
      patientId: PATIENT_ID,
      serviceId: SERVICE_ID,
      providerId: PROVIDER_ID,
      newStartAt: NEW_START,
      newEndAt: NEW_END,
    })).resolves.toEqual({
      type: 'conflict',
      message: 'This time slot is no longer available. Please select another time.',
    });
  });
});
