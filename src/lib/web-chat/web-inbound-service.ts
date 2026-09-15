import { flowEngine } from '@/lib/flows/flow-engine';
import { getFlowDefinition } from '@/lib/flows/definitions/book-appointment.flow';
import type { FlowState, ExtractedEntities, FlowResult } from '@/lib/flows/types';
import {
  classifyIntentSimple,
  extractEntities,
} from '@/lib/ai/whatsapp-intent-classifier';
import {
  analyzeFlowControl,
  generateTopicChangeConfirmation,
  generateCancellationConfirmation,
} from '@/lib/flows/flow-control';
import {
  getFreeSlots,
} from '@/lib/booking/availability';
import {
  bookAppointment,
} from '@/lib/booking/booking';
import {
  resolveServiceByName,
  resolveProviderByName,
  listServices,
  listProviders,
} from '@/lib/booking/catalog';
import {
  resolvePatient,
} from '@/lib/booking/patient-resolution';
import {
  findNextAvailable,
} from '@/lib/booking/next-available';
import {
  getWebChatSession,
  updateWebChatSession,
  insertWebChatMessage,
  getWebChatHistory,
  type WebChatSession,
} from './store';

const FLOW_TIMEOUT_MINUTES = 30;

export type WebChatMessageRequest = {
  sessionId: string;
  message: string;
  phone?: string;
  fullName?: string;
};

export type WebChatMessageResponse = {
  reply: string;
  flowState?: FlowState;
  requiresPhone?: boolean;
  booked?: boolean;
  needsHuman?: boolean;
};

export async function processWebChatMessage(
  request: WebChatMessageRequest
): Promise<WebChatMessageResponse> {
  const session = await getWebChatSession(request.sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  await insertWebChatMessage(request.sessionId, 'user', request.message);

  const history = await getWebChatHistory(request.sessionId, 10);

  const response = await orchestrateWebChat(session, request, history);

  await insertWebChatMessage(request.sessionId, 'assistant', response.reply);

  if (response.flowState) {
    await updateWebChatSession(request.sessionId, {
      flow_state: response.flowState,
      last_intent: response.flowState.flowName,
      last_activity: new Date().toISOString(),
      ...(request.phone ? { phone_e164: request.phone } : {}),
    });
  }

  return response;
}

async function orchestrateWebChat(
  session: WebChatSession,
  request: WebChatMessageRequest,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<WebChatMessageResponse> {
  const activeFlow = session.flow_state;

  if (activeFlow && activeFlow.name !== 'complete') {
    if (isFlowExpired(activeFlow)) {
      return await handleNewWebMessage(session, request, history);
    }

    const classification = classifyIntentSimple(request.message);
    const flowControl = analyzeFlowControl(
      request.message,
      activeFlow.name,
      activeFlow.pendingAction,
      classification.intent
    );

    switch (flowControl.type) {
      case 'cancel':
        return handleCancellation(activeFlow);
      case 'confirm_exit_yes':
        return handleFlowExit();
      case 'confirm_exit_no':
        return await continueFlow(activeFlow, request, session);
      case 'topic_change':
        return handleTopicChange(activeFlow);
      case 'continue':
      default:
        return await continueFlow(activeFlow, request, session);
    }
  }

  return await handleNewWebMessage(session, request, history);
}

function isFlowExpired(flowState: FlowState): boolean {
  if (!flowState.lastActivity) return false;
  const lastActivity = new Date(flowState.lastActivity);
  const now = new Date();
  const diffMinutes = (now.getTime() - lastActivity.getTime()) / (1000 * 60);
  return diffMinutes > FLOW_TIMEOUT_MINUTES;
}

async function handleNewWebMessage(
  session: WebChatSession,
  request: WebChatMessageRequest,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<WebChatMessageResponse> {
  const classification = classifyIntentSimple(request.message);

  switch (classification.intent) {
    case 'inquiry':
      return {
        reply: await handleKnowledgeQuery(request.message),
      };

    case 'book_appointment':
    case 'check_availability':
      return await handleBookingFlow(request, session);

    case 'support':
    case 'handoff':
      return {
        reply: 'Entendido. Una persona del consultorio te dará seguimiento.',
        needsHuman: true,
      };

    default:
      return {
        reply: 'Gracias por escribirnos. ¿En qué puedo ayudarte? Puedo responder preguntas sobre nuestros servicios o ayudarte a agendar una cita.',
      };
  }
}

async function handleKnowledgeQuery(message: string): Promise<string> {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('horario') || lowerMessage.includes('hora')) {
    return 'Nuestros horarios de atención son de lunes a viernes de 9:00 a 14:00 y de 16:00 a 20:00. Sábados de 9:00 a 14:00.';
  }

  if (lowerMessage.includes('dirección') || lowerMessage.includes('ubicación') || lowerMessage.includes('dónde')) {
    return 'Estamos ubicados en [dirección del consultorio]. ¿Te gustaría agendar una cita?';
  }

  if (lowerMessage.includes('servicio') || lowerMessage.includes('tratamiento')) {
    const services = await listServices();
    const servicesList = services.map(s => `- ${s.name}`).join('\n');
    return `Ofrecemos los siguientes servicios:\n${servicesList}\n\n¿Te gustaría agendar alguna cita?`;
  }

  if (lowerMessage.includes('precio') || lowerMessage.includes('costo') || lowerMessage.includes('cuánto')) {
    return 'Los costos varían según el tratamiento. Te invito a agendar una valoración para que el doctor pueda evaluarte y darte un presupuesto personalizado.';
  }

  return 'Gracias por tu mensaje. ¿En qué puedo ayudarte? Puedo responder preguntas sobre nuestros servicios, horarios o ayudarte a agendar una cita.';
}

async function handleBookingFlow(
  request: WebChatMessageRequest,
  session: WebChatSession
): Promise<WebChatMessageResponse> {
  const flow = getFlowDefinition('book_appointment');
  let flowState = session.flow_state || flowEngine.createInitialState(flow);

  if (!flowState.flowName) {
    flowState = {
      ...flowState,
      flowName: 'book_appointment',
      lastActivity: new Date().toISOString(),
    };
  }

  const entities = extractEntities(request.message);
  let result = flowEngine.execute(flow, flowState, entities);

  while (result.action !== 'ask' && result.action !== 'complete') {
    const actionResult = await executeWebFlowAction(result, request, session);

    if (actionResult.success) {
      const nextState = {
        ...result.nextState,
        metadata: { ...result.nextState.metadata, ...actionResult.metadata }
      };
      result = flowEngine.advance(flow, nextState, actionResult.transition!, actionResult.entities);
    } else {
      return {
        flowState: { ...result.nextState, lastActivity: new Date().toISOString() },
        reply: actionResult.error || 'Ocurrió un error. Una persona del consultorio te dará seguimiento.',
        needsHuman: true,
      };
    }
  }

  const responseText = await generateWebFlowResponse(result, session);

  const requiresPhone = result.action === 'complete' && result.nextState.name === 'complete' && !session.phone_e164;

  return {
    flowState: {
      ...result.nextState,
      flowName: 'book_appointment',
      lastActivity: new Date().toISOString(),
    },
    reply: responseText,
    requiresPhone,
    booked: result.action === 'complete' && result.nextState.name === 'complete',
  };
}

async function continueFlow(
  activeFlow: FlowState,
  request: WebChatMessageRequest,
  session: WebChatSession
): Promise<WebChatMessageResponse> {
  const flowName = activeFlow.flowName || 'book_appointment';
  const flow = getFlowDefinition(flowName);
  const entities = extractEntities(request.message);

  let result = flowEngine.execute(flow, activeFlow, entities);

  while (result.action !== 'ask' && result.action !== 'complete') {
    const actionResult = await executeWebFlowAction(result, request, session);

    if (actionResult.success) {
      const nextState = {
        ...result.nextState,
        metadata: { ...result.nextState.metadata, ...actionResult.metadata }
      };
      result = flowEngine.advance(flow, nextState, actionResult.transition!, actionResult.entities);
    } else {
      return {
        flowState: { ...result.nextState, lastActivity: new Date().toISOString() },
        reply: actionResult.error || 'Ocurrió un error. Una persona del consultorio te dará seguimiento.',
        needsHuman: true,
      };
    }
  }

  const responseText = await generateWebFlowResponse(result, session);
  const requiresPhone = result.action === 'complete' && result.nextState.name === 'complete' && !session.phone_e164;

  return {
    flowState: {
      ...result.nextState,
      flowName,
      lastActivity: new Date().toISOString(),
      pendingAction: undefined,
    },
    reply: responseText,
    requiresPhone,
    booked: result.action === 'complete' && result.nextState.name === 'complete',
  };
}

async function executeWebFlowAction(
  result: FlowResult,
  request: WebChatMessageRequest,
  session: WebChatSession
): Promise<{ success: boolean; transition?: string; entities?: ExtractedEntities; metadata?: Record<string, unknown>; error?: string }> {
  const { entities } = result.nextState;

  switch (result.action) {
    case 'getFreeSlots': {
      if (!entities.serviceId || !entities.providerId || !entities.localDate) {
        return { success: false, error: 'Faltan datos para consultar disponibilidad.' };
      }

      const slots = await getFreeSlots({
        providerId: entities.providerId,
        serviceId: entities.serviceId,
        localDate: parseLocalDate(entities.localDate),
      });

      if (slots.length === 0) {
        return { success: true, transition: 'no_slots' };
      }

      const candidates = slots.slice(0, 3).map(slot => ({
        startAt: slot.start_at.toISOString(),
        endAt: slot.end_at.toISOString(),
        serviceId: entities.serviceId,
        providerId: entities.providerId,
      }));

      return {
        success: true,
        transition: 'has_slots',
        metadata: { candidates },
      };
    }

    case 'bookAppointment': {
      if (!entities.serviceId || !entities.providerId || !entities.startAt || !entities.endAt) {
        return { success: false, error: 'Faltan datos para agendar.' };
      }

      if (!request.phone) {
        return { success: false, error: 'Para confirmar tu cita necesito tu número de teléfono.' };
      }

      const patient = await resolvePatient({
        phone: request.phone,
        fullName: request.fullName || 'Paciente Web',
      });

      const bookingResult = await bookAppointment({
        patientId: patient.id,
        serviceId: entities.serviceId,
        providerId: entities.providerId,
        startAt: new Date(entities.startAt),
        endAt: new Date(entities.endAt),
        notes: entities.notes,
      });

      if ('type' in bookingResult) {
        return { success: false, error: 'Ese horario ya no está disponible.' };
      }

      return { success: true, transition: 'has_notes' };
    }

    case 'resolveService': {
      if (!entities.serviceName) {
        return { success: false, error: 'No se especificó servicio.' };
      }

      const service = await resolveServiceByName(entities.serviceName);
      if (!service) {
        return { success: false, error: `No encontré el servicio "${entities.serviceName}".` };
      }

      return {
        success: true,
        transition: 'has_service',
        entities: { ...entities, serviceId: service.id },
      };
    }

    case 'resolveProvider': {
      if (!entities.providerName) {
        return { success: false, error: 'No se especificó doctor.' };
      }

      const provider = await resolveProviderByName(entities.providerName);
      if (!provider) {
        return { success: false, error: `No encontré al doctor "${entities.providerName}".` };
      }

      return {
        success: true,
        transition: 'has_provider',
        entities: { ...entities, providerId: provider.id },
      };
    }

    default:
      return { success: false, error: `Acción desconocida: ${result.action}` };
  }
}

async function generateWebFlowResponse(
  result: FlowResult,
  session: WebChatSession
): Promise<string> {
  const { entities, metadata } = result.nextState;
  let prompt = result.prompt;

  if (prompt.includes('{services}')) {
    const services = await listServices();
    prompt = prompt.replace('{services}', services.map(s => s.name).join(', '));
  }

  if (prompt.includes('{providers}')) {
    const providers = await listProviders();
    prompt = prompt.replace('{providers}', providers.map(p => p.name).join(', '));
  }

  if (prompt.includes('{date}') && entities.localDate) {
    const date = new Date(entities.localDate);
    prompt = prompt.replace('{date}', formatDate(date));
  }

  if (prompt.includes('{slots}')) {
    const candidates = (metadata?.candidates as any[]) || [];
    const slotsText = candidates.map((slot: any, index: number) => {
      const start = new Date(slot.startAt);
      return `${index + 1}) ${formatTime(start)}`;
    }).join('\n');
    prompt = prompt.replace('{slots}', slotsText);
  }

  if (prompt.includes('{slotTime}') && entities.startAt) {
    const start = new Date(entities.startAt);
    prompt = prompt.replace('{slotTime}', formatTime(start));
  }

  if (prompt.includes('{datetime}') && entities.startAt) {
    const start = new Date(entities.startAt);
    prompt = prompt.replace('{datetime}', formatDateTime(start));
  }

  if (prompt.includes('{provider}') && entities.providerName) {
    prompt = prompt.replace('{provider}', entities.providerName);
  }

  if (result.action === 'complete' && result.nextState.name === 'complete') {
    if (!session.phone_e164) {
      prompt += '\n\nPara confirmar tu cita, por favor compárteme tu número de teléfono.';
    }
  }

  return prompt;
}

function handleCancellation(activeFlow: FlowState): WebChatMessageResponse {
  const updatedFlowState: FlowState = {
    ...activeFlow,
    pendingAction: 'confirm_cancel',
    lastActivity: new Date().toISOString(),
  };

  return {
    flowState: updatedFlowState,
    reply: generateCancellationConfirmation(),
  };
}

function handleFlowExit(): WebChatMessageResponse {
  const clearedFlowState: FlowState = {
    name: 'complete',
    entities: {},
    lastActivity: new Date().toISOString(),
  };

  return {
    flowState: clearedFlowState,
    reply: 'Entendido. He cancelado el proceso. ¿En qué más puedo ayudarte?',
  };
}

function handleTopicChange(activeFlow: FlowState): WebChatMessageResponse {
  const updatedFlowState: FlowState = {
    ...activeFlow,
    pendingAction: 'confirm_exit',
    lastActivity: new Date().toISOString(),
  };

  return {
    flowState: updatedFlowState,
    reply: generateTopicChangeConfirmation(activeFlow.flowName || 'book_appointment'),
  };
}

function parseLocalDate(value: string): Date {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00-06:00` : value;
  return new Date(normalized);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(date);
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
