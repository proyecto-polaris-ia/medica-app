import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  acquireDbSuiteLock,
  applyLocalDbEnv,
  localDbEnabled,
  releaseDbSuiteLock,
  truncateAllTables,
} from '@/test-utils/local-db';
import {
  createPatient,
  deletePatient,
  getPatient,
  listPatients,
  searchPatients,
  updatePatient,
  updatePatientEmail,
} from '../patients';
import { ValidationError } from '../validate';
import { ConflictError } from '../errors';

/**
 * Suite contra Supabase local (ver openspec/changes/supabase-local-testing).
 * Corre solo con `npm run test:local` (SUPABASE_LOCAL=1 + supabase start);
 * con `npm run test` regular se omite.
 */
const d = localDbEnabled ? describe : describe.skip;

// Las suites de datos se serializan con un advisory lock (ver
// src/test-utils/local-db.ts) porque vitest corre los archivos en paralelo
// y todas truncan el esquema `public`.

// UUID válido para casos de validación pura (no llegan a la BD).
const VALID_ID = '550e8400-e29b-41d4-a716-446655440000';
const MISSING_ID = '550e8400-e29b-41d4-a716-4466554400ff';

d('patients service', () => {
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

  describe('listPatients', () => {
    it('returns mapped patients ordered by created_at desc', async () => {
      const first = await createPatient({
        fullName: 'María García',
        phoneE164: '+5215512345678',
        notes: 'Nota',
      });
      const second = await createPatient({
        fullName: 'Pedro López',
        phoneE164: '+5215599999999',
      });

      const patients = await listPatients();

      expect(patients.map((patient) => patient.id)).toEqual([second.id, first.id]);
      const stored = patients.find((patient) => patient.id === first.id);
      expect(stored).toMatchObject({
        id: first.id,
        fullName: 'María García',
        phoneE164: '+5215512345678',
        email: null,
        notes: 'Nota',
        birthDate: null,
        sex: null,
        address: null,
        occupation: null,
        referralSource: null,
        secondaryPhone: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        emergencyContactRelationship: null,
      });
      // timestamptz vuelve con offset `+00:00`: se normaliza a ISO.
      expect(iso(stored!.createdAt)).toBe(iso(first.createdAt));
      expect(iso(stored!.updatedAt)).toBe(iso(first.updatedAt));
    });
  });

  describe('createPatient', () => {
    it('inserts and returns a mapped patient', async () => {
      const patient = await createPatient({
        fullName: 'Juan Pérez',
        phoneE164: '+5215587654321',
      });

      expect(patient).toMatchObject({
        fullName: 'Juan Pérez',
        phoneE164: '+5215587654321',
        email: null,
      });
      // Outcome observable en la BD: la fila quedó persistida con sus campos.
      await expect(getPatient(patient.id)).resolves.toEqual(patient);
    });

    it('throws ValidationError for an invalid phone', async () => {
      await expect(
        createPatient({ fullName: 'Juan', phoneE164: '5512345678' })
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for an empty name', async () => {
      await expect(
        createPatient({ fullName: '   ', phoneE164: '+5215512345678' })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('updatePatient', () => {
    it('updates and returns the mapped patient', async () => {
      const created = await createPatient({
        fullName: 'María García',
        phoneE164: '+5215512345678',
        notes: 'Inicial',
      });

      const patient = await updatePatient(created.id, {
        fullName: 'María G.',
        phoneE164: '+5215512345678',
        notes: 'Actualizado',
      });

      expect(patient).toMatchObject({
        id: created.id,
        fullName: 'María G.',
        phoneE164: '+5215512345678',
        notes: 'Actualizado',
      });
      await expect(getPatient(created.id)).resolves.toEqual(patient);
    });

    it('throws ValidationError for an invalid id', async () => {
      await expect(
        updatePatient('bad-id', {
          fullName: 'María',
          phoneE164: '+5215512345678',
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('deletePatient', () => {
    it('deletes the patient', async () => {
      const created = await createPatient({
        fullName: 'María García',
        phoneE164: '+5215512345678',
      });

      await deletePatient(created.id);

      await expect(getPatient(created.id)).resolves.toBeNull();
    });

    it('throws ValidationError for an invalid id', async () => {
      await expect(deletePatient('bad-id')).rejects.toThrow(ValidationError);
    });
  });

  describe('getPatient', () => {
    it('returns the mapped patient for a valid id', async () => {
      const created = await createPatient({
        fullName: 'María García',
        phoneE164: '+5215512345678',
      });

      await expect(getPatient(created.id)).resolves.toEqual(created);
    });

    it('returns null when the patient does not exist', async () => {
      await expect(getPatient(MISSING_ID)).resolves.toBeNull();
    });

    it('throws ValidationError for an invalid id', async () => {
      await expect(getPatient('bad-id')).rejects.toThrow(ValidationError);
    });
  });

  describe('searchPatients', () => {
    it('returns an empty array for an empty query', async () => {
      const patients = await searchPatients('');

      expect(patients).toEqual([]);
    });

    it('filters by full_name, phone_e164 or email case-insensitively', async () => {
      const nameMatch = await createPatient({
        fullName: 'María García',
        phoneE164: '+5215512345678',
      });
      const phoneMatch = await createPatient({
        fullName: 'Pedro López',
        phoneE164: '+5215599999999',
      });
      const emailMatch = await createPatient({
        fullName: 'Ana Ruiz',
        phoneE164: '+5215588888888',
        email: 'ana@example.com',
      });

      await expect(searchPatients('María')).resolves.toEqual([nameMatch]);
      await expect(searchPatients('9999')).resolves.toEqual([phoneMatch]);
      await expect(searchPatients('example.com')).resolves.toEqual([emailMatch]);
    });

    it('returns an empty array when nothing matches', async () => {
      await createPatient({
        fullName: 'María García',
        phoneE164: '+5215512345678',
      });

      await expect(searchPatients('zzzz')).resolves.toEqual([]);
    });
  });

  describe('updatePatientEmail', () => {
    it('actualiza y devuelve el paciente con solo el email normalizado', async () => {
      const created = await createPatient({
        fullName: 'María',
        phoneE164: '+5215512345678',
      });

      const patient = await updatePatientEmail(created.id, '  NUEVA@Example.COM ');

      expect(patient).toMatchObject({
        id: created.id,
        phoneE164: '+5215512345678',
        email: 'nueva@example.com',
      });
      // El resto de campos no se toca (email targeted).
      await expect(getPatient(created.id)).resolves.toEqual(patient);
    });

    it('rechaza un id inválido sin consultar la base', async () => {
      await expect(updatePatientEmail('bad-id', 'ana@example.com')).rejects.toThrow(
        ValidationError
      );
    });

    it('rechaza un email inválido sin consultar la base', async () => {
      await expect(
        updatePatientEmail(VALID_ID, 'no-es-un-correo')
      ).rejects.toMatchObject({ field: 'email' });
    });

    it('rechaza un email ausente o vacío', async () => {
      await expect(updatePatientEmail(VALID_ID, '')).rejects.toMatchObject({
        field: 'email',
      });
    });

    it('traduce el conflicto de unicidad (23505) a ConflictError', async () => {
      await createPatient({
        fullName: 'Ana',
        phoneE164: '+5215511111111',
        email: 'ana@example.com',
      });
      const other = await createPatient({
        fullName: 'Beto',
        phoneE164: '+5215522222222',
      });

      await expect(
        updatePatientEmail(other.id, 'ana@example.com')
      ).rejects.toBeInstanceOf(ConflictError);
      await expect(
        updatePatientEmail(other.id, 'ana@example.com')
      ).rejects.toMatchObject({ code: 'contact_conflict' });
    });
  });

  describe('patient email contact validation', () => {
    it('creates an email-only patient with a normalized email', async () => {
      const patient = await createPatient({
        fullName: 'María',
        phoneE164: null,
        email: '  MARIA@EXAMPLE.COM ',
      });

      expect(patient).toMatchObject({
        phoneE164: null,
        email: 'maria@example.com',
      });
      await expect(getPatient(patient.id)).resolves.toEqual(patient);
    });

    it('rejects a patient without either contact', async () => {
      await expect(
        createPatient({ fullName: 'María', phoneE164: null, email: null })
      ).rejects.toThrow('contact');
    });
  });

  describe('patient contact edge cases', () => {
    it('rejects a duplicate normalized email as a contact conflict', async () => {
      await createPatient({
        fullName: 'María',
        phoneE164: null,
        email: 'maria@example.com',
      });

      await expect(
        createPatient({
          fullName: 'Otra',
          phoneE164: null,
          email: '  MARIA@example.com ',
        })
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('rejects update without contact before it can overwrite the current row', async () => {
      await expect(
        updatePatient(VALID_ID, { fullName: 'María', phoneE164: null, email: null })
      ).rejects.toMatchObject({ field: 'contact' });
    });

    it('updates and maps both contact methods', async () => {
      const created = await createPatient({
        fullName: 'María',
        phoneE164: '+5215512345678',
      });

      const patient = await updatePatient(created.id, {
        fullName: 'María',
        phoneE164: '+5215512345678',
        email: 'MARIA@example.COM',
      });

      expect(patient).toMatchObject({
        email: 'maria@example.com',
        phoneE164: '+5215512345678',
      });
      await expect(getPatient(created.id)).resolves.toEqual(patient);
    });
  });
});
