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
import { createClinicalVisit } from '../clinical-visits';
import {
  PATIENT_FILES_BUCKET,
  MAX_FILE_SIZE_BYTES,
  SIGNED_URL_EXPIRES_SECONDS,
  validatePatientFileUpload,
  uploadPatientFile,
  listPatientFiles,
  listPatientFilesWithUrls,
  getPatientFileDownloadUrl,
  deletePatientFile,
} from '../patient-files';
import { NotFoundError } from '../errors';
import { ValidationError } from '../validate';
import type { UploadPatientFile } from '../patient-files';

/**
 * Suite contra Supabase local (ver openspec/changes/supabase-local-testing).
 * Corre solo con `npm run test:local` (SUPABASE_LOCAL=1 + supabase start);
 * con `npm run test` regular se omite.
 */
const d = localDbEnabled ? describe : describe.skip;

// UUIDs válidos sin fila asociada (los errores de 0 filas / FK son reales).
const MISSING_PATIENT_ID = '550e8400-e29b-41d4-a716-4466554400ff';
const MISSING_FILE_ID = '770e8400-e29b-41d4-a716-4466554400ff';
// `uploaded_by` es uuid en la BD (el valor del mock no era un uuid válido).
const USER_ID = '990e8400-e29b-41d4-a716-446655440000';

// Las suites de datos se serializan con un advisory lock (ver
// src/test-utils/local-db.ts) porque vitest corre los archivos en paralelo
// y todas truncan el esquema `public`.

function fileInput(overrides: Partial<UploadPatientFile> = {}): UploadPatientFile {
  return {
    name: 'estudio.pdf',
    type: 'application/pdf',
    size: 1024,
    arrayBuffer: async () => new ArrayBuffer(1024),
    ...overrides,
  };
}

d('patient-files service', () => {
  beforeAll(async () => {
    applyLocalDbEnv();
    await acquireDbSuiteLock();
  });

  afterAll(async () => {
    await releaseDbSuiteLock();
  });

  beforeEach(async () => {
    await truncateAllTables();
    await clearPatientFilesBucket();
  });

  // `patients.phone_e164` es UNIQUE: cada paciente de fixture usa uno distinto.
  async function seedPatient(
    fullName = 'Juan Pérez',
    phoneE164 = '+5215512345678'
  ) {
    return createPatient({ fullName, phoneE164 });
  }

  /**
   * Los objetos de Storage no viven en el esquema `public`, así que
   * `truncateAllTables` no los limpia: se purga el bucket antes de cada test
   * para que las aserciones de "objeto ausente" sean deterministas.
   */
  async function clearPatientFilesBucket(): Promise<void> {
    const storage = getSupabaseAdmin().storage.from(PATIENT_FILES_BUCKET);
    const { data: folders, error } = await storage.list('', { limit: 1000 });
    if (error) throw new Error(error.message);
    for (const folder of folders ?? []) {
      const { data: objects, error: listError } = await storage.list(
        folder.name,
        { limit: 1000 }
      );
      if (listError) throw new Error(listError.message);
      const paths = (objects ?? []).map(
        (object) => `${folder.name}/${object.name}`
      );
      if (paths.length > 0) {
        const { error: removeError } = await storage.remove(paths);
        if (removeError) throw new Error(removeError.message);
      }
    }
  }

  /** Prefijo del paciente: cada test usa un paciente nuevo, sin colisiones. */
  async function listBucketObjects(prefix: string): Promise<string[]> {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(PATIENT_FILES_BUCKET)
      .list(prefix, { limit: 1000 });
    if (error) throw new Error(error.message);
    return (data ?? []).map((object) => object.name);
  }

  async function countPatientFileRows(): Promise<number> {
    const { data, error } = await getSupabaseAdmin()
      .from('patient_files')
      .select('id');
    if (error) throw new Error(error.message);
    return (data ?? []).length;
  }

  describe('validatePatientFileUpload', () => {
    it('accepts every allowed MIME type', () => {
      for (const type of [
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf',
      ]) {
        expect(validatePatientFileUpload({ type, size: 1024 })).toEqual({
          ok: true,
        });
      }
    });

    it('rejects a disallowed MIME type with a Spanish message', () => {
      const result = validatePatientFileUpload({
        type: 'image/gif',
        size: 1024,
      });

      expect(result.ok).toBe(false);
      expect(result).toEqual({
        ok: false,
        message: 'Solo se permiten archivos JPG, PNG, WEBP o PDF.',
      });
    });

    it('rejects a file larger than 10 MB with a Spanish message', () => {
      const result = validatePatientFileUpload({
        type: 'application/pdf',
        size: MAX_FILE_SIZE_BYTES + 1,
      });

      expect(result.ok).toBe(false);
      expect(result).toEqual({
        ok: false,
        message: 'El archivo no debe superar 10 MB.',
      });
    });

    it('accepts a file exactly at the 10 MB limit', () => {
      expect(
        validatePatientFileUpload({
          type: 'application/pdf',
          size: MAX_FILE_SIZE_BYTES,
        })
      ).toEqual({ ok: true });
    });
  });

  describe('listPatientFiles', () => {
    it('filters by patient, orders by created_at desc and maps rows', async () => {
      const patient = await seedPatient();
      // Subida secuencial: el orden depende de `created_at` real.
      const first = await uploadPatientFile(patient.id, {
        file: fileInput(),
        category: 'document',
        uploadedBy: USER_ID,
      });
      const second = await uploadPatientFile(patient.id, {
        file: fileInput({ name: 'radiografia.png', type: 'image/png' }),
        category: 'radiograph',
        uploadedBy: USER_ID,
      });

      const files = await listPatientFiles(patient.id);

      expect(files.map((file) => file.id)).toEqual([second.id, first.id]);
      expect(files[1]).toMatchObject({
        id: first.id,
        patientId: patient.id,
        clinicalVisitId: null,
        category: 'document',
        fileName: 'estudio.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        uploadedBy: USER_ID,
      });
      expect(files[1].storagePath).toMatch(
        new RegExp(`^${patient.id}/[0-9a-f-]{36}\\.pdf$`)
      );
      expect(files[1].createdAt).toBeTruthy();
    });

    it('filters by clinical_visit_id when provided', async () => {
      const patient = await seedPatient();
      const visit = await createClinicalVisit(patient.id, {
        subjective: 'Dolor',
      });
      const withVisit = await uploadPatientFile(patient.id, {
        file: fileInput(),
        clinicalVisitId: visit.id,
      });
      await uploadPatientFile(patient.id, { file: fileInput() });

      const files = await listPatientFiles(patient.id, {
        clinicalVisitId: visit.id,
      });

      expect(files.map((file) => file.id)).toEqual([withVisit.id]);
      expect(files[0].clinicalVisitId).toBe(visit.id);
    });

    it('throws ValidationError for an invalid patient id', async () => {
      await expect(listPatientFiles('bad-id')).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for an invalid clinicalVisitId', async () => {
      await expect(
        listPatientFiles(MISSING_PATIENT_ID, { clinicalVisitId: 'bad-id' })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('uploadPatientFile', () => {
    it('uploads to the bucket and inserts the metadata row', async () => {
      const patient = await seedPatient();
      const visit = await createClinicalVisit(patient.id, {
        subjective: 'Dolor',
      });

      const file = await uploadPatientFile(patient.id, {
        file: fileInput(),
        category: 'document',
        clinicalVisitId: visit.id,
        uploadedBy: USER_ID,
      });

      expect(file.id).toBeTruthy();
      const stored = await listPatientFiles(patient.id);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        id: file.id,
        patientId: patient.id,
        clinicalVisitId: visit.id,
        category: 'document',
        fileName: 'estudio.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        uploadedBy: USER_ID,
      });
      expect(stored[0].storagePath).toMatch(
        new RegExp(`^${patient.id}/[0-9a-f-]{36}\\.pdf$`)
      );
      // El objeto real quedó en el bucket bajo el prefijo del paciente.
      const objectName = stored[0].storagePath.split('/')[1];
      expect(await listBucketObjects(patient.id)).toEqual([objectName]);
    });

    it('derives the object extension from the MIME type', async () => {
      const patient = await seedPatient();

      await uploadPatientFile(patient.id, {
        file: fileInput({ name: 'foto.jpeg', type: 'image/jpeg' }),
      });

      const stored = await listPatientFiles(patient.id);
      expect(stored[0].storagePath).toMatch(
        new RegExp(`^${patient.id}/[0-9a-f-]{36}\\.jpg$`)
      );
      expect(stored[0].storagePath.endsWith('.jpeg')).toBe(false);
    });

    it('does not upload when the MIME type is not allowed', async () => {
      const patient = await seedPatient();

      await expect(
        uploadPatientFile(patient.id, {
          file: fileInput({ type: 'image/gif' }),
        })
      ).rejects.toThrow(ValidationError);
      expect(await listBucketObjects(patient.id)).toEqual([]);
      expect(await countPatientFileRows()).toBe(0);
    });

    it('does not upload when the file exceeds the size limit', async () => {
      const patient = await seedPatient();

      await expect(
        uploadPatientFile(patient.id, {
          file: fileInput({ size: MAX_FILE_SIZE_BYTES + 1 }),
        })
      ).rejects.toThrow(ValidationError);
      expect(await listBucketObjects(patient.id)).toEqual([]);
      expect(await countPatientFileRows()).toBe(0);
    });

    it('throws ValidationError for an invalid category', async () => {
      const patient = await seedPatient();

      await expect(
        uploadPatientFile(patient.id, {
          file: fileInput(),
          category: 'not-a-category',
        })
      ).rejects.toThrow(ValidationError);
      expect(await listBucketObjects(patient.id)).toEqual([]);
      expect(await countPatientFileRows()).toBe(0);
    });

    it('throws NotFoundError when the visit belongs to another patient', async () => {
      const patient = await seedPatient();
      const other = await seedPatient('Ana López', '+5215598765432');
      const foreignVisit = await createClinicalVisit(other.id, {
        subjective: 'Control',
      });

      await expect(
        uploadPatientFile(patient.id, {
          file: fileInput(),
          clinicalVisitId: foreignVisit.id,
        })
      ).rejects.toBeInstanceOf(NotFoundError);
      // Ni objeto subido ni metadatos apuntando a una consulta ajena.
      expect(await listBucketObjects(patient.id)).toEqual([]);
      expect(await countPatientFileRows()).toBe(0);
    });

    it('removes the uploaded object when the metadata insert fails', async () => {
      // `patient_id` es FK real: un paciente inexistente hace fallar el insert
      // después de que el objeto ya se subió.
      await expect(
        uploadPatientFile(MISSING_PATIENT_ID, { file: fileInput() })
      ).rejects.toThrow(/patient_files_patient_id_fkey/);

      expect(await listBucketObjects(MISSING_PATIENT_ID)).toEqual([]);
      expect(await countPatientFileRows()).toBe(0);
    });

    it('throws ValidationError for an invalid patient id without uploading', async () => {
      await expect(
        uploadPatientFile('bad-id', { file: fileInput() })
      ).rejects.toThrow(ValidationError);
      expect(await countPatientFileRows()).toBe(0);
    });
  });

  describe('listPatientFilesWithUrls', () => {
    it('signs every stored file in a single batch (no N+1)', async () => {
      const patient = await seedPatient();
      await uploadPatientFile(patient.id, { file: fileInput() });
      await uploadPatientFile(patient.id, {
        file: fileInput({ name: 'radiografia.png', type: 'image/png' }),
      });

      const files = await listPatientFilesWithUrls(patient.id);

      expect(files).toHaveLength(2);
      // Cada archivo recibe su propia URL firmada (una sola llamada batch).
      for (const file of files) {
        expect(typeof file.signedUrl).toBe('string');
        expect(file.signedUrl).toContain('token=');
        expect(decodeURIComponent(file.signedUrl as string)).toContain(
          file.storagePath
        );
      }
      expect(files[0].signedUrl).not.toBe(files[1].signedUrl);
    });

    it('does not call the signer when there are no files', async () => {
      const patient = await seedPatient();

      const files = await listPatientFilesWithUrls(patient.id);

      expect(files).toEqual([]);
    });
  });

  describe('getPatientFileDownloadUrl', () => {
    it('returns a signed download URL with the original file name', async () => {
      const patient = await seedPatient();
      const uploaded = await uploadPatientFile(patient.id, {
        file: fileInput(),
      });

      const result = await getPatientFileDownloadUrl(patient.id, uploaded.id);

      expect(result.fileName).toBe('estudio.pdf');
      expect(result.url).toContain('token=');
      expect(decodeURIComponent(result.url)).toContain(uploaded.storagePath);
      expect(result.url).toContain('download=');
      // La URL firmada sirve el objeto real del bucket.
      const response = await fetch(result.url);
      expect(response.ok).toBe(true);
      expect((await response.arrayBuffer()).byteLength).toBe(1024);
    });

    it('throws NotFoundError when the file does not exist', async () => {
      const patient = await seedPatient();

      await expect(
        getPatientFileDownloadUrl(patient.id, MISSING_FILE_ID)
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws ValidationError for an invalid file id', async () => {
      await expect(
        getPatientFileDownloadUrl(MISSING_PATIENT_ID, 'bad-id')
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('deletePatientFile', () => {
    it('removes the object and then the metadata row', async () => {
      const patient = await seedPatient();
      const uploaded = await uploadPatientFile(patient.id, {
        file: fileInput(),
      });
      expect(await listBucketObjects(patient.id)).toHaveLength(1);

      await deletePatientFile(patient.id, uploaded.id);

      expect(await listBucketObjects(patient.id)).toEqual([]);
      expect(await listPatientFiles(patient.id)).toEqual([]);
      expect(await countPatientFileRows()).toBe(0);
    });

    it('throws NotFoundError when the file does not exist', async () => {
      const patient = await seedPatient();

      await expect(
        deletePatientFile(patient.id, MISSING_FILE_ID)
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('constants', () => {
    it('uses the private bucket and a 5 minute signed URL TTL', () => {
      expect(PATIENT_FILES_BUCKET).toBe('patient-files');
      expect(SIGNED_URL_EXPIRES_SECONDS).toBe(300);
      expect(MAX_FILE_SIZE_BYTES).toBe(10 * 1024 * 1024);
    });
  });
});
