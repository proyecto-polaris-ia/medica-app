import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { recordWhatsAppAiEvent, type WhatsAppAiCorrelationContext } from '@/lib/observability/whatsapp-ai';
import { createWhatsAppLLMProvider } from './whatsapp-llm-provider';

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

export type WhatsAppKnowledgeEntry = {
  id: string;
  topic: string;
  question: string;
  answer: string;
  tags: string[];
  source: string | null;
};

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
    localDate?: string;
    startAt?: string;
    endAt?: string;
    fullName?: string;
    selectedCandidateIndex?: number;
  };
};

export type WhatsAppInboundAgentInput = {
  messageText: string;
  contact?: { id?: string; phone?: string; profileName?: string };
  conversation?: { id?: string; bookingContext?: Record<string, unknown> | null; lastIntent?: string | null };
  dynamicToolResults?: WhatsAppDynamicToolResult[];
};

export type WhatsAppInboundAgentProviderInput = WhatsAppInboundAgentInput & { knowledgeEntries: WhatsAppKnowledgeEntry[] };
export type WhatsAppInboundAgentProvider = (input: WhatsAppInboundAgentProviderInput) => Promise<unknown> | unknown;

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

type WhatsAppSupabaseClient = Pick<SupabaseClient, 'from'>;

const SAFE_AUTO_ANSWER_CONFIDENCE = 0.7;
const KNOWLEDGE_LIMIT = 25;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createDefaultKnowledgeClient(): WhatsAppSupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function normalizeKnowledgeEntry(row: Record<string, unknown>): WhatsAppKnowledgeEntry | null {
  if (typeof row.id !== 'string' || typeof row.topic !== 'string' || typeof row.question !== 'string' || typeof row.answer !== 'string') return null;
  return { id: row.id, topic: row.topic, question: row.question, answer: row.answer, tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string') : [], source: typeof row.source === 'string' ? row.source : null };
}

export async function loadApprovedWhatsAppKnowledgeEntries(client: WhatsAppSupabaseClient | null = createDefaultKnowledgeClient()): Promise<WhatsAppKnowledgeEntry[]> {
  if (!client) return [];
  try {
    const result = await client.from('whatsapp_knowledge_entries').select('id, topic, question, answer, tags, source').eq('status', 'approved').order('approved_at', { ascending: false, nullsFirst: false }).limit(KNOWLEDGE_LIMIT);
    if (result.error || !Array.isArray(result.data)) return [];
    return result.data.map((row) => normalizeKnowledgeEntry(row as Record<string, unknown>)).filter((entry): entry is WhatsAppKnowledgeEntry => Boolean(entry));
  } catch {
    return [];
  }
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function safeEscalation(intent: WhatsAppInboundIntent, summary: string, escalationReason: string, confidence = 0.95, responseText?: string, providerDiagnostics?: WhatsAppInboundAgentDiagnostics): WhatsAppInboundAgentDecision {
  return { intent, summary, confidence, decision: 'needs_human', escalationReason, responseText, citedKnowledgeIds: [], citedToolCallIds: [], providerDiagnostics };
}

export function buildWhatsAppClinicalEscalationDecision(messageText: string): WhatsAppInboundAgentDecision | null {
  const trimmed = messageText.trim();
  if (!trimmed) return safeEscalation('unknown', 'Mensaje vacío', 'El mensaje está vacío o no contiene texto suficiente.');
  const normalized = trimmed.toLowerCase();
  if (hasAny(normalized, [/dolor\s+(fuerte|intenso|insoportable)|urgenc|emergenc|infecci[oó]n|hinchaz[oó]n|sangrado|alerg|medicament|receta|antibi[oó]tico|analg[eé]sico|diagn[oó]stic/i])) {
    return safeEscalation('support', trimmed.slice(0, 180), 'El mensaje puede requerir criterio clínico o atención humana.', 0.98, 'Gracias por escribirnos. Para cuidarte bien, este caso lo debe revisar una persona del consultorio. Ya lo estamos escalando para que te den seguimiento.');
  }
  if (hasAny(normalized, [/precio|costo|cu[aá]nto cuesta|cotiz|tarifa|presupuesto/i])) {
    return safeEscalation('handoff', trimmed.slice(0, 180), 'El mensaje solicita costos definitivos y requiere valoración humana.', 0.95, 'Gracias por escribirnos. Para darte un costo responsable primero necesitamos una valoración. Una persona del consultorio te dará seguimiento.');
  }
  return null;
}

function parseProviderOutput(output: unknown): WhatsAppInboundAgentDecision | null {
  const raw = typeof output === 'string' ? output : JSON.stringify(output);
  let parsed: unknown;
  try { parsed = typeof output === 'string' ? JSON.parse(output) : output; } catch { return null; }
  if (!parsed || typeof parsed !== 'object') return null;
  const row = parsed as Record<string, unknown>;
  const intent = typeof row.intent === 'string' ? row.intent : 'unknown';
  const decision = typeof row.decision === 'string' ? row.decision : 'needs_human';
  if (!['inquiry','book_appointment','check_availability','reschedule_request','cancel_request','support','handoff','unknown'].includes(intent)) return null;
  if (!['auto_answer','tool_action','needs_human'].includes(decision)) return null;
  const toolActionRow = row.toolAction && typeof row.toolAction === 'object' ? row.toolAction as Record<string, unknown> : null;
  const actionName = typeof toolActionRow?.name === 'string' ? toolActionRow.name : undefined;
  const toolAction = actionName && ['check_availability','book_appointment'].includes(actionName)
    ? { name: actionName as WhatsAppToolActionName, args: (toolActionRow?.args && typeof toolActionRow.args === 'object' ? toolActionRow.args : {}) as WhatsAppToolAction['args'] }
    : undefined;
  return {
    intent: intent as WhatsAppInboundIntent,
    summary: typeof row.summary === 'string' && row.summary.trim() ? row.summary.slice(0, 500) : raw.slice(0, 180),
    confidence: typeof row.confidence === 'number' && row.confidence >= 0 && row.confidence <= 1 ? row.confidence : 0,
    decision: decision as WhatsAppInboundDecisionType,
    responseText: typeof row.responseText === 'string' && row.responseText.trim() ? row.responseText.slice(0, 2000) : undefined,
    escalationReason: typeof row.escalationReason === 'string' && row.escalationReason.trim() ? row.escalationReason.slice(0, 1000) : undefined,
    toolAction,
    citedKnowledgeIds: Array.isArray(row.citedKnowledgeIds) ? row.citedKnowledgeIds.filter((id): id is string => typeof id === 'string') : [],
    citedToolCallIds: Array.isArray(row.citedToolCallIds) ? row.citedToolCallIds.filter((id): id is string => typeof id === 'string') : [],
  };
}

function localKnowledgeAnswer(messageText: string, entries: WhatsAppKnowledgeEntry[]): WhatsAppInboundAgentDecision | null {
  const normalized = messageText.toLowerCase();
  const match = entries.find((entry) => [entry.topic, entry.question, ...entry.tags].some((value) => normalized.includes(value.toLowerCase())));
  if (!match) return null;
  return { intent: 'inquiry', summary: `Respuesta desde knowledge: ${match.topic}`, confidence: 0.82, decision: 'auto_answer', responseText: match.answer, citedKnowledgeIds: [match.id], citedToolCallIds: [] };
}

function localBookingDecision(messageText: string, bookingContext?: Record<string, unknown> | null): WhatsAppInboundAgentDecision | null {
  const text = messageText.trim();
  const normalized = text.toLowerCase();
  const selected = normalized.match(/^(?:opci[oó]n\s*)?(\d{1,2})$/);
  if (selected && Array.isArray(bookingContext?.candidates)) {
    return { intent: 'book_appointment', summary: 'El paciente seleccionó una opción de horario previamente propuesta.', confidence: 0.9, decision: 'tool_action', toolAction: { name: 'book_appointment', args: { selectedCandidateIndex: Number(selected[1]) - 1 } }, citedKnowledgeIds: [], citedToolCallIds: [] };
  }
  if (!hasAny(normalized, [/cita|agenda|agendar|reservar|disponible|horario|consulta|limpieza|valoraci[oó]n|tratamiento/i])) return null;
  const uuidMatches = text.match(new RegExp(UUID_RE.source, 'ig')) ?? [];
  const isoMatch = text.match(/\d{4}-\d{2}-\d{2}(?:[tT ][0-9:.-]+(?:Z|[+-]\d{2}:?\d{2})?)?/);
  return { intent: 'check_availability', summary: 'El paciente solicita disponibilidad o una cita.', confidence: 0.78, decision: 'tool_action', toolAction: { name: 'check_availability', args: { serviceId: uuidMatches[0], providerId: uuidMatches[1], localDate: isoMatch?.[0] } }, citedKnowledgeIds: [], citedToolCallIds: [] };
}

export async function decideWhatsAppInboundMessage(input: WhatsAppInboundAgentInput, options: { provider?: WhatsAppInboundAgentProvider; knowledgeEntries?: WhatsAppKnowledgeEntry[]; observabilityContext?: WhatsAppAiCorrelationContext } = {}): Promise<WhatsAppInboundAgentDecision> {
  const knowledgeEntries = options.knowledgeEntries ?? await loadApprovedWhatsAppKnowledgeEntries();
  const preflight = buildWhatsAppClinicalEscalationDecision(input.messageText);
  if (preflight) return { ...preflight, dynamicToolResults: input.dynamicToolResults };

  const provider = options.provider ?? createWhatsAppLLMProvider();
  if (provider) {
    try {
      recordWhatsAppAiEvent({ context: options.observabilityContext, type: 'ai.provider.started', outcome: 'success' });
      const parsed = parseProviderOutput(await provider({ ...input, knowledgeEntries }));
      if (parsed) {
        const knowledgeFallback = parsed.decision === 'needs_human' && parsed.escalationReason?.includes('El proveedor LLM falló')
          ? localKnowledgeAnswer(input.messageText, knowledgeEntries)
          : null;
        const safe = enforceDecisionSafety(knowledgeFallback ?? parsed, knowledgeEntries);
        recordWhatsAppAiEvent({ context: options.observabilityContext, type: 'ai.provider.finished', outcome: 'success', diagnostics: { decision: safe.decision, intent: safe.intent } });
        return { ...safe, dynamicToolResults: input.dynamicToolResults };
      }
    } catch (error) {
      recordWhatsAppAiEvent({ context: options.observabilityContext, type: 'ai.provider.failed', outcome: 'failure', diagnostics: { error } });
    }
  }

  const fallback = localKnowledgeAnswer(input.messageText, knowledgeEntries) ?? localBookingDecision(input.messageText, input.conversation?.bookingContext);
  if (fallback) return { ...fallback, dynamicToolResults: input.dynamicToolResults };
  return safeEscalation('unknown', input.messageText.slice(0, 180), 'No hay suficiente certeza para responder automáticamente.', 0.2, 'Gracias por escribirnos. Una persona del consultorio revisará tu mensaje y te dará seguimiento.');
}

function enforceDecisionSafety(decision: WhatsAppInboundAgentDecision, knowledgeEntries: WhatsAppKnowledgeEntry[]): WhatsAppInboundAgentDecision {
  const clinical = buildWhatsAppClinicalEscalationDecision(`${decision.summary} ${decision.responseText ?? ''}`);
  if (clinical) return clinical;
  if (decision.decision === 'auto_answer') {
    const approvedIds = new Set(knowledgeEntries.map((entry) => entry.id));
    const citations = decision.citedKnowledgeIds.filter((id) => approvedIds.has(id));
    if (decision.confidence < SAFE_AUTO_ANSWER_CONFIDENCE || !decision.responseText || citations.length === 0) {
      return safeEscalation('unknown', decision.summary, 'La respuesta automática no tiene suficiente confianza o citas de knowledge aprobada.');
    }
    return { ...decision, citedKnowledgeIds: citations };
  }
  if (decision.decision === 'tool_action' && !decision.toolAction) {
    return safeEscalation('unknown', decision.summary, 'La decisión solicita una herramienta pero no incluye una acción válida.');
  }
  return decision;
}
