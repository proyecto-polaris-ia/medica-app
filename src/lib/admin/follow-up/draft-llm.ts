import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import {
  FOLLOW_UP_TEMPLATE_NAME,
  buildFollowUpDraft,
  followUpFirstName,
  validateFollowUpDraftText,
} from './draft';
import { isClaraDraftingEnabled } from './drafting-flag';
import type { FollowUpReason } from './rules';
import type { FollowUpCase } from './types';

/**
 * Redacción del borrador de seguimiento con LLM y fallback determinista
 * (issue #148, design.md decisiones 3, 4 y 5; spec `clara-drafting`).
 *
 * Server-only: lee variables de entorno y hace red. El LLM **solo redacta**:
 * nunca decide disponibilidad, nunca escribe en la base y nunca envía WhatsApp.
 * Ninguna falla del LLM puede dejar al paciente sin borrador: ante cualquier
 * error, timeout, falta de llaves o salida que viole los guardrails se devuelve
 * la plantilla determinista de `draft.ts`.
 *
 * El provider es propio de la capacidad admin (misma convención de variables
 * que `agents/eva/agent/model.ts`, sin importarlo) y se lee de forma lazy en cada llamada
 * para poder rotar el entorno sin redeploy completo.
 */

/** Tiempo máximo de una sola llamada al LLM; agotado, se usa la plantilla. */
export const DRAFT_LLM_TIMEOUT_MS = 8000;

/** Tope de tokens de salida: acota costo y longitud del texto candidato. */
export const DRAFT_LLM_MAX_OUTPUT_TOKENS = 220;

/** Variación suficiente para no sonar robótico sin dispararse a texto largo. */
export const DRAFT_LLM_TEMPERATURE = 0.4;

/** Modelo por defecto cuando `WHATSAPP_AGENT_LLM_MODEL` está ausente. */
const DEFAULT_DRAFT_MODEL = 'deepseek-v4-flash';

export type DraftTextSource = 'llm' | 'template';

export type FollowUpDraftTextResult = {
  body: string;
  templateName: string;
  source: DraftTextSource;
};

/** Firma mínima del proveedor de texto: inyectable en tests, sin red. */
export type FollowUpDraftProvider = (input: {
  system: string;
  prompt: string;
  timeoutMs: number;
  maxOutputTokens: number;
}) => Promise<string>;

const SYSTEM_PROMPT = [
  'Eres el asistente de recepción de un consultorio dental. Redactas UN mensaje breve de seguimiento para un paciente, en español de México, cálido y respetuoso, con tuteo, para que la secretaria lo revise y lo apruebe antes de contactar a la persona.',
  '',
  'Reglas del texto:',
  '- Un solo párrafo en texto plano: sin markdown, sin viñetas, sin emojis, sin firmas ni encabezados.',
  '- Longitud objetivo de 240 a 360 caracteres; límite duro de 600 caracteres.',
  '- No diagnosticar ni sugerir diagnósticos.',
  '- No mencionar medicamentos, recetas, antibióticos, analgésicos, infecciones ni dolor intenso.',
  '- No dar precios, costos, montos, descuentos ni promociones.',
  '- No mencionar horarios concretos ni ofrecer disponibilidad.',
  '- No crear presión ni urgencia.',
  '- No prometer resultados clínicos.',
  '- No pedir datos clínicos ni datos personales sensibles.',
  '- Cierra con una invitación suave a agendar o a resolver dudas, según el motivo.',
  '',
  'Responde únicamente con el texto del mensaje, sin explicaciones ni comentarios.',
].join('\n');

/** Intención del texto por motivo, sin datos clínicos ni comerciales. */
const REASON_INSTRUCTIONS: Record<FollowUpReason, string> = {
  no_show:
    'Retoma el contacto tras una cita no atendida e invita a agendar de nuevo, sin reclamo ni culpa.',
  treatment_in_progress:
    'Da seguimiento al plan de tratamiento y ofrece agendar la siguiente visita; no nombres procedimientos.',
  quote_no_response:
    'Ofrece resolver dudas sobre el plan de tratamiento e invita a una valoración; no menciones montos.',
  inactive:
    'Saluda tras un tiempo sin visita al consultorio e invita a agendar una revisión.',
};

const DATE_FORMATTER = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Mexico_City',
});

/** Fecha del caso en es-MX; nunca devuelve el ISO crudo del caso. */
function formatReasonDate(reasonDate: string): string {
  const date = new Date(reasonDate);
  if (Number.isNaN(date.getTime())) return 'sin fecha';
  return DATE_FORMATTER.format(date);
}

/**
 * Prompt del caso: solo datos no clínicos y no comerciales.
 *
 * `system` es invariante del caso (reglas de redacción) y `prompt` lleva
 * únicamente el primer nombre, la etiqueta del motivo, la instrucción del
 * motivo y la fecha de referencia. Nunca viajan teléfono, identificadores,
 * fechas de ronda, precios, agenda ni datos clínicos.
 */
export function buildFollowUpDraftPrompt(followUpCase: FollowUpCase): {
  system: string;
  prompt: string;
} {
  const prompt = [
    'Datos del caso:',
    `- Nombre: ${followUpFirstName(followUpCase.patientName)}`,
    `- Motivo: ${followUpCase.reasonLabel}`,
    `- Instrucción: ${REASON_INSTRUCTIONS[followUpCase.reason]}`,
    `- Fecha de referencia: ${formatReasonDate(followUpCase.reasonDate)}`,
    '',
    'Recuerda las restricciones de contenido indicadas y el máximo de 600 caracteres.',
  ].join('\n');

  return { system: SYSTEM_PROMPT, prompt };
}

/**
 * Provider OpenAI-compatible de Clara, o `null` si faltan llaves.
 *
 * Las variables se leen en cada llamada (lazy). Sin `apiKey` o sin `baseURL`
 * no se construye provider: la degradación a plantilla no toca la red.
 */
export function createDraftProviderFromEnv(): FollowUpDraftProvider | null {
  const apiKey = process.env.WHATSAPP_AGENT_LLM_API_KEY ?? '';
  const baseURL = process.env.WHATSAPP_AGENT_LLM_BASE_URL ?? '';
  const modelId = process.env.WHATSAPP_AGENT_LLM_MODEL ?? DEFAULT_DRAFT_MODEL;

  if (!apiKey || !baseURL) return null;

  // Misma normalización que `agents/eva/agent/model.ts`: el prefijo `proveedor/modelo`
  // se descarta porque el endpoint ya viene del `baseURL`.
  const modelName = modelId.includes('/')
    ? (modelId.split('/')[1] ?? modelId)
    : modelId;

  const provider = createOpenAICompatible({
    apiKey,
    baseURL,
    name: 'openai-compatible',
  });

  return async ({ system, prompt, timeoutMs, maxOutputTokens }) => {
    const { text } = await generateText({
      model: provider(modelName),
      system,
      prompt,
      maxOutputTokens,
      temperature: DRAFT_LLM_TEMPERATURE,
      maxRetries: 0,
      timeout: { totalMs: timeoutMs },
    });
    return text;
  };
}

/**
 * Texto del borrador de un caso: salida del LLM validada cuando está
 * habilitado y disponible, o plantilla determinista en cualquier otro caso.
 *
 * Nunca lanza por causas del LLM y el texto inválido del LLM nunca sale de
 * aquí: si viola un guardrail se descarta (el error real se registra una sola
 * vez, sin cuerpo del mensaje ni datos clínicos) y se devuelve la plantilla.
 */
export async function generateFollowUpDraftText(
  followUpCase: FollowUpCase,
  deps: {
    isEnabled?: () => boolean;
    provider?: FollowUpDraftProvider;
  } = {}
): Promise<FollowUpDraftTextResult> {
  const fallback = (): FollowUpDraftTextResult => {
    const { body, templateName } = buildFollowUpDraft({
      patientName: followUpCase.patientName,
      reason: followUpCase.reason,
    });
    return { body, templateName, source: 'template' };
  };

  const isEnabled = deps.isEnabled ?? isClaraDraftingEnabled;
  if (!isEnabled()) return fallback();

  const provider = deps.provider ?? createDraftProviderFromEnv();
  if (!provider) return fallback();

  try {
    const { system, prompt } = buildFollowUpDraftPrompt(followUpCase);
    const rawText = await provider({
      system,
      prompt,
      timeoutMs: DRAFT_LLM_TIMEOUT_MS,
      maxOutputTokens: DRAFT_LLM_MAX_OUTPUT_TOKENS,
    });

    return {
      body: validateFollowUpDraftText(rawText),
      templateName: FOLLOW_UP_TEMPLATE_NAME,
      source: 'llm',
    };
  } catch (error) {
    console.warn('[clara-drafting] llm fallback', {
      patientId: followUpCase.patientId,
      reason: followUpCase.reason,
      error,
    });
    return fallback();
  }
}
