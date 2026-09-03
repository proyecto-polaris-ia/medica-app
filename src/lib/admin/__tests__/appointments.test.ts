import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  createAppointment,
  deleteAppointment,
  listAppointments,
  updateAppointment,
} from '../appointments';
import { ConflictError } from '../errors';
import { ValidationError } from '../validate';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

const APPOINTMENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const SERVICE_ID = '550e8400-e29b-41d4-a716-446655440002';
const PROVIDER_ID = '550e8400-e29b-41d4-a716-446655440003';

describe('appointments service', () => {
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockOrder = vi.fn();
  const mockEq = vi.fn();
  const mockSingle = vi.fn();

  function buildQuery() {
    return {
      select: mockSelect.mockReturnThis(),
      insert: mockInsert.mockReturnThis(),
      update: mockUpdate.mockReturnThis(),
      delete: mockDelete.mockReturnThis(),
      order: mockOrder.mockReturnThis(),
      eq: mockEq.mockReturnThis(),
      single: mockSingle,
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue(buildQuery()),
    });
  });

  it('lists mapped appointments', async () => {
    mockOrder.mockResolvedValue({
      data: [{
        id: APPOINTMENT_ID,
        patient_id: PATIENT_ID,
        service_id: SERVICE_ID,
        provider_id: PROVIDER_ID,
        start_at: '2026-09-10T14:00:00.000Z',
        end_at: '2026-09-10T14:30:00.000Z',
        status: 'confirmed',
        created_at: '2026-09-01T10:00:00Z',
        updated_at: '2026-09-01T10:00:00Z',
      }],
      error: null,
    });

    const appointments = await listAppointments();

    expect(appointments).toEqual([{
      id: APPOINTMENT_ID,
      patientId: PATIENT_ID,
      serviceId: SERVICE_ID,
      providerId: PROVIDER_ID,
      startAt: '2026-09-10T14:00:00.000Z',
      endAt: '2026-09-10T14:30:00.000Z',
      status: 'confirmed',
      createdAt: '2026-09-01T10:00:00Z',
      updatedAt: '2026-09-01T10:00:00Z',
    }]);
  });

  it('creates an appointment', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: APPOINTMENT_ID,
        patient_id: PATIENT_ID,
        service_id: SERVICE_ID,
        provider_id: PROVIDER_ID,
        start_at: '2026-09-10T14:00:00.000Z',
        end_at: '2026-09-10T14:30:00.000Z',
        status: 'requested',
        created_at: '2026-09-01T10:00:00Z',
        updated_at: '2026-09-01T10:00:00Z',
      },
      error: null,
    });

    const appointment = await createAppointment({
      patientId: PATIENT_ID,
      serviceId: SERVICE_ID,
      providerId: PROVIDER_ID,
      startAt: '2026-09-10T14:00:00.000Z',
      endAt: '2026-09-10T14:30:00.000Z',
    });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      patient_id: PATIENT_ID,
      service_id: SERVICE_ID,
      provider_id: PROVIDER_ID,
      status: 'requested',
    }));
    expect(appointment.status).toBe('requested');
  });

  it('translates a 23P01 exclusion violation into ConflictError', async () => {
    mockSingle.mockRejectedValue({ code: '23P01', message: 'overlap' });

    await expect(createAppointment({
      serviceId: SERVICE_ID,
      providerId: PROVIDER_ID,
      startAt: '2026-09-10T14:00:00.000Z',
      endAt: '2026-09-10T14:30:00.000Z',
    })).rejects.toThrow(ConflictError);
  });

  it('rejects an end time before start time', async () => {
    await expect(createAppointment({
      serviceId: SERVICE_ID,
      providerId: PROVIDER_ID,
      startAt: '2026-09-10T14:30:00.000Z',
      endAt: '2026-09-10T14:00:00.000Z',
    })).rejects.toThrow(ValidationError);
  });

  it('updates an appointment', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: APPOINTMENT_ID,
        patient_id: PATIENT_ID,
        service_id: SERVICE_ID,
        provider_id: PROVIDER_ID,
        start_at: '2026-09-10T15:00:00.000Z',
        end_at: '2026-09-10T15:30:00.000Z',
        status: 'confirmed',
        created_at: '2026-09-01T10:00:00Z',
        updated_at: '2026-09-02T10:00:00Z',
      },
      error: null,
    });

    const appointment = await updateAppointment(APPOINTMENT_ID, {
      patientId: PATIENT_ID,
      serviceId: SERVICE_ID,
      providerId: PROVIDER_ID,
      startAt: '2026-09-10T15:00:00.000Z',
      endAt: '2026-09-10T15:30:00.000Z',
      status: 'confirmed',
    });

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'confirmed' }));
    expect(appointment.status).toBe('confirmed');
  });

  it('deletes an appointment', async () => {
    mockEq.mockResolvedValue({ error: null });

    await deleteAppointment(APPOINTMENT_ID);

    expect(mockEq).toHaveBeenCalledWith('id', APPOINTMENT_ID);
  });
});
