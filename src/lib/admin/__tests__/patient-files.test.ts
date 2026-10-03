import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
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

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const VISIT_ID = '660e8400-e29b-41d4-a716-446655440000';
const FILE_ID = '770e8400-e29b-41d4-a716-446655440000';

function buildQuery() {
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockDelete = vi.fn();
  const mockEq = vi.fn();
  const mockOrder = vi.fn();
  const mockSingle = vi.fn();
  const mockMaybeSingle = vi.fn();

  const query = {
    select: mockSelect.mockReturnThis(),
    insert: mockInsert.mockReturnThis(),
    delete: mockDelete.mockReturnThis(),
    eq: mockEq.mockReturnThis(),
    order: mockOrder.mockReturnThis(),
    single: mockSingle,
    maybeSingle: mockMaybeSingle,
    _mocks: {
      mockSelect,
      mockInsert,
      mockDelete,
      mockEq,
      mockOrder,
      mockSingle,
      mockMaybeSingle,
    },
  };
  return query;
}

type StorageMock = {
  upload: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  createSignedUrl: ReturnType<typeof vi.fn>;
  createSignedUrls: ReturnType<typeof vi.fn>;
};

function buildStorage(): StorageMock {
  return {
    upload: vi.fn().mockResolvedValue({ data: { path: 'x' }, error: null }),
    remove: vi.fn().mockResolvedValue({ data: [], error: null }),
    createSignedUrl: vi
      .fn()
      .mockResolvedValue({ data: { signedUrl: 'https://signed' }, error: null }),
    createSignedUrls: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
}

function buildClient(
  visitQuery: ReturnType<typeof buildQuery>,
  fileQuery: ReturnType<typeof buildQuery>,
  storage: StorageMock
) {
  const from = vi.fn((table: string) =>
    table === 'clinical_visits' ? visitQuery : fileQuery
  );
  return {
    from,
    storage: { from: vi.fn().mockReturnValue(storage) },
    _mocks: { from },
  };
}

function fileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: FILE_ID,
    patient_id: PATIENT_ID,
    clinical_visit_id: null,
    category: 'document',
    storage_path: `${PATIENT_ID}/${FILE_ID}.pdf`,
    file_name: 'estudio.pdf',
    mime_type: 'application/pdf',
    size_bytes: 1024,
    uploaded_by: 'user-1',
    created_at: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function fileInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'estudio.pdf',
    type: 'application/pdf',
    size: 1024,
    arrayBuffer: async () => new ArrayBuffer(1024),
    ...overrides,
  };
}

describe('patient-files service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

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
      const fileQuery = buildQuery();
      fileQuery._mocks.mockOrder.mockResolvedValue({
        data: [
          fileRow({ id: 'file-2', category: 'radiograph' }),
          fileRow({ id: 'file-1' }),
        ],
        error: null,
      });
      const client = buildClient(buildQuery(), fileQuery, buildStorage());
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(client);

      const files = await listPatientFiles(PATIENT_ID);

      expect(fileQuery._mocks.mockEq).toHaveBeenCalledWith(
        'patient_id',
        PATIENT_ID
      );
      expect(fileQuery._mocks.mockOrder).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
      expect(files[0]).toMatchObject({
        id: 'file-2',
        patientId: PATIENT_ID,
        clinicalVisitId: null,
        category: 'radiograph',
        storagePath: `${PATIENT_ID}/${FILE_ID}.pdf`,
        fileName: 'estudio.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        uploadedBy: 'user-1',
        createdAt: '2026-01-02T00:00:00.000Z',
      });
    });

    it('filters by clinical_visit_id when provided', async () => {
      const fileQuery = buildQuery();
      fileQuery._mocks.mockOrder.mockResolvedValue({ data: [], error: null });
      const client = buildClient(buildQuery(), fileQuery, buildStorage());
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(client);

      await listPatientFiles(PATIENT_ID, { clinicalVisitId: VISIT_ID });

      expect(fileQuery._mocks.mockEq).toHaveBeenCalledWith(
        'clinical_visit_id',
        VISIT_ID
      );
    });

    it('throws ValidationError for an invalid patient id', async () => {
      await expect(listPatientFiles('bad-id')).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for an invalid clinicalVisitId', async () => {
      await expect(
        listPatientFiles(PATIENT_ID, { clinicalVisitId: 'bad-id' })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('uploadPatientFile', () => {
    it('uploads to the bucket and inserts the metadata row', async () => {
      const visitQuery = buildQuery();
      visitQuery._mocks.mockMaybeSingle.mockResolvedValue({
        data: { id: VISIT_ID },
        error: null,
      });
      const fileQuery = buildQuery();
      fileQuery._mocks.mockSingle.mockResolvedValue({
        data: fileRow({ clinical_visit_id: VISIT_ID }),
        error: null,
      });
      const storage = buildStorage();
      const client = buildClient(visitQuery, fileQuery, storage);
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(client);

      const file = await uploadPatientFile(PATIENT_ID, {
        file: fileInput(),
        category: 'document',
        clinicalVisitId: VISIT_ID,
        uploadedBy: 'user-1',
      });

      const [path, body, options] = storage.upload.mock.calls[0];
      expect(path).toMatch(
        new RegExp(`^${PATIENT_ID}/[0-9a-f-]{36}\\.pdf$`)
      );
      expect(body).toBeInstanceOf(ArrayBuffer);
      expect(options).toEqual({
        contentType: 'application/pdf',
        upsert: false,
      });
      expect(storage.upload).toHaveBeenCalledTimes(1);
      expect(fileQuery._mocks.mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          patient_id: PATIENT_ID,
          clinical_visit_id: VISIT_ID,
          category: 'document',
          storage_path: path,
          file_name: 'estudio.pdf',
          mime_type: 'application/pdf',
          size_bytes: 1024,
          uploaded_by: 'user-1',
        })
      );
      expect(file.id).toBe(FILE_ID);
    });

    it('derives the object extension from the MIME type', async () => {
      const fileQuery = buildQuery();
      fileQuery._mocks.mockSingle.mockResolvedValue({
        data: fileRow(),
        error: null,
      });
      const storage = buildStorage();
      const client = buildClient(buildQuery(), fileQuery, storage);
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(client);

      await uploadPatientFile(PATIENT_ID, {
        file: fileInput({ name: 'foto.jpeg', type: 'image/jpeg' }),
      });

      expect(storage.upload.mock.calls[0][0]).toMatch(
        new RegExp(`^${PATIENT_ID}/[0-9a-f-]{36}\\.jpg$`)
      );
    });

    it('does not upload when the MIME type is not allowed', async () => {
      const storage = buildStorage();
      const client = buildClient(buildQuery(), buildQuery(), storage);
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(client);

      await expect(
        uploadPatientFile(PATIENT_ID, {
          file: fileInput({ type: 'image/gif' }),
        })
      ).rejects.toThrow(ValidationError);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('does not upload when the file exceeds the size limit', async () => {
      const storage = buildStorage();
      const client = buildClient(buildQuery(), buildQuery(), storage);
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(client);

      await expect(
        uploadPatientFile(PATIENT_ID, {
          file: fileInput({ size: MAX_FILE_SIZE_BYTES + 1 }),
        })
      ).rejects.toThrow(ValidationError);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('throws ValidationError for an invalid category', async () => {
      const storage = buildStorage();
      const client = buildClient(buildQuery(), buildQuery(), storage);
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(client);

      await expect(
        uploadPatientFile(PATIENT_ID, {
          file: fileInput(),
          category: 'not-a-category',
        })
      ).rejects.toThrow(ValidationError);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the visit belongs to another patient', async () => {
      const visitQuery = buildQuery();
      visitQuery._mocks.mockMaybeSingle.mockResolvedValue({
        data: null,
        error: null,
      });
      const fileQuery = buildQuery();
      const storage = buildStorage();
      const client = buildClient(visitQuery, fileQuery, storage);
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(client);

      await expect(
        uploadPatientFile(PATIENT_ID, {
          file: fileInput(),
          clinicalVisitId: VISIT_ID,
        })
      ).rejects.toBeInstanceOf(NotFoundError);
      // La consulta debe pertenecer al paciente: no se sube el objeto ni se
      // insertan metadatos apuntando a una visita ajena.
      expect(storage.upload).not.toHaveBeenCalled();
      expect(fileQuery._mocks.mockInsert).not.toHaveBeenCalled();
      expect(visitQuery._mocks.mockEq).toHaveBeenCalledWith(
        'patient_id',
        PATIENT_ID
      );
    });

    it('removes the uploaded object when the metadata insert fails', async () => {
      const fileQuery = buildQuery();
      fileQuery._mocks.mockSingle.mockResolvedValue({
        data: null,
        error: { message: 'insert boom' },
      });
      const storage = buildStorage();
      const client = buildClient(buildQuery(), fileQuery, storage);
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(client);

      await expect(
        uploadPatientFile(PATIENT_ID, { file: fileInput() })
      ).rejects.toThrow('insert boom');

      const uploadedPath = storage.upload.mock.calls[0][0];
      expect(storage.remove).toHaveBeenCalledWith([uploadedPath]);
    });

    it('throws ValidationError for an invalid patient id without uploading', async () => {
      const storage = buildStorage();
      const client = buildClient(buildQuery(), buildQuery(), storage);
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(client);

      await expect(
        uploadPatientFile('bad-id', { file: fileInput() })
      ).rejects.toThrow(ValidationError);
      expect(storage.upload).not.toHaveBeenCalled();
    });
  });

  describe('listPatientFilesWithUrls', () => {
    it('signs every path in a single batch (no N+1)', async () => {
      const fileQuery = buildQuery();
      fileQuery._mocks.mockOrder.mockResolvedValue({
        data: [
          fileRow({ id: 'file-1', storage_path: `${PATIENT_ID}/a.pdf` }),
          fileRow({ id: 'file-2', storage_path: `${PATIENT_ID}/b.pdf` }),
        ],
        error: null,
      });
      const storage = buildStorage();
      storage.createSignedUrls.mockResolvedValue({
        data: [
          { path: `${PATIENT_ID}/a.pdf`, signedUrl: 'https://a' },
          { path: `${PATIENT_ID}/b.pdf`, signedUrl: 'https://b' },
        ],
        error: null,
      });
      const client = buildClient(buildQuery(), fileQuery, storage);
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(client);

      const files = await listPatientFilesWithUrls(PATIENT_ID);

      expect(storage.createSignedUrls).toHaveBeenCalledTimes(1);
      expect(storage.createSignedUrls).toHaveBeenCalledWith(
        [`${PATIENT_ID}/a.pdf`, `${PATIENT_ID}/b.pdf`],
        SIGNED_URL_EXPIRES_SECONDS
      );
      expect(files[0].signedUrl).toBe('https://a');
      expect(files[1].signedUrl).toBe('https://b');
    });

    it('does not call the signer when there are no files', async () => {
      const fileQuery = buildQuery();
      fileQuery._mocks.mockOrder.mockResolvedValue({ data: [], error: null });
      const storage = buildStorage();
      const client = buildClient(buildQuery(), fileQuery, storage);
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(client);

      const files = await listPatientFilesWithUrls(PATIENT_ID);

      expect(files).toEqual([]);
      expect(storage.createSignedUrls).not.toHaveBeenCalled();
    });
  });

  describe('getPatientFileDownloadUrl', () => {
    it('returns a signed download URL with the original file name', async () => {
      const fileQuery = buildQuery();
      fileQuery._mocks.mockSingle.mockResolvedValue({
        data: fileRow(),
        error: null,
      });
      const storage = buildStorage();
      storage.createSignedUrl.mockResolvedValue({
        data: { signedUrl: 'https://download' },
        error: null,
      });
      const client = buildClient(buildQuery(), fileQuery, storage);
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(client);

      const result = await getPatientFileDownloadUrl(PATIENT_ID, FILE_ID);

      expect(storage.createSignedUrl).toHaveBeenCalledWith(
        `${PATIENT_ID}/${FILE_ID}.pdf`,
        SIGNED_URL_EXPIRES_SECONDS,
        { download: 'estudio.pdf' }
      );
      expect(result).toEqual({
        url: 'https://download',
        fileName: 'estudio.pdf',
      });
    });

    it('throws NotFoundError when the file does not exist', async () => {
      const fileQuery = buildQuery();
      fileQuery._mocks.mockSingle.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });
      const client = buildClient(buildQuery(), fileQuery, buildStorage());
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(client);

      await expect(
        getPatientFileDownloadUrl(PATIENT_ID, FILE_ID)
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws ValidationError for an invalid file id', async () => {
      await expect(
        getPatientFileDownloadUrl(PATIENT_ID, 'bad-id')
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('deletePatientFile', () => {
    it('removes the object and then the metadata row', async () => {
      const fileQuery = buildQuery();
      fileQuery._mocks.mockMaybeSingle.mockResolvedValue({
        data: fileRow(),
        error: null,
      });
      fileQuery._mocks.mockEq
        .mockReturnValueOnce(fileQuery)
        .mockReturnValueOnce(fileQuery)
        .mockReturnValueOnce(fileQuery)
        .mockResolvedValueOnce({ error: null });
      const storage = buildStorage();
      const client = buildClient(buildQuery(), fileQuery, storage);
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(client);

      await deletePatientFile(PATIENT_ID, FILE_ID);

      expect(storage.remove).toHaveBeenCalledWith([`${PATIENT_ID}/${FILE_ID}.pdf`]);
      expect(fileQuery._mocks.mockDelete).toHaveBeenCalled();
      expect(fileQuery._mocks.mockEq).toHaveBeenCalledWith('id', FILE_ID);
      expect(fileQuery._mocks.mockEq).toHaveBeenCalledWith(
        'patient_id',
        PATIENT_ID
      );
    });

    it('throws NotFoundError when the file does not exist', async () => {
      const fileQuery = buildQuery();
      fileQuery._mocks.mockMaybeSingle.mockResolvedValue({
        data: null,
        error: null,
      });
      const storage = buildStorage();
      const client = buildClient(buildQuery(), fileQuery, storage);
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(client);

      await expect(
        deletePatientFile(PATIENT_ID, FILE_ID)
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(storage.remove).not.toHaveBeenCalled();
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
