import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, GET } from './route';
import { UnauthorizedError } from '@/lib/supabase/auth';
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

vi.mock('@/lib/admin/patient-files', () => ({
  getPatientFileDownloadUrl: vi.fn(),
  deletePatientFile: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import {
  deletePatientFile,
  getPatientFileDownloadUrl,
} from '@/lib/admin/patient-files';

const USER = { id: 'user-1', email: 'a@b.c' };
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const FILE_ID = '770e8400-e29b-41d4-a716-446655440000';

function request(method: 'GET' | 'DELETE') {
  return new Request(
    `http://localhost/api/admin/patients/${PATIENT_ID}/files/${FILE_ID}`,
    { method }
  );
}

const CONTEXT = { params: Promise.resolve({ id: PATIENT_ID, fileId: FILE_ID }) };

describe('GET /api/admin/patients/[id]/files/[fileId]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await GET(request('GET'), CONTEXT);

    expect(res.status).toBe(401);
    expect(getPatientFileDownloadUrl).not.toHaveBeenCalled();
  });

  it('returns the signed download url and file name', async () => {
    (getPatientFileDownloadUrl as ReturnType<typeof vi.fn>).mockResolvedValue({
      url: 'https://download',
      fileName: 'estudio.pdf',
    });

    const res = await GET(request('GET'), CONTEXT);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ url: 'https://download', fileName: 'estudio.pdf' });
    expect(getPatientFileDownloadUrl).toHaveBeenCalledWith(
      PATIENT_ID,
      FILE_ID
    );
  });

  it('returns 404 when the file does not exist', async () => {
    (getPatientFileDownloadUrl as ReturnType<typeof vi.fn>).mockRejectedValue(
      new NotFoundError('Patient file')
    );

    const res = await GET(request('GET'), CONTEXT);

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/patients/[id]/files/[fileId]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await DELETE(request('DELETE'), CONTEXT);

    expect(res.status).toBe(401);
    expect(deletePatientFile).not.toHaveBeenCalled();
  });

  it('deletes the file and returns ok', async () => {
    (deletePatientFile as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined
    );

    const res = await DELETE(request('DELETE'), CONTEXT);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(deletePatientFile).toHaveBeenCalledWith(PATIENT_ID, FILE_ID);
  });

  it('returns 404 when the file does not exist', async () => {
    (deletePatientFile as ReturnType<typeof vi.fn>).mockRejectedValue(
      new NotFoundError('Patient file')
    );

    const res = await DELETE(request('DELETE'), CONTEXT);

    expect(res.status).toBe(404);
  });
});
