import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../patients/route';
import { UnauthorizedError } from '@/lib/supabase/auth';
import { ValidationError } from '@/lib/admin/validate';
import { ConflictError } from '@/lib/admin/errors';

vi.mock('@/lib/supabase/auth', () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class extends Error {
    constructor() {
      super('Unauthorized');
      this.name = 'UnauthorizedError';
    }
  },
}));

vi.mock('@/lib/admin/patients', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/patients')>();
  return {
    // El route normaliza los parámetros con el helper real de la capa de datos;
    // el resto de la capa se mockea para probar solo el contrato HTTP.
    normalizePatientsPagination: actual.normalizePatientsPagination,
    listPatientsPage: vi.fn(),
    createPatient: vi.fn(),
  };
});

import { requireUser } from '@/lib/supabase/auth';
import { createPatient, listPatientsPage } from '@/lib/admin/patients';

const USER = { id: 'user-1', email: 'a@b.c' };
const PATIENT = { id: 'pat-1', fullName: 'María', phoneE164: '+5215512345678' };

type ListPageMock = ReturnType<typeof vi.fn>;
type Overrides = Partial<{
  patients: unknown[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}>;

function mockListPage(overrides: Overrides = {}): void {
  (listPatientsPage as ListPageMock).mockResolvedValue({
    patients: [PATIENT],
    page: 1,
    pageSize: 20,
    totalCount: 1,
    totalPages: 1,
    ...overrides,
  });
}

function listPageMockArgs(): unknown[] {
  return (listPatientsPage as ListPageMock).mock.calls[0];
}

describe('GET /api/admin/patients', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ListPageMock).mockResolvedValue(USER);
    mockListPage();
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ListPageMock).mockRejectedValue(new UnauthorizedError());

    const res = await GET(new Request('http://localhost/api/admin/patients'));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: 'unauthorized' });
    expect(listPatientsPage).not.toHaveBeenCalled();
  });

  it('uses page 1 and pageSize 20 by default', async () => {
    const res = await GET(new Request('http://localhost/api/admin/patients'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(listPatientsPage).toHaveBeenCalledWith({
      q: '',
      page: 1,
      pageSize: 20,
    });
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
  });

  it('responds with the additive pagination shape', async () => {
    const res = await GET(new Request('http://localhost/api/admin/patients'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      'page',
      'pageSize',
      'patients',
      'total',
      'totalPages',
    ]);
    expect(body.patients).toHaveLength(1);
    expect(body.patients[0].fullName).toBe('María');
    expect(body.total).toBe(1);
    expect(body.totalPages).toBe(1);
    expect(body.totalCount).toBeUndefined();
  });

  it('trims ?q= before forwarding it', async () => {
    const res = await GET(
      new Request('http://localhost/api/admin/patients?q=%20maria%20')
    );

    expect(res.status).toBe(200);
    expect(listPatientsPage).toHaveBeenCalledWith({
      q: 'maria',
      page: 1,
      pageSize: 20,
    });
  });

  it('forwards an empty ?q= as an unfiltered query', async () => {
    const res = await GET(new Request('http://localhost/api/admin/patients?q='));

    expect(res.status).toBe(200);
    expect(listPatientsPage).toHaveBeenCalledWith({
      q: '',
      page: 1,
      pageSize: 20,
    });
  });

  it('falls back to defaults for invalid page and pageSize', async () => {
    const res = await GET(
      new Request('http://localhost/api/admin/patients?page=abc&pageSize=0')
    );

    expect(res.status).toBe(200);
    expect(listPatientsPage).toHaveBeenCalledWith({
      q: '',
      page: 1,
      pageSize: 20,
    });
  });

  it('saturates pageSize above 100', async () => {
    const res = await GET(
      new Request('http://localhost/api/admin/patients?pageSize=101')
    );

    expect(res.status).toBe(200);
    expect(listPatientsPage).toHaveBeenCalledWith({
      q: '',
      page: 1,
      pageSize: 100,
    });
  });

  it('forwards valid page and pageSize values', async () => {
    mockListPage({ page: 2, pageSize: 50, totalCount: 60, totalPages: 2 });

    const res = await GET(
      new Request('http://localhost/api/admin/patients?page=2&pageSize=50')
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(listPatientsPage).toHaveBeenCalledWith({
      q: '',
      page: 2,
      pageSize: 50,
    });
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(50);
    expect(body.totalPages).toBe(2);
  });

  it('returns 200 with empty patients for an out-of-range page', async () => {
    mockListPage({
      patients: [],
      page: 5,
      pageSize: 20,
      totalCount: 3,
      totalPages: 1,
    });

    const res = await GET(
      new Request('http://localhost/api/admin/patients?page=5')
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.patients).toEqual([]);
    expect(body.total).toBeGreaterThan(0);
    expect(body.totalPages).toBeGreaterThan(0);
  });

  it('returns 500 when the service throws', async () => {
    (listPatientsPage as ListPageMock).mockRejectedValue(new Error('db down'));

    const res = await GET(new Request('http://localhost/api/admin/patients'));

    expect(res.status).toBe(500);
  });

  it('falls back to defaults for negative and non-integer page values', async () => {
    const res = await GET(
      new Request('http://localhost/api/admin/patients?page=-3&pageSize=1.5')
    );

    expect(res.status).toBe(200);
    expect(listPatientsPage).toHaveBeenCalledWith({
      q: '',
      page: 1,
      pageSize: 20,
    });
  });

  it('keeps pageSize at the 100 boundary without saturating below it', async () => {
    const res = await GET(
      new Request('http://localhost/api/admin/patients?pageSize=100')
    );

    expect(res.status).toBe(200);
    expect(listPatientsPage).toHaveBeenCalledWith({
      q: '',
      page: 1,
      pageSize: 100,
    });
  });

  it('maps totalCount to total verbatim', async () => {
    mockListPage({ totalCount: 42, totalPages: 3 });

    const res = await GET(new Request('http://localhost/api/admin/patients'));
    const body = await res.json();

    expect(body.total).toBe(42);
    expect(body.totalPages).toBe(3);
  });

  it('combines the trimmed query with explicit page and pageSize', async () => {
    mockListPage({ page: 2, pageSize: 10, totalCount: 12, totalPages: 2 });

    const res = await GET(
      new Request('http://localhost/api/admin/patients?q=%20ana%20&page=2&pageSize=10')
    );
    const body = await res.json();

    expect(listPatientsPage).toHaveBeenCalledWith({
      q: 'ana',
      page: 2,
      pageSize: 10,
    });
    expect(body.total).toBe(12);
    expect(body.totalPages).toBe(2);
  });

  it('does not call the data layer for the 401 path', async () => {
    (requireUser as ListPageMock).mockRejectedValue(new UnauthorizedError());

    await GET(new Request('http://localhost/api/admin/patients?q=maria'));

    expect(listPatientsPage).not.toHaveBeenCalled();
  });

  it('exposes the mock call arguments when the data layer is invoked', async () => {
    await GET(new Request('http://localhost/api/admin/patients?q=ana&page=3'));

    expect(listPageMockArgs()).toEqual([{ q: 'ana', page: 3, pageSize: 20 }]);
  });
});

describe('POST /api/admin/patients', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ListPageMock).mockResolvedValue(USER);
  });

  it('creates a patient', async () => {
    (createPatient as ListPageMock).mockResolvedValue({
      id: 'pat-new',
      fullName: 'Juan',
      phoneE164: '+5215587654321',
    });

    const res = await POST(
      new Request('http://localhost/api/admin/patients', {
        method: 'POST',
        body: JSON.stringify({ fullName: 'Juan', phoneE164: '+5215587654321' }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.patient.fullName).toBe('Juan');
  });

  it('forwards an email-only patient to the service', async () => {
    (createPatient as ListPageMock).mockResolvedValue({
      id: 'pat-email', fullName: 'María', phoneE164: null, email: 'maria@example.com',
    });

    const res = await POST(new Request('http://localhost/api/admin/patients', {
      method: 'POST',
      body: JSON.stringify({ fullName: 'María', phoneE164: null, email: 'MARIA@example.com' }),
    }));

    expect(res.status).toBe(201);
    expect(createPatient).toHaveBeenCalledWith({
      fullName: 'María', phoneE164: null, email: 'MARIA@example.com', notes: undefined,
    });
  });

  it('forwards both contacts to the service', async () => {
    (createPatient as ListPageMock).mockResolvedValue({
      id: 'pat-both', fullName: 'María', phoneE164: '+5215512345678', email: 'maria@example.com',
    });

    const res = await POST(new Request('http://localhost/api/admin/patients', {
      method: 'POST',
      body: JSON.stringify({ fullName: 'María', phoneE164: '+5215512345678', email: 'maria@example.com' }),
    }));

    expect(res.status).toBe(201);
    expect(createPatient).toHaveBeenCalledWith({
      fullName: 'María', phoneE164: '+5215512345678', email: 'maria@example.com', notes: undefined,
    });
  });

  it('returns 400 for invalid input', async () => {
    (createPatient as ListPageMock).mockRejectedValue(
      new ValidationError('phoneE164', 'Invalid phoneE164')
    );

    const res = await POST(
      new Request('http://localhost/api/admin/patients', {
        method: 'POST',
        body: JSON.stringify({ fullName: 'Juan', phoneE164: 'bad' }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('invalid_request');
    expect(body.field).toBe('phoneE164');
  });

  it('returns 409 on conflict', async () => {
    (createPatient as ListPageMock).mockRejectedValue(
      new ConflictError('Phone already registered')
    );

    const res = await POST(
      new Request('http://localhost/api/admin/patients', {
        method: 'POST',
        body: JSON.stringify({ fullName: 'Juan', phoneE164: '+5215587654321' }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe('conflict');
  });
});
