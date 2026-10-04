/**
 * Shared inbound-decision types.
 *
 * These types used to live in `src/lib/ai/whatsapp-inbound-agent.ts`, which is
 * being removed in the Stage 7 legacy cleanup. Live modules (`store.ts`,
 * `eve-escalation.ts`, `whatsapp-intent-classifier.ts`) still need the intent
 * union and the decision shape, so they are extracted here and the legacy agent
 * re-exports them temporarily until it is deleted.
 */

export type WhatsAppInboundIntent =
  | 'inquiry'
  | 'book_appointment'
  | 'check_availability'
  | 'reschedule_request'
  | 'cancel_request'
  | 'support'
  | 'handoff'
  | 'unknown';

export type WhatsAppToolActionName = 'check_availability' | 'book_appointment';
export type WhatsAppInboundDecisionType = 'auto_answer' | 'tool_action' | 'needs_human';

export type WhatsAppDynamicToolResult = {
  id: string;
  tool: string;
  status: 'success' | 'blocked' | 'not_found' | 'error';
  data?: unknown;
  reason?: string;
};

export type WhatsAppToolAction = {
  name: WhatsAppToolActionName;
  args: {
    serviceId?: string;
    providerId?: string;
    serviceName?: string;
    providerName?: string;
    knowledgeServiceName?: string;
    localDate?: string;
    startAt?: string;
    endAt?: string;
    fullName?: string;
    selectedCandidateIndex?: number;
  };
};

export type WhatsAppInboundAgentDiagnostics = {
  providerErrorType: 'invalid_json' | 'invalid_structured_output';
  rawOutputPreview?: string;
  validationIssues?: Array<{ path: string; message: string }>;
};

export type WhatsAppInboundAgentDecision = {
  intent: WhatsAppInboundIntent;
  summary: string;
  confidence: number;
  decision: WhatsAppInboundDecisionType;
  responseText?: string;
  escalationReason?: string;
  toolAction?: WhatsAppToolAction;
  citedKnowledgeIds: string[];
  citedToolCallIds: string[];
  dynamicToolResults?: WhatsAppDynamicToolResult[];
  providerDiagnostics?: WhatsAppInboundAgentDiagnostics;
};
