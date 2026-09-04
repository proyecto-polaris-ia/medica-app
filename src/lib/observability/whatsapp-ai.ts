type JsonObject = Record<string, unknown>;

export type WhatsAppAiEventOutcome = "success" | "failure" | "skipped";

export type WhatsAppAiEventType =
  | "webhook.received"
  | "webhook.accepted"
  | "webhook.rejected"
  | "webhook.failed"
  | "persistence.finished"
  | "duplicate.skipped"
  | "ai.decision"
  | "ai.provider.started"
  | "ai.provider.finished"
  | "ai.provider.failed"
  | "tool.finished"
  | "send.finished"
  | "status_callback.persisted"
  | "escalation.created";

export type WhatsAppAiCorrelationContext = {
  correlationId: string;
  requestId?: string;
  providerMessageId?: string;
};

export type WhatsAppAiEvent = {
  eventId: string;
  correlationId: string;
  type: WhatsAppAiEventType;
  outcome: WhatsAppAiEventOutcome;
  occurredAt: string;
  requestId?: string;
  providerMessageId?: string;
  durationMs?: number;
  identifiers?: JsonObject;
  diagnostics?: unknown;
};

export type WhatsAppAiObservabilityMetrics = {
  totalEvents: number;
  webhookEvents: number;
  duplicates: number;
  autoAnswers: number;
  needsHuman: number;
  escalations: number;
  sendFailures: number;
  statusCallbacks: number;
  toolFailures: number;
  aiFailures: number;
  byType: Partial<Record<WhatsAppAiEventType, number>>;
  byOutcome: Partial<Record<WhatsAppAiEventOutcome, number>>;
};

export type WhatsAppAiObservabilitySnapshot = {
  metrics: WhatsAppAiObservabilityMetrics;
  recentEvents: WhatsAppAiEvent[];
  recentFailures: WhatsAppAiEvent[];
};

const MAX_RECENT_EVENTS = 50;
const MAX_RECENT_FAILURES = 10;
const REDACTED = "[redacted]";
const REDACTED_SECRET = "[redacted-secret]";
const REDACTED_PHONE = "[redacted-phone]";
const REDACTED_URL = "[redacted-url]";
const SENSITIVE_KEY_PATTERN = /authorization|cookie|password|token|secret|api.?key|service.?role|prompt|completion|raw|body|message.?text|stack|sql|phone|recipient|sender|from|to|url|link/i;
const SECRET_VALUE_PATTERN = /bearer\s+[a-z0-9._~+/=-]+|sk-[a-z0-9_-]+|service[_-]?role|supabase[_-]?service[_-]?role[_-]?key|whatsapp[_-]?(app[_-]?)?secret|access[_-]?token/gi;
const PHONE_VALUE_PATTERN = /\+?\d[\d\s().-]{7,}\d/g;
const URL_VALUE_PATTERN = /https?:\/\/\S+/gi;
const SQL_VALUE_PATTERN = /\b(select|insert|update|delete|upsert|drop|alter)\b[\s\S]{0,120}\b(from|into|table|where|set)\b/gi;

function initialMetrics(): WhatsAppAiObservabilityMetrics {
  return {
    totalEvents: 0,
    webhookEvents: 0,
    duplicates: 0,
    autoAnswers: 0,
    needsHuman: 0,
    escalations: 0,
    sendFailures: 0,
    statusCallbacks: 0,
    toolFailures: 0,
    aiFailures: 0,
    byType: {},
    byOutcome: {},
  };
}

const state: WhatsAppAiObservabilitySnapshot = {
  metrics: initialMetrics(),
  recentEvents: [],
  recentFailures: [],
};

function randomId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function isPlainObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeString(value: string) {
  return value
    .replace(SECRET_VALUE_PATTERN, REDACTED_SECRET)
    .replace(URL_VALUE_PATTERN, REDACTED_URL)
    .replace(SQL_VALUE_PATTERN, REDACTED)
    .replace(PHONE_VALUE_PATTERN, REDACTED_PHONE)
    .slice(0, 500);
}

export function sanitizeWhatsAppAiDiagnostics(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth > 5) return REDACTED;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeWhatsAppAiDiagnostics(item, depth + 1));
  if (!isPlainObject(value)) return REDACTED;

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : sanitizeWhatsAppAiDiagnostics(nested, depth + 1),
    ])
  );
}

export function createWhatsAppAiCorrelationContext(input: Partial<WhatsAppAiCorrelationContext> = {}): WhatsAppAiCorrelationContext {
  const correlationId = input.correlationId || input.providerMessageId || input.requestId || randomId("wa_corr");
  return {
    correlationId,
    ...(input.requestId ? { requestId: input.requestId } : {}),
    ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
  };
}

function updateMetrics(event: WhatsAppAiEvent) {
  const metrics = state.metrics;
  metrics.totalEvents += 1;
  metrics.byType[event.type] = (metrics.byType[event.type] ?? 0) + 1;
  metrics.byOutcome[event.outcome] = (metrics.byOutcome[event.outcome] ?? 0) + 1;

  if (event.type.startsWith("webhook.")) metrics.webhookEvents += 1;
  if (event.type === "duplicate.skipped") metrics.duplicates += 1;
  if (event.type === "status_callback.persisted") metrics.statusCallbacks += 1;
  if (event.type === "escalation.created") metrics.escalations += 1;
  if (event.type === "send.finished" && event.outcome === "failure") metrics.sendFailures += 1;
  if (event.type === "tool.finished" && event.outcome === "failure") metrics.toolFailures += 1;
  if (event.type.startsWith("ai.") && event.outcome === "failure") metrics.aiFailures += 1;

  const diagnostics = isPlainObject(event.diagnostics) ? event.diagnostics : {};
  if (event.type === "ai.decision" && diagnostics.decision === "auto_answer") metrics.autoAnswers += 1;
  if (event.type === "ai.decision" && diagnostics.decision === "needs_human") metrics.needsHuman += 1;
}

function rememberEvent(event: WhatsAppAiEvent) {
  state.recentEvents.unshift(event);
  state.recentEvents.splice(MAX_RECENT_EVENTS);
  if (event.outcome === "failure") {
    state.recentFailures.unshift(event);
    state.recentFailures.splice(MAX_RECENT_FAILURES);
  }
}

export function recordWhatsAppAiEvent(input: {
  context?: WhatsAppAiCorrelationContext;
  type: WhatsAppAiEventType;
  outcome: WhatsAppAiEventOutcome;
  identifiers?: JsonObject;
  diagnostics?: unknown;
  durationMs?: number;
}): WhatsAppAiEvent {
  const context = createWhatsAppAiCorrelationContext(input.context);
  const event: WhatsAppAiEvent = {
    eventId: randomId("wa_evt"),
    correlationId: context.correlationId,
    type: input.type,
    outcome: input.outcome,
    occurredAt: new Date().toISOString(),
    ...(context.requestId ? { requestId: context.requestId } : {}),
    ...(context.providerMessageId ? { providerMessageId: context.providerMessageId } : {}),
    ...(typeof input.durationMs === "number" ? { durationMs: Math.max(0, Math.round(input.durationMs)) } : {}),
    ...(input.identifiers ? { identifiers: sanitizeWhatsAppAiDiagnostics(input.identifiers) as JsonObject } : {}),
    ...(input.diagnostics !== undefined ? { diagnostics: sanitizeWhatsAppAiDiagnostics(input.diagnostics) } : {}),
  };

  updateMetrics(event);
  rememberEvent(event);

  try {
    console.info("whatsapp_ai_observability", event);
  } catch {
    // Observability must never break customer processing.
  }

  return event;
}

export function getWhatsAppAiObservabilitySnapshot(): WhatsAppAiObservabilitySnapshot {
  return {
    metrics: {
      ...state.metrics,
      byType: { ...state.metrics.byType },
      byOutcome: { ...state.metrics.byOutcome },
    },
    recentEvents: state.recentEvents.map((event) => ({ ...event })),
    recentFailures: state.recentFailures.map((event) => ({ ...event })),
  };
}

export function resetWhatsAppAiObservabilityForTests() {
  state.metrics = initialMetrics();
  state.recentEvents = [];
  state.recentFailures = [];
}
