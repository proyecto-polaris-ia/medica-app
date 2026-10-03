import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { ConflictError, NotFoundError } from '../../errors';
import {
  buildDraftDedupKey,
  claimFollowUpDraftForSend,
  createFollowUpDraft,
  transitionFollowUpDraft,
} from '../drafts';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const USER_ID = '990e8400-e29b-41d4-a716-446655440000';
const DRAFT_ID = '770e8400-e29b-41d4-a716-446655440000';
const ROUND_DATE = '2026-10-03';

type QueryResult = { data: unknown; error: { message?: string } | null };

interface MockQuery {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  _result: QueryResult;
  _single: QueryResult;
}

function buildQuery(): MockQuery {
  const query: MockQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    _result: { data: [], error: null },
    _single: { data: null, error: null },
  };
  Object.defineProperty(query, 'then', {
    get() {
      return (onFulfilled: (value: QueryResult) => unknown) =>
        Promise.resolve(query._result).then(onFulfilled);
    },
  });
  query.maybeSingle.mockImplementation(() => Promise.resolve(query._single));
  query.single.mockImplementation(() => Promise.resolve(query._single));
  return query;
}

function mockAdminByTable(map: Record<string, MockQuery>) {
  const from = vi.fn((table: string) => {
    const q = map[table];
    if (!q) throw new Error(`Unexpected table query: ${table}`);
    return q;
  });
  (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({ from });
  return { from };
}

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    patient_id: PATIENT_ID,
    body: 'Hola María, seguimos a tus órdenes.',
    template_name: 'seguimiento_paciente',
    status: 'draft',
    dedup_key: buildDraftDedupKey(PATIENT_ID, ROUND_DATE),
    provider_message_id: null,
    error_message: null,
    approved_by: null,
    approved_at: null,
    sent_at: null,
    created_by: USER_ID,
    created_at: '2026-10-03T17:00:00.000Z',
    updated_at: '2026-10-03T17:00:00.000Z',
    ...overrides,
  };
}

describe('buildDraftDedupKey', () => {
  it('builds follow-up-draft:<patientId>:<roundDate>', () => {
    expect(buildDraftDedupKey(PATIENT_ID, ROUND_DATE)).toBe(
      `follow-up-draft:${PATIENT_ID}:${ROUND_DATE}`
    );
  });
});

describe('createFollowUpDraft', () => {
  beforeEach(() => vi.resetAllMocks());

  it('upserts on dedup_key with ignoreDuplicates and reports created=true', async () => {
    const drafts = buildQuery();
    drafts._result = { data: [draftRow()], error: null };
    mockAdminByTable({ follow_up_message_drafts: drafts });

    const result = await createFollowUpDraft({
      patientId: PATIENT_ID,
      userId: USER_ID,
      body: 'Hola María.',
      templateName: 'seguimiento_paciente',
      roundDate: ROUND_DATE,
    });

    expect(drafts.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        patient_id: PATIENT_ID,
        dedup_key: `follow-up-draft:${PATIENT_ID}:${ROUND_DATE}`,
        template_name: 'seguimiento_paciente',
        created_by: USER_ID,
      }),
      { onConflict: 'dedup_key', ignoreDuplicates: true }
    );
    expect(result.created).toBe(true);
    expect(result.draft.id).toBe(DRAFT_ID);
  });

  it('returns the existing draft without duplicating when the key already exists', async () => {
    const drafts = buildQuery();
    // `ignoreDuplicates: true` no devuelve la fila en conflicto.
    drafts._result = { data: [], error: null };
    drafts._single = { data: draftRow(), error: null };
    mockAdminByTable({ follow_up_message_drafts: drafts });

    const result = await createFollowUpDraft({
      patientId: PATIENT_ID,
      userId: USER_ID,
      body: 'Hola María.',
      templateName: 'seguimiento_paciente',
      roundDate: ROUND_DATE,
    });

    expect(result.created).toBe(false);
    expect(drafts.maybeSingle).toHaveBeenCalled();
    expect(result.draft.dedupKey).toBe(
      `follow-up-draft:${PATIENT_ID}:${ROUND_DATE}`
    );
  });
});

describe('transitionFollowUpDraft', () => {
  beforeEach(() => vi.resetAllMocks());

  it('approves a draft and persists approved_by/approved_at', async () => {
    const drafts = buildQuery();
    drafts._single = {
      data: draftRow({
        status: 'approved',
        approved_by: USER_ID,
        approved_at: '2026-10-03T17:10:00.000Z',
      }),
      error: null,
    };
    // Primera lectura (maybeSingle) devuelve el borrador en draft.
    drafts.maybeSingle
      .mockResolvedValueOnce({ data: draftRow(), error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    mockAdminByTable({ follow_up_message_drafts: drafts });

    const updated = await transitionFollowUpDraft({
      id: DRAFT_ID,
      status: 'approved',
      userId: USER_ID,
      now: new Date('2026-10-03T17:10:00.000Z'),
    });

    expect(drafts.update).toHaveBeenCalledWith({
      status: 'approved',
      approved_by: USER_ID,
      approved_at: '2026-10-03T17:10:00.000Z',
    });
    expect(updated.status).toBe('approved');
    expect(updated.approvedBy).toBe(USER_ID);
  });

  it('rejects a draft without approving it', async () => {
    const drafts = buildQuery();
    drafts.maybeSingle.mockResolvedValueOnce({ data: draftRow(), error: null });
    drafts._single = {
      data: draftRow({ status: 'rejected' }),
      error: null,
    };
    mockAdminByTable({ follow_up_message_drafts: drafts });

    const updated = await transitionFollowUpDraft({
      id: DRAFT_ID,
      status: 'rejected',
      userId: USER_ID,
    });

    expect(drafts.update).toHaveBeenCalledWith({
      status: 'rejected',
      approved_by: null,
      approved_at: null,
    });
    expect(updated.status).toBe('rejected');
  });

  it('throws ConflictError when the draft is not in draft status', async () => {
    const drafts = buildQuery();
    drafts.maybeSingle.mockResolvedValueOnce({
      data: draftRow({ status: 'sent' }),
      error: null,
    });
    mockAdminByTable({ follow_up_message_drafts: drafts });

    await expect(
      transitionFollowUpDraft({ id: DRAFT_ID, status: 'approved', userId: USER_ID })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(drafts.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the draft does not exist', async () => {
    const drafts = buildQuery();
    drafts.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    mockAdminByTable({ follow_up_message_drafts: drafts });

    await expect(
      transitionFollowUpDraft({ id: DRAFT_ID, status: 'approved', userId: USER_ID })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('claimFollowUpDraftForSend', () => {
  it('claims approved as sending and returns null when it loses the race', async () => {
    const drafts = buildQuery();
    drafts.maybeSingle.mockResolvedValue({ data: draftRow({ status: 'sending' }), error: null });
    mockAdminByTable({ follow_up_message_drafts: drafts });
    expect((await claimFollowUpDraftForSend(DRAFT_ID))?.status).toBe('sending');
    expect(drafts.eq).toHaveBeenCalledWith('status', 'approved');
    drafts.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await claimFollowUpDraftForSend(DRAFT_ID)).toBeNull();
  });
});
