import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST, dynamic } from './route';
import { UnauthorizedError } from '@/lib/supabase/auth';
import { ValidationError } from '@/lib/admin/validate';

vi.mock('@/lib/supabase/auth', () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class extends Error {
    constructor() {
      super('Unauthorized');
      this.name = 'UnauthorizedError';
    }
  },
}));

vi.mock('@/lib/admin/follow-up/follow-up', () => ({
  markFollowUpContact: vi.fn(),
}));

vi.mock('@/lib/admin/patients', () => ({
  getPatient: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import { markFollowUpContact } from '@/lib/admin/follow-up/follow-up';
import { getPatient } from '@/lib/admin/patients';

const USER = { id: '990e8400-e29b-41d4-a716-446655440000', email: 'a@b.c' };
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const CONTACT = {
  id: '650e8400-e29b-41d4-a716-446655440000',
  patientId: PATIENT_ID,
  roundDate: '2026-10-03',
  status: 'contacted',
  contactedAt: '2026-10-03T17:00:00.000Z',
  dismissedAt: null,
  note: null,
  createdBy: USER.id,
  createdAt: '2026-10-03T17:00:00.000Z',
  updatedAt: '2026-10-03T17:00:00.000Z',
};

function post(body: unknown): Promise<Response> {
  return POST(
    new Request('http://localhost/api/admin/follow-up/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

describe('/api/admin/follow-up/contacts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
    (getPatient as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: PATIENT_ID,
      fullName: 'María García',
    });
    (markFollowUpContact as ReturnType<typeof vi.fn>).mockResolvedValue(CONTACT);
  });

  it('is force-dynamic', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('POST returns 401 without session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );
    const res = await post({ patientId: PATIENT_ID, status: 'contacted' });
    expect(res.status).toBe(401);
    expect(markFollowUpContact).not.toHaveBeenCalled();
  });

  it('POST marks a patient as contacted', async () => {
    const res = await post({ patientId: PATIENT_ID, status: 'contacted' });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.contact).toMatchObject({ status: 'contacted' });
    expect(markFollowUpContact).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: PATIENT_ID,
        status: 'contacted',
        userId: USER.id,
        now: expect.any(Date),
      })
    );
  });

  it('POST marks a patient as dismissed', async () => {
    (markFollowUpContact as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...CONTACT,
      status: 'dismissed',
      dismissedAt: '2026-10-03T17:05:00.000Z',
    });
    const res = await post({ patientId: PATIENT_ID, status: 'dismissed' });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.contact.status).toBe('dismissed');
  });

  it('POST persists the optional note', async () => {
    await post({
      patientId: PATIENT_ID,
      status: 'contacted',
      note: 'Segunda llamada',
    });
    expect(markFollowUpContact).toHaveBeenCalledWith(
      expect.objectContaining({ note: 'Segunda llamada' })
    );
  });

  it('POST returns 400 for an invalid status', async () => {
    const res = await post({ patientId: PATIENT_ID, status: 'maybe' });
    expect(res.status).toBe(400);
    expect(markFollowUpContact).not.toHaveBeenCalled();
  });

  it('POST returns 400 for a non-UUID patientId', async () => {
    const res = await post({ patientId: 'not-a-uuid', status: 'contacted' });
    expect(res.status).toBe(400);
    expect(markFollowUpContact).not.toHaveBeenCalled();
  });

  it('POST returns 404 when the patient does not exist', async () => {
    (getPatient as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await post({ patientId: PATIENT_ID, status: 'contacted' });
    expect(res.status).toBe(404);
    expect(markFollowUpContact).not.toHaveBeenCalled();
  });

  it('POST forwards a long note without crashing', async () => {
    const longNote = 'n'.repeat(1500);
    const res = await post({
      patientId: PATIENT_ID,
      status: 'contacted',
      note: longNote,
    });
    expect(res.status).toBe(201);
    expect(markFollowUpContact).toHaveBeenCalledWith(
      expect.objectContaining({ note: longNote })
    );
  });

  it('POST maps a persistence validation error to 400', async () => {
    (markFollowUpContact as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ValidationError('note', 'Invalid note')
    );
    const res = await post({
      patientId: PATIENT_ID,
      status: 'contacted',
      note: 'n'.repeat(1500),
    });
    expect(res.status).toBe(400);
    expect(res.status).not.toBe(500);
  });
});
