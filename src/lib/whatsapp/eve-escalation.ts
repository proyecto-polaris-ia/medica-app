import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { WhatsAppInboundIntent } from '@/lib/ai/whatsapp-inbound-agent';
import { sendWhatsAppTextMessage, type WhatsAppSendResult } from './client';
import type { NormalizedWhatsAppInboundEvent } from './normalize';
import {
  createWhatsAppEscalation,
  createWhatsAppIntent,
  insertWhatsAppOutboundMessage,
  markWhatsAppInboundMessageProcessed,
  persistWhatsAppInboundEvent,
  updateWhatsAppConversationStatus,
} from './store';

export type EveEscalationPriority = 'low' | 'normal' | 'high' | 'urgent';

export type CreateEveEscalationInput = {
  patientPhone: string;
  profileName?: string;
  reason: string;
  summary?: string;
  priority?: EveEscalationPriority;
  patientMessage?: string;
  intent?: WhatsAppInboundIntent;
  occurredAt?: string;
  idempotencyKey?: string;
  humanAlertPhone?: string;
  sendText?: typeof sendWhatsAppTextMessage;
};

export type CreateEveEscalationResult = {
  escalationId: string;
  created: boolean;
  contactId: string;
  conversationId: string;
  messageId: string;
  humanAlertSend?: WhatsAppSendResult;
  humanAlertPhoneConfigured: boolean;
};

const CLINICAL_URGENT = /dolor\s+(fuerte|intenso|insoportable)|urgenc|emergenc|infecci[oó]n|hinchaz[oó]n|sangrado|alerg/i;
const HIGH_PRIORITY = /medicament|receta|antibi[oó]tico|analg[eé]sico|precio|costo|cancel|reprogram/i;

function priorityFor(text: string): EveEscalationPriority {
  if (CLINICAL_URGENT.test(text)) return 'urgent';
  if (HIGH_PRIORITY.test(text)) return 'high';
  return 'normal';
}

function sanitizeKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9+.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function buildProviderMessageId(input: CreateEveEscalationInput): string {
  if (input.idempotencyKey?.trim()) return `eve:escalation:${sanitizeKey(input.idempotencyKey)}`;
  const basis = `${input.patientPhone}:${input.reason}:${input.summary ?? ''}`;
  return `eve:escalation:${sanitizeKey(basis)}`;
}

async function existingEscalation(messageId: string): Promise<{ id: string } | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('whatsapp_escalations')
    .select('id')
    .eq('message_id', messageId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as { id: string } | null) ?? null;
}

function buildHumanAlertText(input: {
  patientPhone: string;
  profileName?: string;
  reason: string;
  summary: string;
  priority: EveEscalationPriority;
}): string {
  const patientName = input.profileName?.trim() || 'Paciente sin nombre';
  return [
    `Escalación WhatsApp (${input.priority})`,
    `Paciente: ${patientName}`,
    `Teléfono: ${input.patientPhone}`,
    `Motivo: ${input.reason}`,
    `Resumen: ${input.summary}`,
  ].join('\n');
}

function buildSyntheticEvent(input: CreateEveEscalationInput): NormalizedWhatsAppInboundEvent {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  return {
    providerMessageId: buildProviderMessageId(input),
    fromPhone: input.patientPhone,
    profileName: input.profileName,
    messageType: 'text',
    body: input.patientMessage ?? input.summary ?? input.reason,
    occurredAt,
    rawMessage: { source: 'eve', kind: 'human_escalation' },
    rawValue: { source: 'eve', kind: 'human_escalation' },
  };
}

export async function createEveWhatsAppEscalation(
  input: CreateEveEscalationInput
): Promise<CreateEveEscalationResult> {
  const event = buildSyntheticEvent(input);
  const persisted = await persistWhatsAppInboundEvent(event);
  if (!persisted.messageId) {
    throw new Error('Could not persist Eve escalation message');
  }

  const existing = await existingEscalation(persisted.messageId);
  if (existing) {
    await updateWhatsAppConversationStatus({
      conversationId: persisted.conversationId,
      status: 'escalated',
      lastIntent: input.intent ?? 'support',
    });
    return {
      escalationId: existing.id,
      created: false,
      contactId: persisted.contactId,
      conversationId: persisted.conversationId,
      messageId: persisted.messageId,
      humanAlertPhoneConfigured: Boolean(input.humanAlertPhone ?? process.env.WHATSAPP_HUMAN_ALERT_PHONE),
    };
  }

  const reason = input.reason.trim();
  const summary = (input.summary?.trim() || input.patientMessage?.trim() || reason).slice(0, 500);
  const priority = input.priority ?? priorityFor(`${reason} ${summary} ${input.patientMessage ?? ''}`);
  const intent = await createWhatsAppIntent({
    persisted,
    decision: {
      intent: input.intent ?? 'support',
      confidence: 1,
      summary,
      citedKnowledgeIds: [],
      citedToolCallIds: [],
    },
  });
  const escalation = await createWhatsAppEscalation({
    persisted,
    intentId: intent.id,
    reason,
    priority,
    summary,
  });

  await updateWhatsAppConversationStatus({
    conversationId: persisted.conversationId,
    status: 'escalated',
    lastIntent: input.intent ?? 'support',
  });

  const humanAlertPhone = input.humanAlertPhone ?? process.env.WHATSAPP_HUMAN_ALERT_PHONE;
  const humanAlertText = buildHumanAlertText({
    patientPhone: input.patientPhone,
    profileName: input.profileName,
    reason,
    summary,
    priority,
  });
  const humanAlertSend = humanAlertPhone
    ? await (input.sendText ?? sendWhatsAppTextMessage)({ to: humanAlertPhone, body: humanAlertText })
    : undefined;

  if (humanAlertPhone) {
    await insertWhatsAppOutboundMessage({
      persisted,
      body: humanAlertText,
      sendResult: humanAlertSend,
      purpose: 'human_alert',
    });
  }

  await markWhatsAppInboundMessageProcessed({ messageId: persisted.messageId, status: 'escalated' });

  return {
    escalationId: escalation.id,
    created: true,
    contactId: persisted.contactId,
    conversationId: persisted.conversationId,
    messageId: persisted.messageId,
    humanAlertSend,
    humanAlertPhoneConfigured: Boolean(humanAlertPhone),
  };
}
