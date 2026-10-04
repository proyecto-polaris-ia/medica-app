import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  acquireDbSuiteLock,
  applyLocalDbEnv,
  localDbEnabled,
  releaseDbSuiteLock,
  truncateAllTables,
} from '@/test-utils/local-db';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { createPatient } from '../patients';
import { getMedicalHistory, upsertMedicalHistory } from '../medical-history';
import { ValidationError } from '../validate';
import type { MedicalHistoryInput } from '../types';

/**
 * Suite contra Supabase local (ver openspec/changes/supabase-local-testing).
 * Corre solo con `npm run test:local` (SUPABASE_LOCAL=1 + supabase start);
 * con `npm run test` regular se omite.
 */
const d = localDbEnabled ? describe : describe.skip;

// Las suites de datos se serializan con un advisory lock (ver
// src/test-utils/local-db.ts) porque vitest corre los archivos en paralelo
// y todas truncan el esquema `public`.

d('medical-history service', () => {
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

  async function seedPatient() {
    return createPatient({
      fullName: 'Juan Pérez',
      phoneE164: '+5215512345678',
    });
  }

  /** Lectura cruda: valida columnas que el mapper normaliza (p. ej. `source`). */
  async function readHistoryRow(
    patientId: string
  ): Promise<Record<string, unknown> | null> {
    const { data, error } = await getSupabaseAdmin()
      .from('patient_medical_history')
      .select('*')
      .eq('patient_id', patientId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Record<string, unknown> | null) ?? null;
  }

  describe('getMedicalHistory', () => {
    it('returns an existing medical history mapped to camelCase', async () => {
      const patient = await seedPatient();
      const input: MedicalHistoryInput = {
        allergies: ['penicillin'],
        systemicConditions: ['diabetes'],
        medications: ['metformin'],
        pregnancyStatus: 'no',
        coagulationDisorders: 'none',
        anticoagulants: null,
        surgeries: 'appendectomy',
        infectiousDiseases: null,
        smoking: 'never',
        alcohol: 'occasional',
        dentalHistory: 'brackets',
        oralHabits: ['nail_biting'],
        clinicalNotes: 'notes',
      };
      const stored = await upsertMedicalHistory(patient.id, input);

      const history = await getMedicalHistory(patient.id);

      expect(history).toMatchObject({
        patientId: patient.id,
        allergies: ['penicillin'],
        systemicConditions: ['diabetes'],
        medications: ['metformin'],
        pregnancyStatus: 'no',
        coagulationDisorders: 'none',
        anticoagulants: null,
        surgeries: 'appendectomy',
        infectiousDiseases: null,
        smoking: 'never',
        alcohol: 'occasional',
        dentalHistory: 'brackets',
        oralHabits: ['nail_biting'],
        clinicalNotes: 'notes',
        source: 'staff',
      });
      // timestamptz vuelve con offset y microsegundos: se compara el instante.
      expect(iso(history.createdAt)).toBe(iso(stored.createdAt));
      expect(iso(history.updatedAt)).toBe(iso(stored.updatedAt));
      const row = await readHistoryRow(patient.id);
      expect(row?.source).toBe('staff');
      expect(iso(row?.created_at as string)).toBe(iso(stored.createdAt));
    });

    it('maps the patient_autoreport provenance from the row', async () => {
      const patient = await seedPatient();
      await upsertMedicalHistory(patient.id, {
        allergies: ['penicillin'],
        source: 'patient_autoreport',
      });

      const history = await getMedicalHistory(patient.id);

      expect(history.source).toBe('patient_autoreport');
      const row = await readHistoryRow(patient.id);
      expect(row?.source).toBe('patient_autoreport');
    });

    it('defaults source to staff when the row omits it', async () => {
      const patient = await seedPatient();
      // Inserción cruda sin `source`: el default de la columna es 'staff'.
      const { error } = await getSupabaseAdmin()
        .from('patient_medical_history')
        .insert({ patient_id: patient.id });
      expect(error).toBeNull();

      const history = await getMedicalHistory(patient.id);

      expect(history.source).toBe('staff');
      expect(history.allergies).toEqual([]);
      const row = await readHistoryRow(patient.id);
      expect(row?.source).toBe('staff');
    });

    it('returns default empty values when no history exists', async () => {
      const patient = await seedPatient();

      const history = await getMedicalHistory(patient.id);

      expect(history).toEqual({
        patientId: patient.id,
        allergies: [],
        systemicConditions: [],
        medications: [],
        pregnancyStatus: null,
        coagulationDisorders: null,
        anticoagulants: null,
        surgeries: null,
        infectiousDiseases: null,
        smoking: null,
        alcohol: null,
        dentalHistory: null,
        oralHabits: [],
        clinicalNotes: null,
        source: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      // No se materializó ninguna fila para un paciente sin historia.
      expect(await readHistoryRow(patient.id)).toBeNull();
    });

    it('throws ValidationError for an invalid patient id', async () => {
      await expect(getMedicalHistory('bad-id')).rejects.toThrow(ValidationError);
    });
  });

  describe('upsertMedicalHistory', () => {
    it('replaces the medical history and returns the mapped row', async () => {
      const patient = await seedPatient();
      const first = await upsertMedicalHistory(patient.id, {
        allergies: ['penicillin'],
        clinicalNotes: 'primera nota',
      });

      const second = await upsertMedicalHistory(patient.id, {
        allergies: ['latex'],
      });

      expect(second.allergies).toEqual(['latex']);
      // Reemplazo completo: los campos omitidos vuelven a su default.
      expect(second.clinicalNotes).toBeNull();
      // ON CONFLICT (patient_id): una sola fila y `created_at` intacto.
      expect(iso(second.createdAt)).toBe(iso(first.createdAt));
      const { data, error } = await getSupabaseAdmin()
        .from('patient_medical_history')
        .select('patient_id, allergies, clinical_notes')
        .eq('patient_id', patient.id);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0]).toMatchObject({
        patient_id: patient.id,
        allergies: ['latex'],
        clinical_notes: null,
      });
    });

    it('always includes source, resetting provenance to staff when the input omits it', async () => {
      const patient = await seedPatient();
      await upsertMedicalHistory(patient.id, { source: 'patient_autoreport' });

      const history = await upsertMedicalHistory(patient.id, {
        allergies: ['latex'],
      });

      expect(history.source).toBe('staff');
      const row = await readHistoryRow(patient.id);
      expect(row?.source).toBe('staff');
    });

    it('sends patient_autoreport in the upsert payload when onboarding provides it', async () => {
      const patient = await seedPatient();

      const history = await upsertMedicalHistory(patient.id, {
        source: 'patient_autoreport',
      });

      expect(history.source).toBe('patient_autoreport');
      const row = await readHistoryRow(patient.id);
      expect(row).toMatchObject({
        patient_id: patient.id,
        source: 'patient_autoreport',
        allergies: [],
        systemic_conditions: [],
        medications: [],
        oral_habits: [],
      });
    });

    it('rejects an unknown source value', async () => {
      const patient = await seedPatient();

      await expect(
        upsertMedicalHistory(patient.id, {
          source: 'unknown' as 'staff',
        })
      ).rejects.toThrow(ValidationError);

      // La validación corre antes del upsert: no hay escritura.
      expect(await readHistoryRow(patient.id)).toBeNull();
    });

    it('validates pregnancy, smoking and alcohol statuses', async () => {
      const patient = await seedPatient();

      await expect(
        upsertMedicalHistory(patient.id, {
          pregnancyStatus: 'maybe' as 'yes',
        })
      ).rejects.toThrow(ValidationError);
      await expect(
        upsertMedicalHistory(patient.id, {
          smoking: 'sometimes' as 'never',
        })
      ).rejects.toThrow(ValidationError);
      await expect(
        upsertMedicalHistory(patient.id, {
          alcohol: 'daily' as 'never',
        })
      ).rejects.toThrow(ValidationError);

      expect(await readHistoryRow(patient.id)).toBeNull();
    });
  });
});
