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
  escapePostgrestIlikeTerm,
  getPatient,
  listPatients,
  listPatientsPage,
  normalizePatientsPagination,
  PATIENTS_DEFAULT_PAGE,
  PATIENTS_DEFAULT_PAGE_SIZE,
  PATIENTS_MAX_PAGE_SIZE,
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

    it('trata % y _ como literales, no como comodines', async () => {
      const literal = await createPatient({
        fullName: 'Ana 100%',
        phoneE164: '+5215511111111',
      });
      await createPatient({
        fullName: 'Ana 100X',
        phoneE164: '+5215522222222',
      });

      await expect(searchPatients('100%')).resolves.toEqual([literal]);
      await expect(searchPatients('100_')).resolves.toEqual([]);
    });
  });

  describe('listPatientsPage', () => {
    it('usa page 1 / pageSize 20 por defecto y devuelve metadatos reales', async () => {
      const first = await createPatient({
        fullName: 'María García',
        phoneE164: '+5215512345678',
        notes: 'Nota',
      });
      const second = await createPatient({
        fullName: 'Pedro López',
        phoneE164: '+5215599999999',
      });
      const third = await createPatient({
        fullName: 'Ana Ruiz',
        phoneE164: '+5215588888888',
      });

      const result = await listPatientsPage();

      expect(result).toMatchObject({
        page: 1,
        pageSize: 20,
        totalCount: 3,
        totalPages: 1,
      });
      // Orden estable: created_at desc (el último creado primero).
      expect(result.patients.map((patient) => patient.id)).toEqual([
        third.id,
        second.id,
        first.id,
      ]);
      // Misma forma mapeada que `listPatients` (contrato vigente del recurso).
      expect(result.patients[2]).toMatchObject({
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
    });

    it('reparte el listado por páginas sin repetir ni perder pacientes', async () => {
      const first = await createPatient({
        fullName: 'María García',
        phoneE164: '+5215512345678',
      });
      const second = await createPatient({
        fullName: 'Pedro López',
        phoneE164: '+5215599999999',
      });
      const third = await createPatient({
        fullName: 'Ana Ruiz',
        phoneE164: '+5215588888888',
      });

      const page1 = await listPatientsPage({ page: 1, pageSize: 2 });
      const page2 = await listPatientsPage({ page: 2, pageSize: 2 });

      expect(page1).toMatchObject({ page: 1, pageSize: 2, totalCount: 3, totalPages: 2 });
      expect(page1.patients.map((patient) => patient.id)).toEqual([third.id, second.id]);
      expect(page2).toMatchObject({ page: 2, pageSize: 2, totalCount: 3, totalPages: 2 });
      expect(page2.patients.map((patient) => patient.id)).toEqual([first.id]);

      // La segunda página continúa el orden; no repite ni omite ids.
      const seen = [...page1.patients, ...page2.patients].map((patient) => patient.id);
      expect(new Set(seen).size).toBe(3);
      expect(seen).toEqual([third.id, second.id, first.id]);

      // El orden es estable entre llamadas consecutivas (sin duplicados).
      const page1Again = await listPatientsPage({ page: 1, pageSize: 2 });
      expect(page1Again.patients.map((patient) => patient.id)).toEqual([third.id, second.id]);
    });

    it('combina búsqueda y paginación sobre el total filtrado', async () => {
      const anaOne = await createPatient({
        fullName: 'Ana Uno',
        phoneE164: '+5215511111111',
      });
      const anaTwo = await createPatient({
        fullName: 'Ana Dos',
        phoneE164: '+5215522222222',
      });
      const anaThree = await createPatient({
        fullName: 'Ana Tres',
        phoneE164: '+5215533333333',
      });
      const other = await createPatient({
        fullName: 'Beto Sin Coincidencia',
        phoneE164: '+5215544444444',
      });

      const page1 = await listPatientsPage({ q: 'Ana', page: 1, pageSize: 2 });
      const page2 = await listPatientsPage({ q: 'Ana', page: 2, pageSize: 2 });

      // `total` cuenta solo coincidencias (3), no la tabla completa (4):
      // el filtro se aplica antes del recorte de página.
      expect(page1).toMatchObject({ page: 1, pageSize: 2, totalCount: 3, totalPages: 2 });
      expect(page1.patients.map((patient) => patient.id)).toEqual([anaThree.id, anaTwo.id]);
      expect(page2).toMatchObject({ page: 2, pageSize: 2, totalCount: 3, totalPages: 2 });
      expect(page2.patients.map((patient) => patient.id)).toEqual([anaOne.id]);
      expect([...page1.patients, ...page2.patients].map((patient) => patient.id)).not.toContain(
        other.id
      );
    });

    it('trata q vacío o solo espacios como listado sin filtro', async () => {
      await createPatient({ fullName: 'María García', phoneE164: '+5215512345678' });
      await createPatient({ fullName: 'Pedro López', phoneE164: '+5215599999999' });

      await expect(listPatientsPage({ q: '' })).resolves.toMatchObject({
        totalCount: 2,
        page: 1,
      });
      await expect(listPatientsPage({ q: '   ' })).resolves.toMatchObject({
        totalCount: 2,
        page: 1,
      });
    });

    it('normaliza page y pageSize también dentro de listPatientsPage', async () => {
      await createPatient({ fullName: 'María García', phoneE164: '+5215512345678' });

      await expect(listPatientsPage({ page: 0, pageSize: 0 })).resolves.toMatchObject({
        page: 1,
        pageSize: 20,
        totalCount: 1,
      });
      await expect(listPatientsPage({ page: 1, pageSize: 1000 })).resolves.toMatchObject({
        page: 1,
        pageSize: 100,
      });
    });

    it('reporta metadatos coherentes cuando no hay pacientes', async () => {
      const result = await listPatientsPage();

      expect(result.patients).toEqual([]);
      expect(result).toMatchObject({ page: 1, pageSize: 20, totalCount: 0, totalPages: 1 });
    });

    it('reporta total 0 y totalPages 1 cuando la búsqueda no tiene coincidencias', async () => {
      await createPatient({ fullName: 'María García', phoneE164: '+5215512345678' });

      const result = await listPatientsPage({ q: 'zzzz' });

      expect(result.patients).toEqual([]);
      expect(result).toMatchObject({ page: 1, pageSize: 20, totalCount: 0, totalPages: 1 });
    });

    it('devuelve una página vacía fuera de rango con los metadatos reales', async () => {
      await createPatient({ fullName: 'María García', phoneE164: '+5215512345678' });
      await createPatient({ fullName: 'Pedro López', phoneE164: '+5215599999999' });

      const result = await listPatientsPage({ page: 99, pageSize: 20 });

      expect(result.patients).toEqual([]);
      expect(result).toMatchObject({ totalCount: 2, totalPages: 1 });
    });

    it('trata % y _ como literales en la búsqueda paginada', async () => {
      const literal = await createPatient({
        fullName: 'Ana 100%',
        phoneE164: '+5215511111111',
      });
      await createPatient({
        fullName: 'Ana 100X',
        phoneE164: '+5215522222222',
      });

      const percent = await listPatientsPage({ q: '100%' });
      expect(percent.patients.map((patient) => patient.id)).toEqual([literal.id]);
      expect(percent.totalCount).toBe(1);

      const underscore = await listPatientsPage({ q: '100_' });
      expect(underscore.patients).toEqual([]);
      expect(underscore.totalCount).toBe(0);
    });

    it('resuelve sin lanzar con caracteres reservados de .or() en q', async () => {
      await createPatient({ fullName: 'Ana, María', phoneE164: '+5215511111111' });
      await createPatient({ fullName: 'Ana par(en)', phoneE164: '+5215522222222' });

      for (const q of ['a,b', '(', ')', 'x"y', 'a\\b']) {
        const result = await listPatientsPage({ q });
        expect(result).toMatchObject({ page: 1, pageSize: 20 });
        expect(Array.isArray(result.patients)).toBe(true);
      }

      // Los paréntesis y la coma son literales buscables, no sintaxis de `.or()`.
      await expect(listPatientsPage({ q: 'a,' })).resolves.toMatchObject({ totalCount: 1 });
      await expect(listPatientsPage({ q: '(en)' })).resolves.toMatchObject({ totalCount: 1 });
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

/**
 * Suite pura (sin BD): corre también con `npm run test`.
 *
 * Expectativas verificadas contra el PostgREST local (tarea 1.5): dentro de un
 * valor citado PostgREST des-escapa un nivel, así que los comodines LIKE viajan
 * con barra invertida doble (`\\%`) para llegar literales a Postgres.
 */
describe('escapePostgrestIlikeTerm', () => {
  it('envuelve el término en comillas con comodines externos', () => {
    expect(escapePostgrestIlikeTerm('ana')).toBe('"%ana%"');
    expect(escapePostgrestIlikeTerm('')).toBe('"%%"');
  });

  it('escapa los comodines LIKE % y _ para que sean literales', () => {
    expect(escapePostgrestIlikeTerm('50%')).toBe('"%50\\\\%%"');
    expect(escapePostgrestIlikeTerm('a_b')).toBe('"%a\\\\_b%"');
  });

  it('cita los caracteres reservados de .or() para que no corten la expresión', () => {
    expect(escapePostgrestIlikeTerm('a,b')).toBe('"%a,b%"');
    expect(escapePostgrestIlikeTerm('(')).toBe('"%(%"');
    expect(escapePostgrestIlikeTerm(')')).toBe('"%)%"');
  });

  it('escapa comillas dobles y diagonales invertidas', () => {
    expect(escapePostgrestIlikeTerm('x"y')).toBe('"%x\\"y%"');
    expect(escapePostgrestIlikeTerm('a\\b')).toBe('"%a\\\\\\\\b%"');
  });
});

describe('normalizePatientsPagination', () => {
  it('usa los valores por defecto cuando faltan y expone las constantes', () => {
    expect(normalizePatientsPagination(null, null)).toEqual({ page: 1, pageSize: 20 });
    expect(normalizePatientsPagination(undefined, undefined)).toEqual({ page: 1, pageSize: 20 });
    expect(PATIENTS_DEFAULT_PAGE).toBe(1);
    expect(PATIENTS_DEFAULT_PAGE_SIZE).toBe(20);
    expect(PATIENTS_MAX_PAGE_SIZE).toBe(100);
  });

  it('resuelve a defaults los valores no numéricos, cero, negativos y no enteros', () => {
    for (const invalid of ['', 'abc', 0, -1, 1.5, '1.5', '0', '-3', NaN, Infinity]) {
      expect(normalizePatientsPagination(invalid, invalid)).toEqual({ page: 1, pageSize: 20 });
    }
  });

  it('acepta números y cadenas numéricas positivas', () => {
    expect(normalizePatientsPagination(3, 50)).toEqual({ page: 3, pageSize: 50 });
    expect(normalizePatientsPagination('3', '50')).toEqual({ page: 3, pageSize: 50 });
  });

  it('satura pageSize al máximo permitido', () => {
    expect(normalizePatientsPagination('1', '101')).toEqual({ page: 1, pageSize: 100 });
    expect(normalizePatientsPagination(1, 1000)).toEqual({ page: 1, pageSize: 100 });
    expect(normalizePatientsPagination(1, 100)).toEqual({ page: 1, pageSize: 100 });
  });
});
