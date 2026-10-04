import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  acquireDbSuiteLock,
  applyLocalDbEnv,
  localDbEnabled,
  releaseDbSuiteLock,
  truncateAllTables,
} from '@/test-utils/local-db';
import { createPatient } from '../patients';
import {
  listClinicalVisits,
  getClinicalVisit,
  createClinicalVisit,
  updateClinicalVisit,
  deleteClinicalVisit,
} from '../clinical-visits';
import { NotFoundError } from '../errors';
import { ValidationError } from '../validate';

/**
 * Suite contra Supabase local (ver openspec/changes/supabase-local-testing).
 * Corre solo con `npm run test:local` (SUPABASE_LOCAL=1 + supabase start);
 * con `npm run test` regular se omite.
 */
const d = localDbEnabled ? describe : describe.skip;

// UUIDs válidos para casos de validación pura (no tocan la BD).
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const MISSING_VISIT_ID = '660e8400-e29b-41d4-a716-4466554400ff';

// Las suites de datos se serializan con un advisory lock (ver
// src/test-utils/local-db.ts) porque vitest corre los archivos en paralelo
// y todas truncan el esquema `public`.

async function seedPatient() {
  return createPatient({
    fullName: 'Juan Pérez',
    phoneE164: '+5215511111111',
  });
}

d('clinical-visits service', () => {
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

  describe('listClinicalVisits', () => {
    it('returns visits sorted by created_at descending', async () => {
      const patient = await seedPatient();
      const first = await createClinicalVisit(patient.id, { subjective: 'Dolor' });
      const second = await createClinicalVisit(patient.id, { subjective: 'Control' });

      const visits = await listClinicalVisits(patient.id);

      expect(visits.map((v) => v.id)).toEqual([second.id, first.id]);
      expect(visits[0].subjective).toBe('Control');
    });

    it('throws ValidationError for an invalid patient id', async () => {
      await expect(listClinicalVisits('bad-id')).rejects.toThrow(ValidationError);
    });
  });

  describe('getClinicalVisit', () => {
    it('returns a mapped visit', async () => {
      const patient = await seedPatient();
      const created = await createClinicalVisit(patient.id, { subjective: 'Dolor' });

      const visit = await getClinicalVisit(patient.id, created.id);

      expect(visit.id).toBe(created.id);
      expect(visit.patientId).toBe(patient.id);
      expect(visit.subjective).toBe('Dolor');
    });

    it('throws NotFoundError when the visit does not exist', async () => {
      const patient = await seedPatient();

      await expect(
        getClinicalVisit(patient.id, MISSING_VISIT_ID)
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('createClinicalVisit', () => {
    it('persists a visit and returns the mapped row', async () => {
      const patient = await seedPatient();

      const visit = await createClinicalVisit(patient.id, { subjective: 'Dolor' });

      expect(visit.patientId).toBe(patient.id);
      expect(visit.subjective).toBe('Dolor');
      // Outcome observable en la BD, no solo el mapeo en memoria.
      await expect(getClinicalVisit(patient.id, visit.id)).resolves.toEqual(visit);
    });

    it('throws ValidationError when subjective is empty', async () => {
      await expect(
        createClinicalVisit(PATIENT_ID, { subjective: '   ' })
      ).rejects.toThrow(ValidationError);
    });

    it('normalizes empty SOAP fields to null', async () => {
      const patient = await seedPatient();

      const visit = await createClinicalVisit(patient.id, {
        subjective: 'Dolor',
        objective: '',
        assessment: '  ',
        plan: null,
        treatment: undefined,
        notes: '\t\n',
      });

      expect(visit.objective).toBeNull();
      expect(visit.assessment).toBeNull();
      expect(visit.plan).toBeNull();
      expect(visit.treatment).toBeNull();
      expect(visit.notes).toBeNull();
      await expect(getClinicalVisit(patient.id, visit.id)).resolves.toEqual(visit);
    });
  });

  describe('updateClinicalVisit', () => {
    it('updates allowed fields and returns the mapped row', async () => {
      const patient = await seedPatient();
      const created = await createClinicalVisit(patient.id, { subjective: 'Dolor' });

      const visit = await updateClinicalVisit(patient.id, created.id, {
        subjective: 'Dolor persistente',
      });

      expect(visit.id).toBe(created.id);
      expect(visit.subjective).toBe('Dolor persistente');
      await expect(getClinicalVisit(patient.id, created.id)).resolves.toEqual(visit);
    });

    it('throws NotFoundError when the visit does not exist', async () => {
      const patient = await seedPatient();

      await expect(
        updateClinicalVisit(patient.id, MISSING_VISIT_ID, { subjective: 'X' })
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('deleteClinicalVisit', () => {
    it('deletes the visit', async () => {
      const patient = await seedPatient();
      const created = await createClinicalVisit(patient.id, { subjective: 'Dolor' });

      await deleteClinicalVisit(patient.id, created.id);

      await expect(
        getClinicalVisit(patient.id, created.id)
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws ValidationError for an invalid visit id', async () => {
      await expect(
        deleteClinicalVisit(PATIENT_ID, 'bad-id')
      ).rejects.toThrow(ValidationError);
    });
  });
});
