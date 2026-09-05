import type {
  WhatsAppInboundAgentProvider,
  WhatsAppInboundAgentProviderInput,
  WhatsAppKnowledgeEntry,
} from "./whatsapp-inbound-agent";

type ChatCompletionMessage = {
  role: "system" | "user";
  content: string;
};

type WhatsAppLLMProviderApiStyle = "chat_completions" | "responses";

type WhatsAppLLMProviderConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  apiStyle?: WhatsAppLLMProviderApiStyle;
  timeoutMs?: number;
};

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT_MS = 12_000;

function compactKnowledge(entries: WhatsAppKnowledgeEntry[]) {
  return entries.map((entry) => ({
    id: entry.id,
    topic: entry.topic,
    question: entry.question,
    answer: entry.answer,
    tags: entry.tags,
  }));
}

function buildSystemPrompt() {
  const currentYear = new Date().getFullYear();
  return `Eres el agente de WhatsApp de un consultorio dental.

Tu tarea es clasificar mensajes y redactar respuestas breves usando SOLO conocimiento aprobado proporcionado. Para agenda, solo puedes pedir una acción estructurada; el backend calcula disponibilidad y reserva.

Contexto temporal: El año actual es ${currentYear}. Cuando el usuario mencione fechas sin año (ej: "15 de septiembre"), usa el año actual ${currentYear}.

Reglas obligatorias:
- Responde únicamente en español de México profesional.
- No diagnostiques, no recetes, no sugieras medicamentos y no des instrucciones clínicas.
- No inventes horarios ni disponibilidad.
- No des precios o costos definitivos por WhatsApp; invita a una valoración humana.
- Si el mensaje menciona dolor fuerte, urgencia, infección, alergia, medicamento, receta, diagnóstico, sangrado o hinchazón, usa needs_human.
- Si el usuario quiere agendar o consultar horarios, usa tool_action con check_availability o book_appointment.
- Para agendar, usa serviceName y providerName (nombres legibles) en lugar de UUIDs. El backend resolverá los IDs.
- Si citas conocimiento aprobado para un servicio, incluye knowledgeServiceName con el nombre detallado del servicio mencionado en el knowledge.
- Si decides auto_answer, debes citar al menos un id de conocimiento aprobado en citedKnowledgeIds.
- Nunca menciones SQL, Supabase, tablas, credenciales, service role, herramientas internas ni errores técnicos al paciente.

JSON obligatorio:
{
  "intent": "inquiry" | "book_appointment" | "check_availability" | "reschedule_request" | "cancel_request" | "support" | "handoff" | "unknown",
  "summary": "resumen breve del mensaje",
  "confidence": 0.0,
  "decision": "auto_answer" | "tool_action" | "needs_human",
  "responseText": "respuesta breve al paciente",
  "escalationReason": "solo si decision es needs_human",
  "toolAction": { "name": "check_availability" | "book_appointment", "args": { "serviceName": "nombre del servicio", "providerName": "nombre del doctor", "knowledgeServiceName": "nombre detallado del knowledge si aplica", "localDate": "YYYY-MM-DD opcional", "startAt": "ISO opcional", "endAt": "ISO opcional", "fullName": "opcional" } },
  "citedKnowledgeIds": ["ids de conocimiento usados"],
  "citedToolCallIds": ["ids de tools dinámicos usados"]
}`;
}

function buildUserPrompt(input: WhatsAppInboundAgentProviderInput) {
  return JSON.stringify(
    {
      messageText: input.messageText,
      contact: input.contact ?? null,
      conversation: input.conversation ?? null,
      approvedKnowledge: compactKnowledge(input.knowledgeEntries),
      dynamicToolResults: input.dynamicToolResults ?? [],
      bookingCatalog: input.bookingCatalog ?? null,
    },
    null,
    2
  );
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function inferApiStyle(baseUrl: string, configured?: string): WhatsAppLLMProviderApiStyle {
  if (configured === "responses" || configured === "chat_completions") return configured;
  return /\/responses$/.test(baseUrl) ? "responses" : "chat_completions";
}

function resolveEndpoint(baseUrl: string, apiStyle: WhatsAppLLMProviderApiStyle) {
  if (apiStyle === "responses") {
    return /\/responses$/.test(baseUrl) ? baseUrl : `${baseUrl}/responses`;
  }
  return /\/chat\/completions$/.test(baseUrl) ? baseUrl : `${baseUrl}/chat/completions`;
}

async function parseResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") ? response.json() : response.text();
}

function extractChatCompletionContent(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (!first || typeof first !== "object") return null;
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : null;
}

function extractResponsesContent(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const directText = (body as { output_text?: unknown }).output_text;
  if (typeof directText === "string") return directText;

  const output = (body as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") return text;
    }
  }

  return null;
}

function extractAssistantContent(body: unknown, apiStyle: WhatsAppLLMProviderApiStyle): string | null {
  return apiStyle === "responses" ? extractResponsesContent(body) : extractChatCompletionContent(body);
}

function buildRequestBody(apiStyle: WhatsAppLLMProviderApiStyle, model: string, messages: ChatCompletionMessage[]) {
  if (apiStyle === "responses") {
    return {
      model,
      input: messages,
      temperature: 0.1,
    };
  }

  return {
    model,
    messages,
    temperature: 0.1,
    response_format: { type: "json_object" },
  };
}

export function createWhatsAppLLMProvider(config: WhatsAppLLMProviderConfig = {}): WhatsAppInboundAgentProvider | null {
  const apiKey = config.apiKey ?? process.env.WHATSAPP_AGENT_LLM_API_KEY;
  const model = config.model ?? process.env.WHATSAPP_AGENT_LLM_MODEL;
  const baseUrl = normalizeBaseUrl(config.baseUrl ?? process.env.WHATSAPP_AGENT_LLM_BASE_URL ?? DEFAULT_BASE_URL);
  const apiStyle = inferApiStyle(baseUrl, config.apiStyle ?? process.env.WHATSAPP_AGENT_LLM_API_STYLE);
  const endpoint = resolveEndpoint(baseUrl, apiStyle);
  const timeoutMs = config.timeoutMs ?? Number(process.env.WHATSAPP_AGENT_LLM_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  if (!apiKey || !model) return null;

  return async function whatsappLLMProvider(input: WhatsAppInboundAgentProviderInput) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS);

    const recentMessages = input.conversation?.recentMessages ?? [];
    const historyMessages: ChatCompletionMessage[] = recentMessages.map((msg) => ({
      role: msg.role as "system" | "user",
      content: msg.content,
    }));

    const messages: ChatCompletionMessage[] = [
      { role: "system", content: buildSystemPrompt() },
      ...historyMessages,
      { role: "user", content: buildUserPrompt(input) },
    ];

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildRequestBody(apiStyle, model, messages)),
      });

      const body = await parseResponse(response);
      if (!response.ok) {
        return {
          intent: "unknown",
          summary: input.messageText.slice(0, 180),
          confidence: 0,
          decision: "needs_human",
          escalationReason: `El proveedor LLM falló con status ${response.status}.`,
          citedKnowledgeIds: [],
        };
      }

      const content = extractAssistantContent(body, apiStyle);
      if (!content) {
        return {
          intent: "unknown",
          summary: input.messageText.slice(0, 180),
          confidence: 0,
          decision: "needs_human",
          escalationReason: "El proveedor LLM no devolvió contenido utilizable.",
          citedKnowledgeIds: [],
        };
      }

      return content;
    } catch (error) {
      return {
        intent: "unknown",
        summary: input.messageText.slice(0, 180),
        confidence: 0,
        decision: "needs_human",
        escalationReason: error instanceof Error ? `El proveedor LLM falló: ${error.message}` : "El proveedor LLM falló.",
        citedKnowledgeIds: [],
      };
    } finally {
      clearTimeout(timeout);
    }
  };
}
