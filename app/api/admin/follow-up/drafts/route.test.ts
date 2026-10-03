import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST, dynamic } from './route';
import { UnauthorizedError } from '@/lib/supabase/auth';

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
  listDailyFollowUpCases: vi.fn(),
  currentRoundDate: vi.fn(),
}));

vi.mock('@/lib/admin/follow-up/drafts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/admin/follow-up/drafts')>();
  return { ...actual, createFollowUpDraft: vi.fn() };
});

vi.mock('@/lib/wcc-follow-up-drafts', () => ({
  getWccFollowUpDrafts: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import {
  currentRoundDate,
  listDailyFollowUpCases,
} from '@/lib/admin/follow-up/follow-up';
import { createFollowUpDraft } from '@/lib/admin/follow-up/drafts';
import { getWccFollowUpDrafts } from '@/lib/wcc-follow-up-drafts';

const USER = { id: '990e8400-e29b-41d4-a716-446655440000', email: 'a@b.c' };
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const ROUND_DATE = '2026-10-03';

const CASE = {
  patientId: PATIENT_ID,
  patientName: 'María García',
  patientPhoneE164: '+5215512345678',
  reason: 'no_show' as const,
  reasonLabel: 'Cita no atendida',
  reasonDate: '2026-09-01T18:00:00.000Z',
  roundDate: ROUND_DATE,
  sourceAppointmentId: '550e8400-e29b-41d4-a716-446655440010',
  sourcePlanId: null,
};

const DRAFT = {
  id: '770e8400-e29b-41d4-a716-446655440000',
  patientId: PATIENT_ID,
  body: 'Hola María, notamos que no pudimos atenderte en tu cita anterior.',
  templateName: 'seguimiento_paciente',
  status: 'draft' as const,
  dedupKey: `follow-up-draft:${PATIENT_ID}:${ROUND_DATE}`,
  providerMessageId: null,
  errorMessage: null,
  approvedBy: null,
  approvedAt: null,
  sentAt: null,
  createdBy: USER.id,
  createdAt: '2026-10-03T17:00:00.000Z',
  updatedAt: '2026-10-03T17:00:00.000Z',
};

function postDraft(body: unknown): Promise<Response> {
  return POST(
    new Request('http://localhost/api/admin/follow-up/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

describe('/api/admin/follow-up/drafts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
    (currentRoundDate as ReturnType<typeof vi.fn>).mockReturnValue(ROUND_DATE);
    (listDailyFollowUpCases as ReturnType<typeof vi.fn>).mockResolvedValue([
      CASE,
    ]);
    (createFollowUpDraft as ReturnType<typeof vi.fn>).mockResolvedValue({
      draft: DRAFT,
      created: true,
    });
    (getWccFollowUpDrafts as ReturnType<typeof vi.fn>).mockResolvedValue({
      isSupabaseConfigured: true,
      isConfiguredButUnavailable: false,
      drafts: [],
    });
  });

  it('is force-dynamic', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('GET returns 401 without session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );
    const res = await GET(
      new Request('http://localhost/api/admin/follow-up/drafts')
    );
    expect(res.status).toBe(401);
  });

  it('GET returns the drafts for the WCC', async () => {
    (getWccFollowUpDrafts as ReturnType<typeof vi.fn>).mockResolvedValue({
      isSupabaseConfigured: true,
      isConfiguredButUnavailable: false,
      drafts: [{ id: DRAFT.id, patientName: 'María García' }],
    });
    const res = await GET(
      new Request('http://localhost/api/admin/follow-up/drafts')
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.drafts).toHaveLength(1);
    expect(body.drafts[0].patientName).toBe('María García');
    expect(getWccFollowUpDrafts).toHaveBeenCalledWith(undefined);
  });

  it('GET forwards the optional status filter', async () => {
    await GET(
      new Request('http://localhost/api/admin/follow-up/drafts?status=approved')
    );
    expect(getWccFollowUpDrafts).toHaveBeenCalledWith({ status: 'approved' });
  });

  it('GET returns 400 for an unknown status filter', async () => {
    const res = await GET(
      new Request('http://localhost/api/admin/follow-up/drafts?status=bogus')
    );
    expect(res.status).toBe(400);
    expect(getWccFollowUpDrafts).not.toHaveBeenCalled();
  });

  it('POST returns 401 without session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );
    const res = await postDraft({ patientId: PATIENT_ID });
    expect(res.status).toBe(401);
    expect(createFollowUpDraft).not.toHaveBeenCalled();
  });

  it('POST generates and persists a deterministic draft (201)', async () => {
    const res = await postDraft({ patientId: PATIENT_ID });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.draft.status).toBe('draft');
    expect(createFollowUpDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: PATIENT_ID,
        userId: USER.id,
        roundDate: ROUND_DATE,
        templateName: 'seguimiento_paciente',
        body: expect.stringContaining('no pudimos atenderte'),
      })
    );
    expect(listDailyFollowUpCases).toHaveBeenCalledWith({
      now: expect.any(Date),
    });
  });

  it('POST is idempotent per patient and round: a second call does not duplicate', async () => {
    (createFollowUpDraft as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      draft: DRAFT,
      created: true,
    });
    (createFollowUpDraft as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      draft: DRAFT,
      created: false,
    });

    const first = await postDraft({ patientId: PATIENT_ID });
    const second = await postDraft({ patientId: PATIENT_ID });

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(createFollowUpDraft).toHaveBeenCalledTimes(2);
    expect(createFollowUpDraft).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ roundDate: ROUND_DATE, patientId: PATIENT_ID })
    );
  });

  it('POST returns 400 without persisting when a text guardrail fails', async () => {
    (listDailyFollowUpCases as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...CASE, patientName: 'Precio $500 María' },
    ]);
    const res = await postDraft({ patientId: PATIENT_ID });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe('invalid_request');
    expect(createFollowUpDraft).not.toHaveBeenCalled();
  });

  it('POST returns 400 for a non-UUID patientId', async () => {
    const res = await postDraft({ patientId: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(createFollowUpDraft).not.toHaveBeenCalled();
  });

  it('POST returns 404 when the patient is not in today list', async () => {
    (listDailyFollowUpCases as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const res = await postDraft({ patientId: PATIENT_ID });
    expect(res.status).toBe(404);
    expect(createFollowUpDraft).not.toHaveBeenCalled();
  });
});
