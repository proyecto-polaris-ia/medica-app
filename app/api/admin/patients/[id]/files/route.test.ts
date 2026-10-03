// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';
import { UnauthorizedError } from '@/lib/supabase/auth';
import { ValidationError } from '@/lib/admin/validate';
import { NotFoundError } from '@/lib/admin/errors';

vi.mock('@/lib/supabase/auth', () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class extends Error {
    constructor() {
      super('Unauthorized');
      this.name = 'UnauthorizedError';
    }
  },
}));

vi.mock('@/lib/admin/patient-files', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/admin/patient-files')>();
  return {
    ...actual,
    uploadPatientFile: vi.fn(),
    listPatientFilesWithUrls: vi.fn(),
  };
});

import { requireUser } from '@/lib/supabase/auth';
import {
  listPatientFilesWithUrls,
  uploadPatientFile,
} from '@/lib/admin/patient-files';

const USER = { id: 'user-1', email: 'a@b.c' };
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const VISIT_ID = '660e8400-e29b-41d4-a716-446655440000';
const FILE_ID = '770e8400-e29b-41d4-a716-446655440000';

const BASE_FILE = {
  id: FILE_ID,
  patientId: PATIENT_ID,
  clinicalVisitId: null,
  category: 'document',
  storagePath: `${PATIENT_ID}/${FILE_ID}.pdf`,
  fileName: 'estudio.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  uploadedBy: 'user-1',
  createdAt: '2026-01-02T00:00:00.000Z',
};

function listRequest(query = '') {
  return new Request(
    `http://localhost/api/admin/patients/${PATIENT_ID}/files${query}`,
    { method: 'GET' }
  );
}

function uploadRequest(fields: {
  file?: File;
  category?: string;
  clinicalVisitId?: string;
}) {
  const form = new FormData();
  if (fields.file) {
    form.append('file', fields.file);
  }
  if (fields.category !== undefined) {
    form.append('category', fields.category);
  }
  if (fields.clinicalVisitId !== undefined) {
    form.append('clinicalVisitId', fields.clinicalVisitId);
  }
  return new Request(
    `http://localhost/api/admin/patients/${PATIENT_ID}/files`,
    { method: 'POST', body: form }
  );
}

function pdfFile(name = 'estudio.pdf', bytes = 1024) {
  return new File([new Uint8Array(bytes)], name, {
    type: 'application/pdf',
  });
}

describe('GET /api/admin/patients/[id]/files', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await GET(listRequest(), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });

    expect(res.status).toBe(401);
    expect(listPatientFilesWithUrls).not.toHaveBeenCalled();
  });

  it('lists files with a signed url per file', async () => {
    (listPatientFilesWithUrls as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...BASE_FILE, signedUrl: 'https://signed/a' },
    ]);

    const res = await GET(listRequest(), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.files).toHaveLength(1);
    expect(body.files[0].signedUrl).toBe('https://signed/a');
    expect(listPatientFilesWithUrls).toHaveBeenCalledWith(PATIENT_ID, {
      clinicalVisitId: null,
    });
  });

  it('forwards the clinicalVisitId filter', async () => {
    (listPatientFilesWithUrls as ReturnType<typeof vi.fn>).mockResolvedValue(
      []
    );

    const res = await GET(listRequest(`?clinicalVisitId=${VISIT_ID}`), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });

    expect(res.status).toBe(200);
    expect(listPatientFilesWithUrls).toHaveBeenCalledWith(PATIENT_ID, {
      clinicalVisitId: VISIT_ID,
    });
  });

  it('returns an empty list when the patient has no files', async () => {
    (listPatientFilesWithUrls as ReturnType<typeof vi.fn>).mockResolvedValue(
      []
    );

    const res = await GET(listRequest(), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.files).toEqual([]);
  });

  it('maps an unexpected failure to 500', async () => {
    (listPatientFilesWithUrls as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('boom')
    );

    const res = await GET(listRequest(), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });

    expect(res.status).toBe(500);
  });
});

describe('POST /api/admin/patients/[id]/files', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await POST(uploadRequest({ file: pdfFile() }), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });

    expect(res.status).toBe(401);
    expect(uploadPatientFile).not.toHaveBeenCalled();
  });

  it('returns 400 with a Spanish message for a disallowed type', async () => {
    const gif = new File([new Uint8Array(10)], 'anim.gif', {
      type: 'image/gif',
    });

    const res = await POST(uploadRequest({ file: gif }), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('invalid_file');
    expect(body.message).toBe(
      'Solo se permiten archivos JPG, PNG, WEBP o PDF.'
    );
    expect(uploadPatientFile).not.toHaveBeenCalled();
  });

  it('returns 400 with a Spanish message when the file is too large', async () => {
    const big = pdfFile('grande.pdf', 10 * 1024 * 1024 + 1);

    const res = await POST(uploadRequest({ file: big }), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('invalid_file');
    expect(body.message).toBe('El archivo no debe superar 10 MB.');
    expect(uploadPatientFile).not.toHaveBeenCalled();
  });

  it('returns 400 when the file field is missing', async () => {
    const res = await POST(uploadRequest({}), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.message).toBe('Selecciona un archivo.');
    expect(uploadPatientFile).not.toHaveBeenCalled();
  });

  it('uploads a valid file and returns 201', async () => {
    (uploadPatientFile as ReturnType<typeof vi.fn>).mockResolvedValue(
      BASE_FILE
    );
    const file = pdfFile();

    const res = await POST(
      uploadRequest({ file, category: 'radiograph', clinicalVisitId: VISIT_ID }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.file.id).toBe(FILE_ID);
    expect(uploadPatientFile).toHaveBeenCalledWith(
      PATIENT_ID,
      expect.objectContaining({
        category: 'radiograph',
        clinicalVisitId: VISIT_ID,
        uploadedBy: USER.id,
      })
    );
    const uploaded = (
      uploadPatientFile as unknown as {
        mock: { calls: [string, { file: File }][] };
      }
    ).mock.calls[0][1];
    expect(uploaded.file).toBeInstanceOf(File);
    expect(uploaded.file.name).toBe('estudio.pdf');
    expect(uploaded.file.type).toBe('application/pdf');
    expect(uploaded.file.size).toBe(1024);
  });

  it('maps a NotFoundError from the service to 404', async () => {
    (uploadPatientFile as ReturnType<typeof vi.fn>).mockRejectedValue(
      new NotFoundError('Clinical visit')
    );

    const res = await POST(uploadRequest({ file: pdfFile() }), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });

    expect(res.status).toBe(404);
  });

  it('maps a ValidationError from the service to 400', async () => {
    (uploadPatientFile as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ValidationError('category', 'Invalid category')
    );

    const res = await POST(uploadRequest({ file: pdfFile() }), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('invalid_request');
  });

  it('maps an unexpected failure to 500', async () => {
    (uploadPatientFile as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('boom')
    );

    const res = await POST(uploadRequest({ file: pdfFile() }), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });

    expect(res.status).toBe(500);
  });
});
