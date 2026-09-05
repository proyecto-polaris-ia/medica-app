export type WhatsAppOptInStatus = 'unknown' | 'pending' | 'opted_in' | 'opted_out';
export type WhatsAppConversationStatus = 'open' | 'awaiting_agent' | 'escalated' | 'resolved' | 'archived';
export type WhatsAppMessageDirection = 'inbound' | 'outbound';
export type WhatsAppMessageStatus = 'received' | 'processed' | 'responded' | 'escalated' | 'failed' | 'sent' | 'delivered' | 'read';
export type WhatsAppIntentType = 'inquiry' | 'book_appointment' | 'check_availability' | 'reschedule_request' | 'cancel_request' | 'support' | 'handoff' | 'unknown';
export type WhatsAppIntentStatus = 'detected' | 'confirmed' | 'dismissed' | 'synced';
export type WhatsAppEscalationStatus = 'open' | 'acknowledged' | 'resolved' | 'canceled';
export type WhatsAppEscalationPriority = 'low' | 'normal' | 'high' | 'urgent';
export type WhatsAppKnowledgeStatus = 'draft' | 'approved' | 'archived';

export type WhatsAppKnowledgeEntry = {
  id: string;
  topic: string;
  question: string;
  answer: string;
  tags: string[];
  source: string | null;
  status: WhatsAppKnowledgeStatus;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Patient = {
  id: string;
  fullName: string;
  phoneE164: string | null;
  email: string | null;
  notes: string | null;
  createdAt?: string;
  updatedAt?: string;
};
