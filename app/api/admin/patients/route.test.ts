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

vi.mock('@/lib/admin/patients', () => ({
  listPatients: vi.fn(),
  createPatient: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import { createPatient, listPatients } from '@/lib/admin/patients';

const USER = { id: 'user-1', email: 'a@b.c' };

describe('GET /api/admin/patients', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await GET(new Request('http://localhost/api/admin/patients'));

    expect(res.status).toBe(401);
    expect(listPatients).not.toHaveBeenCalled();
  });

  it('lists patients', async () => {
    (listPatients as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'pat-1', fullName: 'María', phoneE164: '+5215512345678' },
    ]);

    const res = await GET(new Request('http://localhost/api/admin/patients'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.patients).toHaveLength(1);
    expect(body.patients[0].fullName).toBe('María');
  });

  it('returns 500 when the service throws', async () => {
    (listPatients as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('db down')
    );

    const res = await GET(new Request('http://localhost/api/admin/patients'));

    expect(res.status).toBe(500);
  });
});

describe('POST /api/admin/patients', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('creates a patient', async () => {
    (createPatient as ReturnType<typeof vi.fn>).mockResolvedValue({
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

  it('returns 400 for invalid input', async () => {
    (createPatient as ReturnType<typeof vi.fn>).mockRejectedValue(
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
    (createPatient as ReturnType<typeof vi.fn>).mockRejectedValue(
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
