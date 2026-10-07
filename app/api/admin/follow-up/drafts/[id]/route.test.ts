import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATCH, dynamic } from './route';
import { UnauthorizedError } from '@/lib/supabase/auth';
import { ConflictError, NotFoundError } from '@/lib/admin/errors';
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

vi.mock('@/lib/admin/follow-up/drafts', () => ({
  transitionFollowUpDraft: vi.fn(),
  updateFollowUpDraftBody: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import {
  transitionFollowUpDraft,
  updateFollowUpDraftBody,
} from '@/lib/admin/follow-up/drafts';

const USER = { id: '990e8400-e29b-41d4-a716-446655440000', email: 'a@b.c' };
const DRAFT_ID = '770e8400-e29b-41d4-a716-446655440000';
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    patientId: PATIENT_ID,
    body: 'Hola María, seguimos a tus órdenes.',
    templateName: 'seguimiento_paciente',
    status: 'approved' as const,
    dedupKey: `follow-up-draft:${PATIENT_ID}:2026-10-03`,
    providerMessageId: null,
    errorMessage: null,
    approvedBy: USER.id,
    approvedAt: '2026-10-03T17:10:00.000Z',
    editedBy: null,
    editedAt: null,
    sentAt: null,
    createdBy: USER.id,
    createdAt: '2026-10-03T17:00:00.000Z',
    updatedAt: '2026-10-03T17:10:00.000Z',
    ...overrides,
  };
}

function patchDraft(id: string, body: unknown): Promise<Response> {
  return PATCH(
    new Request(`http://localhost/api/admin/follow-up/drafts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

describe('PATCH /api/admin/follow-up/drafts/[id]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
    (transitionFollowUpDraft as ReturnType<typeof vi.fn>).mockResolvedValue(
      draftRow()
    );
    (updateFollowUpDraftBody as ReturnType<typeof vi.fn>).mockResolvedValue(
      draftRow({
        status: 'draft',
        approvedBy: null,
        approvedAt: null,
        editedBy: USER.id,
        editedAt: '2026-10-03T17:20:00.000Z',
        body: 'Hola María, te esperamos para revisar tu plan.',
      })
    );
  });

  it('is force-dynamic', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('returns 401 without session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );
    const res = await patchDraft(DRAFT_ID, { status: 'approved' });
    expect(res.status).toBe(401);
    expect(transitionFollowUpDraft).not.toHaveBeenCalled();
  });

  it('approves a draft and records the authenticated user', async () => {
    const res = await patchDraft(DRAFT_ID, { status: 'approved' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.draft.status).toBe('approved');
    expect(transitionFollowUpDraft).toHaveBeenCalledWith({
      id: DRAFT_ID,
      status: 'approved',
      userId: USER.id,
      now: expect.any(Date),
    });
  });

  it('rejects a draft without sending it', async () => {
    (transitionFollowUpDraft as ReturnType<typeof vi.fn>).mockResolvedValue(
      draftRow({ status: 'rejected', approvedBy: null, approvedAt: null })
    );
    const res = await patchDraft(DRAFT_ID, { status: 'rejected' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.draft.status).toBe('rejected');
    expect(transitionFollowUpDraft).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected' })
    );
  });

  it('returns 400 for an unknown transition status', async () => {
    const res = await patchDraft(DRAFT_ID, { status: 'sent' });
    expect(res.status).toBe(400);
    expect(transitionFollowUpDraft).not.toHaveBeenCalled();
  });

  it('returns 409 when the draft is not in draft status', async () => {
    (transitionFollowUpDraft as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ConflictError('Follow-up draft is already sent.')
    );
    const res = await patchDraft(DRAFT_ID, { status: 'approved' });
    expect(res.status).toBe(409);
  });

  it('returns 404 when the draft does not exist', async () => {
    (transitionFollowUpDraft as ReturnType<typeof vi.fn>).mockRejectedValue(
      new NotFoundError('Follow-up draft')
    );
    const res = await patchDraft(DRAFT_ID, { status: 'approved' });
    expect(res.status).toBe(404);
  });

  it("edits the body with { action: 'edit' }, persisting text + audit and keeping draft", async () => {
    const editedBody =
      'Hola María, te esperamos para revisar tu plan de tratamiento.';
    (updateFollowUpDraftBody as ReturnType<typeof vi.fn>).mockResolvedValue(
      draftRow({
        status: 'draft',
        approvedBy: null,
        approvedAt: null,
        body: editedBody,
        editedBy: USER.id,
        editedAt: '2026-10-03T17:20:00.000Z',
      })
    );

    const res = await patchDraft(DRAFT_ID, { action: 'edit', body: editedBody });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.draft.status).toBe('draft');
    expect(payload.draft.body).toBe(editedBody);
    expect(payload.draft.editedBy).toBe(USER.id);
    expect(updateFollowUpDraftBody).toHaveBeenCalledWith({
      id: DRAFT_ID,
      body: editedBody,
      userId: USER.id,
      now: expect.any(Date),
    });
    // La edición no dispara transición ni envío.
    expect(transitionFollowUpDraft).not.toHaveBeenCalled();
  });

  it('returns 400 without writing when the edited text violates a guardrail', async () => {
    (updateFollowUpDraftBody as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ValidationError('body', 'Draft body contains a forbidden phrase')
    );

    const res = await patchDraft(DRAFT_ID, {
      action: 'edit',
      body: 'Precio $500 por tu revisión.',
    });

    expect(res.status).toBe(400);
    expect(transitionFollowUpDraft).not.toHaveBeenCalled();
  });

  it('returns 409 without writing when the edited draft is not in draft status', async () => {
    (updateFollowUpDraftBody as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ConflictError('Follow-up draft is already sent; only draft can be edited.')
    );

    const res = await patchDraft(DRAFT_ID, {
      action: 'edit',
      body: 'Texto válido de seguimiento.',
    });

    expect(res.status).toBe(409);
    expect(transitionFollowUpDraft).not.toHaveBeenCalled();
  });

  it('returns 400 for an edit without a usable body', async () => {
    const res = await patchDraft(DRAFT_ID, { action: 'edit', body: '   ' });

    expect(res.status).toBe(400);
    expect(updateFollowUpDraftBody).not.toHaveBeenCalled();
    expect(transitionFollowUpDraft).not.toHaveBeenCalled();
  });

  it('returns 400 when the payload has neither status nor action', async () => {
    const res = await patchDraft(DRAFT_ID, {});

    expect(res.status).toBe(400);
    expect(updateFollowUpDraftBody).not.toHaveBeenCalled();
    expect(transitionFollowUpDraft).not.toHaveBeenCalled();
  });

  it('returns 400 for an unknown action', async () => {
    const res = await patchDraft(DRAFT_ID, {
      action: 'regenerate',
      body: 'Texto válido de seguimiento.',
    });

    expect(res.status).toBe(400);
    expect(updateFollowUpDraftBody).not.toHaveBeenCalled();
    expect(transitionFollowUpDraft).not.toHaveBeenCalled();
  });
});
