import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST, dynamic } from './route';
import { UnauthorizedError } from '@/lib/supabase/auth';
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

vi.mock('@/lib/follow-up/send-follow-up-draft', () => ({
  sendFollowUpDraft: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import { sendFollowUpDraft } from '@/lib/follow-up/send-follow-up-draft';

const USER = { id: '990e8400-e29b-41d4-a716-446655440000', email: 'a@b.c' };
const DRAFT_ID = '770e8400-e29b-41d4-a716-446655440000';
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';

function sentDraft() {
  return {
    id: DRAFT_ID,
    patientId: PATIENT_ID,
    body: 'Hola María, seguimos a tus órdenes.',
    templateName: 'seguimiento_paciente',
    status: 'sent' as const,
    dedupKey: `follow-up-draft:${PATIENT_ID}:2026-10-03`,
    providerMessageId: 'wamid.follow-up-1',
    errorMessage: null,
    approvedBy: USER.id,
    approvedAt: '2026-10-03T17:10:00.000Z',
    sentAt: '2026-10-03T17:15:00.000Z',
    createdBy: USER.id,
    createdAt: '2026-10-03T17:00:00.000Z',
    updatedAt: '2026-10-03T17:15:00.000Z',
  };
}

function postSend(id: string): Promise<Response> {
  return POST(
    new Request(`http://localhost/api/admin/follow-up/drafts/${id}/send`, {
      method: 'POST',
    }),
    { params: Promise.resolve({ id }) }
  );
}

describe('POST /api/admin/follow-up/drafts/[id]/send', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
    (sendFollowUpDraft as ReturnType<typeof vi.fn>).mockResolvedValue({
      draft: sentDraft(),
      sent: true,
      skipped: false,
      providerMessageId: 'wamid.follow-up-1',
    });
  });

  it('is force-dynamic', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('returns 401 without session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );
    const res = await postSend(DRAFT_ID);
    expect(res.status).toBe(401);
    expect(sendFollowUpDraft).not.toHaveBeenCalled();
  });

  it('sends an approved draft and returns it as sent', async () => {
    const res = await postSend(DRAFT_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.draft.status).toBe('sent');
    expect(sendFollowUpDraft).toHaveBeenCalledWith({
      draftId: DRAFT_ID,
      userId: USER.id,
    });
  });

  it('returns 409 and does not send a draft/rejected draft', async () => {
    (sendFollowUpDraft as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ConflictError('Follow-up draft is draft; only approved can be sent.')
    );
    const res = await postSend(DRAFT_ID);
    expect(res.status).toBe(409);
  });

  it('is idempotent: a retry of an already sent draft returns 200 without a second send', async () => {
    (sendFollowUpDraft as ReturnType<typeof vi.fn>).mockResolvedValue({
      draft: sentDraft(),
      sent: false,
      skipped: true,
      providerMessageId: 'wamid.follow-up-1',
    });
    const res = await postSend(DRAFT_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.sent).toBe(false);
    expect(body.skipped).toBe(true);
  });

  it('returns 400 for a non-UUID id', async () => {
    const res = await postSend('not-a-uuid');
    expect(res.status).toBe(400);
    expect(sendFollowUpDraft).not.toHaveBeenCalled();
  });
});
