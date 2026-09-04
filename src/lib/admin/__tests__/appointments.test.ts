import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  createAppointment,
  deleteAppointment,
  listAppointments,
  listByProviderRange,
  listUpcomingByProvider,
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
  const mockGte = vi.fn();
  const mockGt = vi.fn();
  const mockLt = vi.fn();
  const mockLimit = vi.fn();
  const mockSingle = vi.fn();

  function buildQuery() {
    return {
      select: mockSelect.mockReturnThis(),
      insert: mockInsert.mockReturnThis(),
      update: mockUpdate.mockReturnThis(),
      delete: mockDelete.mockReturnThis(),
      order: mockOrder.mockReturnThis(),
      eq: mockEq.mockReturnThis(),
      gte: mockGte.mockReturnThis(),
      gt: mockGt.mockReturnThis(),
      lt: mockLt.mockReturnThis(),
      limit: mockLimit.mockReturnThis(),
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

  describe('listUpcomingByProvider', () => {
    it('returns future appointments sorted ascending with patient/service names', async () => {
      mockLimit.mockResolvedValue({
        data: [
          {
            id: '660e8400-e29b-41d4-a716-446655440001',
            patient_id: PATIENT_ID,
            service_id: SERVICE_ID,
            provider_id: PROVIDER_ID,
            start_at: '2026-09-05T14:00:00.000Z',
            end_at: '2026-09-05T14:30:00.000Z',
            status: 'confirmed',
            created_at: '2026-09-01T10:00:00Z',
            updated_at: '2026-09-01T10:00:00Z',
            patients: { id: PATIENT_ID, full_name: 'Juan Pérez' },
            services: { id: SERVICE_ID, name: 'Limpieza' },
          },
          {
            id: '660e8400-e29b-41d4-a716-446655440000',
            patient_id: PATIENT_ID,
            service_id: SERVICE_ID,
            provider_id: PROVIDER_ID,
            start_at: '2026-09-10T14:00:00.000Z',
            end_at: '2026-09-10T14:30:00.000Z',
            status: 'confirmed',
            created_at: '2026-09-01T10:00:00Z',
            updated_at: '2026-09-01T10:00:00Z',
            patients: { id: PATIENT_ID, full_name: 'Juan Pérez' },
            services: { id: SERVICE_ID, name: 'Limpieza' },
          },
        ],
        error: null,
      });

      const now = new Date('2026-09-01T10:00:00.000Z');
      const appointments = await listUpcomingByProvider(PROVIDER_ID, now);

      expect(mockGt).toHaveBeenCalledWith('start_at', now.toISOString());
      expect(mockOrder).toHaveBeenCalledWith('start_at', { ascending: true });
      expect(appointments).toHaveLength(2);
      expect(appointments[0].startAt).toBe('2026-09-05T14:00:00.000Z');
      expect(appointments[1].startAt).toBe('2026-09-10T14:00:00.000Z');
      expect(appointments[0].patientName).toBe('Juan Pérez');
      expect(appointments[0].serviceName).toBe('Limpieza');
    });

    it('respects a custom limit', async () => {
      mockLimit.mockResolvedValue({ data: [], error: null });

      await listUpcomingByProvider(PROVIDER_ID, new Date(), 3);

      expect(mockLimit).toHaveBeenCalledWith(3);
    });
  });

  describe('listByProviderRange', () => {
    it('returns appointments within the half-open range and maps embeds', async () => {
      mockOrder.mockResolvedValue({
        data: [
          {
            id: '660e8400-e29b-41d4-a716-446655440002',
            patient_id: PATIENT_ID,
            service_id: SERVICE_ID,
            provider_id: PROVIDER_ID,
            start_at: '2026-09-03T14:00:00.000Z',
            end_at: '2026-09-03T14:30:00.000Z',
            status: 'attended',
            created_at: '2026-09-01T10:00:00Z',
            updated_at: '2026-09-01T10:00:00Z',
            patients: { id: PATIENT_ID, full_name: 'Juan Pérez' },
            services: { id: SERVICE_ID, name: 'Limpieza' },
          },
        ],
        error: null,
      });

      const start = new Date('2026-09-03T06:00:00.000Z');
      const end = new Date('2026-09-04T06:00:00.000Z');
      const appointments = await listByProviderRange(PROVIDER_ID, start, end);

      expect(mockGte).toHaveBeenCalledWith('start_at', start.toISOString());
      expect(mockLt).toHaveBeenCalledWith('start_at', end.toISOString());
      expect(appointments).toHaveLength(1);
      expect(appointments[0].status).toBe('attended');
    });
  });
});
