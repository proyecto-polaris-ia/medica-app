import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { sendWhatsAppTemplateMessage } from '@/lib/whatsapp/client';
import { ConflictError, NotFoundError } from '@/lib/admin/errors';
import { ValidationError } from '@/lib/admin/validate';
import { sendFollowUpDraft } from '../send-follow-up-draft';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppTemplateMessage: vi.fn(),
}));

const DRAFT_ID = '770e8400-e29b-41d4-a716-446655440000';
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const USER_ID = '990e8400-e29b-41d4-a716-446655440000';
const PHONE = '+5215512345678';

type QueryResult = { data: unknown; error: { message?: string } | null };

interface MockQuery {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  _result: QueryResult;
  _single: QueryResult;
  _maybeSingle: QueryResult;
}

function buildQuery(): MockQuery {
  const query: MockQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    _result: { data: [], error: null },
    _single: { data: null, error: null },
    _maybeSingle: { data: null, error: null },
  };
  Object.defineProperty(query, 'then', {
    get() {
      return (onFulfilled: (value: QueryResult) => unknown) =>
        Promise.resolve(query._result).then(onFulfilled);
    },
  });
  query.maybeSingle.mockImplementation(() =>
    Promise.resolve(query._maybeSingle)
  );
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
    body: 'Hola María, notamos que no pudimos atenderte en tu cita anterior.',
    template_name: 'seguimiento_paciente',
    status: 'approved',
    dedup_key: `follow-up-draft:${PATIENT_ID}:2026-10-03`,
    provider_message_id: null,
    error_message: null,
    approved_by: USER_ID,
    approved_at: '2026-10-03T17:10:00.000Z',
    sent_at: null,
    created_by: USER_ID,
    created_at: '2026-10-03T17:00:00.000Z',
    updated_at: '2026-10-03T17:10:00.000Z',
    ...overrides,
  };
}

type Tables = {
  drafts: MockQuery;
  patients: MockQuery;
  contacts: MockQuery;
  conversations: MockQuery;
  messages: MockQuery;
};

function buildTables(overrides: Partial<Tables> = {}): Tables {
  const drafts = overrides.drafts ?? buildQuery();
  drafts._maybeSingle = { data: draftRow(), error: null };
  drafts._single = {
    data: draftRow({
      status: 'sent',
      provider_message_id: 'wamid.follow-up-1',
      sent_at: '2026-10-03T17:15:00.000Z',
    }),
    error: null,
  };

  const patients = overrides.patients ?? buildQuery();
  patients._maybeSingle = {
    data: { id: PATIENT_ID, full_name: 'María López', phone_e164: PHONE },
    error: null,
  };

  const contacts = overrides.contacts ?? buildQuery();
  contacts._maybeSingle = { data: { id: 'contact-1' }, error: null };
  contacts._single = { data: { id: 'contact-1' }, error: null };

  const conversations = overrides.conversations ?? buildQuery();
  conversations._maybeSingle = { data: { id: 'conversation-1' }, error: null };
  conversations._single = { data: { id: 'conversation-1' }, error: null };

  const messages = overrides.messages ?? buildQuery();
  messages._result = { data: null, error: null };

  return { drafts, patients, contacts, conversations, messages };
}

function wire(tables: Tables) {
  return mockAdminByTable({
    follow_up_message_drafts: tables.drafts,
    patients: tables.patients,
    whatsapp_contacts: tables.contacts,
    whatsapp_conversations: tables.conversations,
    whatsapp_messages: tables.messages,
  });
}

describe('sendFollowUpDraft', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(sendWhatsAppTemplateMessage).mockResolvedValue({
      ok: true,
      status: 200,
      providerMessageId: 'wamid.follow-up-1',
    });
  });

  it('refuses to send a draft that is not approved', async () => {
    const tables = buildTables();
    tables.drafts._maybeSingle = {
      data: draftRow({ status: 'draft' }),
      error: null,
    };
    wire(tables);

    await expect(
      sendFollowUpDraft({ draftId: DRAFT_ID, userId: USER_ID })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(sendWhatsAppTemplateMessage).not.toHaveBeenCalled();
    expect(tables.messages.upsert).not.toHaveBeenCalled();
  });

  it('refuses to send a rejected draft', async () => {
    const tables = buildTables();
    tables.drafts._maybeSingle = {
      data: draftRow({ status: 'rejected' }),
      error: null,
    };
    wire(tables);

    await expect(
      sendFollowUpDraft({ draftId: DRAFT_ID, userId: USER_ID })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(sendWhatsAppTemplateMessage).not.toHaveBeenCalled();
  });

  it('is an idempotent no-op when the draft is already sent', async () => {
    const tables = buildTables();
    tables.drafts._maybeSingle = {
      data: draftRow({
        status: 'sent',
        provider_message_id: 'wamid.follow-up-1',
      }),
      error: null,
    };
    wire(tables);

    const result = await sendFollowUpDraft({
      draftId: DRAFT_ID,
      userId: USER_ID,
    });

    expect(result.skipped).toBe(true);
    expect(result.sent).toBe(false);
    expect(sendWhatsAppTemplateMessage).not.toHaveBeenCalled();
    expect(tables.messages.upsert).not.toHaveBeenCalled();
    expect(tables.drafts.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the draft does not exist', async () => {
    const tables = buildTables();
    tables.drafts._maybeSingle = { data: null, error: null };
    wire(tables);

    await expect(
      sendFollowUpDraft({ draftId: DRAFT_ID, userId: USER_ID })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('re-validates the persisted body and never sends forbidden text', async () => {
    const tables = buildTables();
    tables.drafts._maybeSingle = {
      data: draftRow({ body: 'Tu precio es $500' }),
      error: null,
    };
    wire(tables);

    await expect(
      sendFollowUpDraft({ draftId: DRAFT_ID, userId: USER_ID })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(sendWhatsAppTemplateMessage).not.toHaveBeenCalled();
  });

  it('throws ValidationError when the patient has no phone number', async () => {
    const tables = buildTables();
    tables.patients._maybeSingle = {
      data: { id: PATIENT_ID, full_name: 'María López', phone_e164: null },
      error: null,
    };
    wire(tables);

    await expect(
      sendFollowUpDraft({ draftId: DRAFT_ID, userId: USER_ID })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(sendWhatsAppTemplateMessage).not.toHaveBeenCalled();
  });

  it('sends the HSM template, records the outbound message and marks the draft sent', async () => {
    const tables = buildTables();
    wire(tables);

    const result = await sendFollowUpDraft({
      draftId: DRAFT_ID,
      userId: USER_ID,
    });

    expect(sendWhatsAppTemplateMessage).toHaveBeenCalledWith({
      to: PHONE,
      templateName: 'seguimiento_paciente',
      languageCode: 'es_MX',
      bodyParameters: [{ type: 'text', text: 'María' }],
    });

    expect(tables.messages.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: 'conversation-1',
        contact_id: 'contact-1',
        whatsapp_message_id: 'wamid.follow-up-1',
        direction: 'outbound',
        message_type: 'template',
        body: 'Hola María, notamos que no pudimos atenderte en tu cita anterior.',
        payload: { purpose: 'follow_up', draftId: DRAFT_ID },
      }),
      { onConflict: 'whatsapp_message_id', ignoreDuplicates: true }
    );

    expect(tables.drafts.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'sent',
        provider_message_id: 'wamid.follow-up-1',
        error_message: null,
      })
    );
    expect(result.sent).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.draft.status).toBe('sent');
  });

  it('uses the idempotency key as whatsapp_message_id when the provider returns no id', async () => {
    vi.mocked(sendWhatsAppTemplateMessage).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });
    const tables = buildTables();
    wire(tables);

    await sendFollowUpDraft({ draftId: DRAFT_ID, userId: USER_ID });

    expect(tables.messages.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        whatsapp_message_id: `follow-up-draft:${DRAFT_ID}`,
      }),
      { onConflict: 'whatsapp_message_id', ignoreDuplicates: true }
    );
  });

  it('persists exactly the normalized body that was re-validated before sending', async () => {
    const tables = buildTables();
    tables.drafts._maybeSingle = {
      data: draftRow({ body: 'Hola   María,\n\nseguimos a tus órdenes.  ' }),
      error: null,
    };
    wire(tables);

    await sendFollowUpDraft({ draftId: DRAFT_ID, userId: USER_ID });

    expect(tables.messages.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Hola María, seguimos a tus órdenes.' }),
      expect.anything()
    );
  });

  it('creates a manual contact and an open conversation when they do not exist', async () => {
    const tables = buildTables();
    tables.contacts._maybeSingle = { data: null, error: null };
    tables.contacts._single = { data: { id: 'contact-new' }, error: null };
    tables.conversations._maybeSingle = { data: null, error: null };
    tables.conversations._single = {
      data: { id: 'conversation-new' },
      error: null,
    };
    wire(tables);

    await sendFollowUpDraft({ draftId: DRAFT_ID, userId: USER_ID });

    expect(tables.contacts.insert).toHaveBeenCalledWith(
      expect.objectContaining({ phone_e164: PHONE, source: 'manual' })
    );
    expect(tables.conversations.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_id: 'contact-new',
        channel: 'whatsapp',
        status: 'open',
      })
    );
    expect(tables.messages.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_id: 'contact-new',
        conversation_id: 'conversation-new',
      }),
      expect.anything()
    );
  });

  it('reuses an existing open conversation without inserting another one', async () => {
    const tables = buildTables();
    wire(tables);

    await sendFollowUpDraft({ draftId: DRAFT_ID, userId: USER_ID });

    expect(tables.conversations.insert).not.toHaveBeenCalled();
  });

  it('records sent_failed with the transport error when the send fails', async () => {
    vi.mocked(sendWhatsAppTemplateMessage).mockResolvedValueOnce({
      ok: false,
      status: 500,
      error: 'WhatsApp Cloud API request failed with status 500.',
    });
    const tables = buildTables();
    tables.drafts._single = {
      data: draftRow({
        status: 'sent_failed',
        error_message: 'WhatsApp Cloud API request failed with status 500.',
      }),
      error: null,
    };
    wire(tables);

    const result = await sendFollowUpDraft({
      draftId: DRAFT_ID,
      userId: USER_ID,
    });

    expect(tables.messages.upsert).not.toHaveBeenCalled();
    expect(tables.drafts.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'sent_failed',
        error_message: expect.stringContaining('status 500'),
      })
    );
    expect(result.sent).toBe(false);
    expect(result.skipped).toBe(false);
    expect(result.error).toContain('status 500');
    expect(result.draft.status).toBe('sent_failed');
  });
});
