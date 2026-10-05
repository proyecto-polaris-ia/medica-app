import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { WhatsAppInboundAgentDecision } from './inbound-decision';
import type { NormalizedWhatsAppInboundEvent } from './normalize';

export type JsonPayload = Record<string, unknown>;
export type PersistedWhatsAppInboundEvent = { inserted: boolean; contactId: string; conversationId: string; messageId: string };

export class WhatsAppStoreConfigurationError extends Error {
  constructor(message = 'WhatsApp webhook persistence is not configured') { super(message); this.name = 'WhatsAppStoreConfigurationError'; }
}

type DbClient = ReturnType<typeof getSupabaseAdmin>;
type ResultError = { message?: string; code?: string } | null;

type WhatsAppStoreDecision = Pick<WhatsAppInboundAgentDecision, 'intent' | 'confidence' | 'summary' | 'citedKnowledgeIds' | 'citedToolCallIds' | 'dynamicToolResults' | 'providerDiagnostics'>;

function db() {
  try { return getSupabaseAdmin(); } catch (error) { throw new WhatsAppStoreConfigurationError(error instanceof Error ? error.message : undefined); }
}
function throwIfError(error: ResultError, fallback: string) { if (error) throw new Error(error.message || fallback); }
function getProviderMessageIdFromSendResult(sendResult: unknown) {
  return sendResult && typeof sendResult === 'object' && typeof (sendResult as { providerMessageId?: unknown }).providerMessageId === 'string' ? (sendResult as { providerMessageId: string }).providerMessageId : undefined;
}

export async function upsertWhatsAppContact(client: DbClient, event: NormalizedWhatsAppInboundEvent) {
  const now = new Date().toISOString();
  const result = await client.from('whatsapp_contacts').upsert({ phone_e164: event.fromPhone, whatsapp_profile_name: event.profileName ?? null, display_name: event.profileName ?? null, source: 'whatsapp', last_seen_at: now, last_message_at: event.occurredAt }, { onConflict: 'phone_e164' }).select('id').single();
  throwIfError(result.error, 'Could not upsert WhatsApp contact');
  if (!result.data) throw new Error('Could not upsert WhatsApp contact');
  return result.data.id as string;
}

export async function getOrCreateOpenWhatsAppConversation(client: DbClient, contactId: string, event: NormalizedWhatsAppInboundEvent) {
  const existing = await client.from('whatsapp_conversations').select('id').eq('contact_id', contactId).eq('channel', 'whatsapp').eq('status', 'open').order('created_at', { ascending: false }).limit(1).maybeSingle();
  throwIfError(existing.error, 'Could not read WhatsApp conversation');
  if (existing.data?.id) return existing.data.id as string;
  const created = await client.from('whatsapp_conversations').insert({ contact_id: contactId, channel: 'whatsapp', status: 'open', last_message_at: event.occurredAt, last_inbound_at: event.occurredAt }).select('id').single();
  throwIfError(created.error, 'Could not create WhatsApp conversation');
  if (!created.data) throw new Error('Could not create WhatsApp conversation');
  return created.data.id as string;
}

async function insertInboundMessage(client: DbClient, event: NormalizedWhatsAppInboundEvent, contactId: string, conversationId: string) {
  const inserted = await client.from('whatsapp_messages').insert({ conversation_id: conversationId, contact_id: contactId, whatsapp_message_id: event.providerMessageId, direction: 'inbound', message_type: event.messageType, body: event.body ?? null, payload: { rawMessage: event.rawMessage, rawValue: event.rawValue }, status: 'received', occurred_at: event.occurredAt }).select('id').single();
  if (inserted.error?.code === '23505') return null;
  throwIfError(inserted.error, 'Could not insert WhatsApp message');
  return inserted.data?.id as string | undefined;
}

async function selectExistingMessageId(client: DbClient, providerMessageId: string) {
  const existing = await client.from('whatsapp_messages').select('id, conversation_id, contact_id').eq('whatsapp_message_id', providerMessageId).maybeSingle();
  throwIfError(existing.error, 'Could not read existing WhatsApp message');
  return existing.data as { id: string; conversation_id: string; contact_id: string } | null;
}

export async function persistWhatsAppInboundEvent(event: NormalizedWhatsAppInboundEvent): Promise<PersistedWhatsAppInboundEvent> {
  const client = db();
  const contactId = await upsertWhatsAppContact(client, event);
  const conversationId = await getOrCreateOpenWhatsAppConversation(client, contactId, event);
  const messageId = await insertInboundMessage(client, event, contactId, conversationId);
  await touchConversation(client, conversationId, event);
  if (messageId) return { inserted: true, contactId, conversationId, messageId };
  const existing = await selectExistingMessageId(client, event.providerMessageId);
  return { inserted: false, contactId: existing?.contact_id ?? contactId, conversationId: existing?.conversation_id ?? conversationId, messageId: existing?.id ?? '' };
}

async function touchConversation(client: DbClient, conversationId: string, event: NormalizedWhatsAppInboundEvent) {
  const result = await client.from('whatsapp_conversations').update({ last_message_at: event.occurredAt, last_inbound_at: event.occurredAt }).eq('id', conversationId);
  throwIfError(result.error, 'Could not update WhatsApp conversation');
}

export async function createWhatsAppIntent(input: { persisted: PersistedWhatsAppInboundEvent; decision: WhatsAppStoreDecision }) {
  const result = await db().from('whatsapp_intents').insert({ conversation_id: input.persisted.conversationId, message_id: input.persisted.messageId, contact_id: input.persisted.contactId, intent_type: input.decision.intent, confidence: input.decision.confidence, summary: input.decision.summary, entities: { citedKnowledgeIds: input.decision.citedKnowledgeIds, citedToolCallIds: input.decision.citedToolCallIds, dynamicToolResults: input.decision.dynamicToolResults ?? [], providerDiagnostics: input.decision.providerDiagnostics ?? null }, status: 'detected' }).select('id').single();
  throwIfError(result.error, 'Could not create WhatsApp intent');
  if (!result.data) throw new Error('Could not create WhatsApp intent');
  return { id: result.data.id as string };
}

export async function insertWhatsAppOutboundMessage(input: { persisted: PersistedWhatsAppInboundEvent; body: string; sendResult?: unknown; purpose: 'auto_answer' | 'customer_escalation' | 'human_alert' | 'booking' }) {
  const id = getProviderMessageIdFromSendResult(input.sendResult) ?? `out:${input.purpose}:${input.persisted.messageId}`;
  const result = await db().from('whatsapp_messages').upsert({ conversation_id: input.persisted.conversationId, contact_id: input.persisted.contactId, whatsapp_message_id: id, direction: 'outbound', message_type: 'text', body: input.body, payload: { purpose: input.purpose, sendResult: input.sendResult ?? null }, status: id.startsWith('out:') ? 'sent' : 'sent', occurred_at: new Date().toISOString() }, { onConflict: 'whatsapp_message_id', ignoreDuplicates: true });
  throwIfError(result.error, 'Could not insert WhatsApp outbound message');
}

export async function createWhatsAppEscalation(input: { persisted: PersistedWhatsAppInboundEvent; intentId: string; reason: string; priority: string; summary: string }) {
  const result = await db().from('whatsapp_escalations').insert({ conversation_id: input.persisted.conversationId, contact_id: input.persisted.contactId, message_id: input.persisted.messageId, intent_id: input.intentId, reason: input.reason, priority: input.priority, summary: input.summary, status: 'open' }).select('id').single();
  throwIfError(result.error, 'Could not create WhatsApp escalation');
  if (!result.data) throw new Error('Could not create WhatsApp escalation');
  return { id: result.data.id as string };
}

export async function updateWhatsAppConversationStatus(input: { conversationId: string; status: string; lastIntent?: string | null; bookingContext?: JsonPayload | null }) {
  const patch: JsonPayload = { status: input.status, last_intent: input.lastIntent ?? null };
  if ('bookingContext' in input) patch.booking_context = input.bookingContext ?? null;
  const result = await db().from('whatsapp_conversations').update(patch).eq('id', input.conversationId);
  throwIfError(result.error, 'Could not update WhatsApp conversation status');
}

export async function markWhatsAppInboundMessageProcessed(input: { messageId: string; status: 'processed' | 'responded' | 'escalated' | 'failed' }) {
  if (!input.messageId) return;
  const result = await db().from('whatsapp_messages').update({ status: input.status, processed_at: new Date().toISOString() }).eq('id', input.messageId);
  throwIfError(result.error, 'Could not mark WhatsApp inbound message processed');
}
