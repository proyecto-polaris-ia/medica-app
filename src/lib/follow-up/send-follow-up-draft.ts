import { getSupabaseAdmin } from '@/lib/supabase/server';
import { ConflictError, NotFoundError } from '@/lib/admin/errors';
import { ValidationError } from '@/lib/admin/validate';
import { followUpFirstName, validateFollowUpDraftText } from '@/lib/admin/follow-up/draft';
import {
  FOLLOW_UP_DRAFT_DEDUP_PREFIX,
  getFollowUpDraftById,
  markFollowUpDraftSent,
  markFollowUpDraftSentFailed,
} from '@/lib/admin/follow-up/drafts';
import type { FollowUpDraft } from '@/lib/admin/follow-up/types';
import {
  sendWhatsAppTemplateMessage,
  type WhatsAppSendResult,
} from '@/lib/whatsapp/client';

/**
 * Envío server-only de un borrador de seguimiento aprobado.
 *
 * El envío es una acción explícita del usuario autenticado (POST) que exige
 * `status = 'approved'`; no hay cron, queue ni job que invoque esta función.
 * Usa el transporte HSM existente y es idempotente por clave:
 * `whatsapp_message_id = providerMessageId ?? follow-up-draft:<draftId>` con
 * `ignoreDuplicates`, de modo que un reintento no duplica el saliente.
 *
 * Nota: `insertFollowUpOutboundMessage` vive aquí (no en
 * `src/lib/whatsapp/store.ts`) porque ese archivo está congelado para esta fase;
 * encapsula la única escritura saliente nueva reutilizando el ledger
 * `whatsapp_messages` ya especificado por `whatsapp-inbound-automation`.
 */

const DRAFT_IDEMPOTENCY_PREFIX = FOLLOW_UP_DRAFT_DEDUP_PREFIX;

export type SendFollowUpDraftResult = {
  draft: FollowUpDraft;
  sent: boolean;
  skipped: boolean;
  providerMessageId?: string;
  error?: string;
};

type PhoneRow = { id: string; full_name: string | null; phone_e164: string | null };

async function loadPatient(patientId: string): Promise<PhoneRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('patients')
    .select('id, full_name, phone_e164')
    .eq('id', patientId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as unknown as PhoneRow | null) ?? null;
}

/** Asegura un `whatsapp_contacts` por teléfono (`source = 'manual'`). */
async function ensureContact(phone: string, now: string): Promise<string> {
  const existing = await getSupabaseAdmin()
    .from('whatsapp_contacts')
    .select('id')
    .eq('phone_e164', phone)
    .maybeSingle();

  if (existing.error) throw new Error(existing.error.message);
  if (existing.data?.id) return existing.data.id as string;

  const created = await getSupabaseAdmin()
    .from('whatsapp_contacts')
    .insert({
      phone_e164: phone,
      source: 'manual',
      last_seen_at: now,
      last_message_at: now,
    })
    .select('id')
    .single();

  if (created.error || !created.data) {
    throw new Error(created.error?.message ?? 'Could not create WhatsApp contact');
  }
  return created.data.id as string;
}

/** Asegura una `whatsapp_conversations` abierta para el contacto. */
async function ensureOpenConversation(
  contactId: string,
  now: string
): Promise<string> {
  const existing = await getSupabaseAdmin()
    .from('whatsapp_conversations')
    .select('id')
    .eq('contact_id', contactId)
    .eq('channel', 'whatsapp')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.error) throw new Error(existing.error.message);
  if (existing.data?.id) return existing.data.id as string;

  const created = await getSupabaseAdmin()
    .from('whatsapp_conversations')
    .insert({
      contact_id: contactId,
      channel: 'whatsapp',
      status: 'open',
      last_message_at: now,
    })
    .select('id')
    .single();

  if (created.error || !created.data) {
    throw new Error(
      created.error?.message ?? 'Could not create WhatsApp conversation'
    );
  }
  return created.data.id as string;
}

/** Clave de idempotencia del saliente de un borrador. */
export function buildFollowUpDraftIdempotencyKey(draftId: string): string {
  return `${DRAFT_IDEMPOTENCY_PREFIX}:${draftId}`;
}

/**
 * Inserta el saliente del seguimiento en `whatsapp_messages`.
 *
 * `whatsapp_message_id = providerMessageId ?? idempotencyKey` con
 * `ignoreDuplicates` hace el reintento idempotente aunque el proveedor no
 * devuelva id.
 */
export async function insertFollowUpOutboundMessage(input: {
  conversationId: string;
  contactId: string;
  idempotencyKey: string;
  body: string;
  draftId: string;
  providerMessageId?: string;
  now?: Date;
}): Promise<void> {
  const now = (input.now ?? new Date()).toISOString();

  const { error } = await getSupabaseAdmin()
    .from('whatsapp_messages')
    .upsert(
      {
        conversation_id: input.conversationId,
        contact_id: input.contactId,
        whatsapp_message_id: input.providerMessageId ?? input.idempotencyKey,
        direction: 'outbound',
        message_type: 'template',
        body: input.body,
        payload: { purpose: 'follow_up', draftId: input.draftId },
        status: 'sent',
        occurred_at: now,
      },
      { onConflict: 'whatsapp_message_id', ignoreDuplicates: true }
    );

  if (error) throw new Error(error.message);
}

/**
 * Envía un borrador aprobado por el transporte HSM existente.
 *
 * - `draft`/`rejected` → `ConflictError` (nunca se envía).
 * - `sent` → no-op idempotente.
 * - revalida el `body` con los guardrails antes de enviar.
 * - teléfono ausente → `ValidationError` (no se inventa destino).
 * - fallo del transporte → borrador `sent_failed` y `error_message` visible.
 */
export async function sendFollowUpDraft(input: {
  draftId: string;
  userId: string;
}): Promise<SendFollowUpDraftResult> {
  const draft = await getFollowUpDraftById(input.draftId);
  if (!draft) {
    throw new NotFoundError('Follow-up draft');
  }

  if (draft.status === 'sent') {
    return {
      draft,
      sent: false,
      skipped: true,
      providerMessageId: draft.providerMessageId ?? undefined,
    };
  }

  if (draft.status !== 'approved') {
    throw new ConflictError(
      `Follow-up draft is ${draft.status}; only approved drafts can be sent.`
    );
  }

  const body = validateFollowUpDraftText(draft.body);

  const patient = await loadPatient(draft.patientId);
  const phone = patient?.phone_e164?.trim();
  if (!phone) {
    throw new ValidationError('phone', 'Patient has no phone number');
  }

  const now = new Date().toISOString();
  const contactId = await ensureContact(phone, now);
  const conversationId = await ensureOpenConversation(contactId, now);

  const sendResult: WhatsAppSendResult = await sendWhatsAppTemplateMessage({
    to: phone,
    templateName: draft.templateName,
    languageCode: 'es_MX',
    bodyParameters: [
      { type: 'text', text: followUpFirstName(patient?.full_name ?? '') },
    ],
  });

  if (sendResult.ok) {
    await insertFollowUpOutboundMessage({
      conversationId,
      contactId,
      idempotencyKey: buildFollowUpDraftIdempotencyKey(draft.id),
      body,
      draftId: draft.id,
      providerMessageId: sendResult.providerMessageId,
    });

    const updated = await markFollowUpDraftSent({
      id: draft.id,
      providerMessageId: sendResult.providerMessageId,
    });

    return {
      draft: updated,
      sent: true,
      skipped: false,
      providerMessageId: sendResult.providerMessageId,
    };
  }

  const errorMessage = sendResult.error ?? 'send_failed';
  const updated = await markFollowUpDraftSentFailed({
    id: draft.id,
    errorMessage,
  });

  return {
    draft: updated,
    sent: false,
    skipped: false,
    error: errorMessage,
  };
}
