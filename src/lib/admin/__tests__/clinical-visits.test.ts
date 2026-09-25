import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  listClinicalVisits,
  getClinicalVisit,
  createClinicalVisit,
  updateClinicalVisit,
  deleteClinicalVisit,
} from '../clinical-visits';
import { NotFoundError } from '../errors';
import { ValidationError } from '../validate';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const VISIT_ID = '660e8400-e29b-41d4-a716-446655440000';

function buildQuery() {
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockEq = vi.fn();
  const mockOrder = vi.fn();
  const mockSingle = vi.fn();

  const query = {
    select: mockSelect.mockReturnThis(),
    insert: mockInsert.mockReturnThis(),
    update: mockUpdate.mockReturnThis(),
    delete: mockDelete.mockReturnThis(),
    eq: mockEq.mockReturnThis(),
    order: mockOrder.mockReturnThis(),
    single: mockSingle,
    _mocks: { mockSelect, mockInsert, mockUpdate, mockDelete, mockEq, mockOrder, mockSingle },
  };
  return query;
}

function visitRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VISIT_ID,
    patient_id: PATIENT_ID,
    appointment_id: null,
    provider_id: null,
    subjective: 'Dolor',
    objective: 'Caries',
    assessment: 'Valoración',
    plan: 'Tratamiento',
    treatment: 'Obturación',
    notes: 'Nota',
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    ...overrides,
  };
}

describe('clinical-visits service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('listClinicalVisits', () => {
    it('returns visits sorted by created_at descending', async () => {
      const query = buildQuery();
      query._mocks.mockOrder.mockResolvedValue({
        data: [
          visitRow({ id: 'visit-2', created_at: '2026-09-02T10:00:00Z' }),
          visitRow({ id: 'visit-1', created_at: '2026-09-01T10:00:00Z' }),
        ],
        error: null,
      });
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue(query),
      });

      const visits = await listClinicalVisits(PATIENT_ID);

      expect(visits.map((v) => v.id)).toEqual(['visit-2', 'visit-1']);
      expect(query._mocks.mockEq).toHaveBeenCalledWith('patient_id', PATIENT_ID);
      expect(query._mocks.mockOrder).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
    });

    it('throws ValidationError for an invalid patient id', async () => {
      await expect(listClinicalVisits('bad-id')).rejects.toThrow(ValidationError);
    });
  });

  describe('getClinicalVisit', () => {
    it('returns a mapped visit', async () => {
      const query = buildQuery();
      query._mocks.mockSingle.mockResolvedValue({
        data: visitRow(),
        error: null,
      });
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue(query),
      });

      const visit = await getClinicalVisit(PATIENT_ID, VISIT_ID);

      expect(visit.id).toBe(VISIT_ID);
      expect(visit.subjective).toBe('Dolor');
    });

    it('throws NotFoundError when the visit does not exist', async () => {
      const query = buildQuery();
      query._mocks.mockSingle.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue(query),
      });

      await expect(getClinicalVisit(PATIENT_ID, VISIT_ID)).rejects.toBeInstanceOf(
        NotFoundError
      );
    });
  });

  describe('createClinicalVisit', () => {
    it('persists a visit and returns the mapped row', async () => {
      const query = buildQuery();
      query._mocks.mockSingle.mockResolvedValue({
        data: visitRow(),
        error: null,
      });
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue(query),
      });

      const visit = await createClinicalVisit(PATIENT_ID, {
        subjective: 'Dolor',
      });

      expect(query._mocks.mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          patient_id: PATIENT_ID,
          subjective: 'Dolor',
        })
      );
      expect(visit.id).toBe(VISIT_ID);
    });

    it('throws ValidationError when subjective is empty', async () => {
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue(buildQuery()),
      });

      await expect(
        createClinicalVisit(PATIENT_ID, { subjective: '   ' })
      ).rejects.toThrow(ValidationError);
    });

    it('normalizes empty SOAP fields to null', async () => {
      const query = buildQuery();
      query._mocks.mockSingle.mockResolvedValue({
        data: visitRow(),
        error: null,
      });
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue(query),
      });

      await createClinicalVisit(PATIENT_ID, {
        subjective: 'Dolor',
        objective: '',
        assessment: '  ',
        plan: null,
        treatment: undefined,
        notes: '\t\n',
      });

      expect(query._mocks.mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          objective: null,
          assessment: null,
          plan: null,
          treatment: null,
          notes: null,
        })
      );
    });
  });

  describe('updateClinicalVisit', () => {
    it('updates allowed fields and returns the mapped row', async () => {
      const query = buildQuery();
      query._mocks.mockSingle.mockResolvedValue({
        data: visitRow({ subjective: 'Dolor persistente' }),
        error: null,
      });
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue(query),
      });

      const visit = await updateClinicalVisit(PATIENT_ID, VISIT_ID, {
        subjective: 'Dolor persistente',
      });

      expect(query._mocks.mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ subjective: 'Dolor persistente' })
      );
      expect(visit.subjective).toBe('Dolor persistente');
    });

    it('throws NotFoundError when the visit does not exist', async () => {
      const query = buildQuery();
      query._mocks.mockSingle.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue(query),
      });

      await expect(
        updateClinicalVisit(PATIENT_ID, VISIT_ID, { subjective: 'X' })
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('deleteClinicalVisit', () => {
    it('deletes the visit', async () => {
      const query = buildQuery();
      query._mocks.mockEq
        .mockReturnValueOnce(query)
        .mockResolvedValueOnce({ error: null });
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue(query),
      });

      await deleteClinicalVisit(PATIENT_ID, VISIT_ID);

      expect(query._mocks.mockEq).toHaveBeenCalledWith('id', VISIT_ID);
      expect(query._mocks.mockEq).toHaveBeenCalledWith(
        'patient_id',
        PATIENT_ID
      );
    });

    it('throws ValidationError for an invalid visit id', async () => {
      await expect(
        deleteClinicalVisit(PATIENT_ID, 'bad-id')
      ).rejects.toThrow(ValidationError);
    });
  });
});
