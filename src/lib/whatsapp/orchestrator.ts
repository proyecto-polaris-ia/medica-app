/**
 * WhatsApp Orchestrator
 * 
 * Orquesta el procesamiento de mensajes de WhatsApp.
 * Routing basado en intent: flows determinísticos vs handlers directos.
 */

import { flowEngine } from '@/lib/flows/flow-engine';
import { getFlowDefinition } from '@/lib/flows/definitions/book-appointment.flow';
import type { FlowState, ExtractedEntities, FlowResult } from '@/lib/flows/types';
import {
  type WhatsAppInboundAgentDecision,
  type WhatsAppInboundAgentProvider,
  type WhatsAppKnowledgeEntry,
  type WhatsAppDynamicToolResult,
} from '@/lib/ai/whatsapp-inbound-agent';
import {
  classifyIntentSimple,
  extractEntities,
} from '@/lib/ai/whatsapp-intent-classifier';
import {
  analyzeFlowControl,
  generateTopicChangeConfirmation,
  generateCancellationConfirmation,
} from '@/lib/flows/flow-control';
import { debugLogger } from '@/lib/observability/debug-logger';
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
import type { NormalizedWhatsAppInboundEvent } from '@/lib/whatsapp/normalize';
import type { WhatsAppStore, PersistedWhatsAppInboundEvent, JsonPayload } from '@/lib/whatsapp/store';
import { recordWhatsAppAiEvent } from '@/lib/observability/whatsapp-ai';

// Constantes de configuración
const FLOW_TIMEOUT_MINUTES = 30;

// Tipos de resultado del orchestrator
export type OrchestratorResult = {
  decision: WhatsAppInboundAgentDecision;
  flowState?: FlowState;
  responseText: string;
  booked?: boolean;
  needsHuman?: boolean;
};

// Contexto del orchestrator
export type OrchestratorContext = {
  store: WhatsAppStore;
  persisted: PersistedWhatsAppInboundEvent;
  event: NormalizedWhatsAppInboundEvent;
  conversation: {
    id: string;
    flowState?: FlowState;
    bookingContext?: Record<string, unknown> | null;
    lastIntent?: string | null;
    recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    summary?: string | null;
  };
  knowledgeEntries: WhatsAppKnowledgeEntry[];
  agentProvider?: WhatsAppInboundAgentProvider;
};

/**
 * Procesa un mensaje de WhatsApp y determina la respuesta.
 */
export async function orchestrate(context: OrchestratorContext): Promise<OrchestratorResult> {
  const { event, conversation, knowledgeEntries, agentProvider } = context;

  debugLogger.info('Orchestrator', 'Processing message', { 
    body: event.body,
    hasFlowState: !!conversation.flowState,
    flowStateName: conversation.flowState?.name,
  });

  // 1. Verificar si hay un flujo activo
  const activeFlow = conversation.flowState;
  
  if (activeFlow && activeFlow.name !== 'complete') {
    debugLogger.orchestrator.checkActiveFlow(true, activeFlow);
    
    // Verificar timeout del flujo
    if (isFlowExpired(activeFlow)) {
      debugLogger.flow.timeout(activeFlow.flowName || 'unknown', activeFlow.lastActivity || '', FLOW_TIMEOUT_MINUTES);
      
      // Limpiar flowState y continuar con clasificación normal
      return await handleNewMessage(context);
    }
    
    // Clasificar intent para detectar control de flujo
    const classification = await classifyIntent(event, conversation, knowledgeEntries, agentProvider);
    
    // Analizar control de flujo
    const flowControl = analyzeFlowControl(
      event.body || '',
      activeFlow.name,
      activeFlow.pendingAction,
      classification.intent
    );
    
    debugLogger.debug('Orchestrator', 'Flow control analysis', { flowControl });
    
    // Manejar según el tipo de control
    switch (flowControl.type) {
      case 'cancel':
        // Cancelación explícita - pedir confirmación
        return handleCancellation(activeFlow, context);
      
      case 'confirm_exit_yes':
        // Usuario confirmó salir del flujo
        return handleFlowExit(activeFlow, context);
      
      case 'confirm_exit_no':
        // Usuario decidió continuar en el flujo
        return continueFlow(activeFlow, context);
      
      case 'topic_change':
        // Cambio de tema - preguntar si quiere salir
        return handleTopicChange(activeFlow, classification, context);
      
      case 'continue':
      default:
        // Continuar flujo normalmente
        return continueFlow(activeFlow, context);
    }
  }

  // 2. No hay flujo activo, procesar como mensaje nuevo
  debugLogger.orchestrator.checkActiveFlow(false);
  return await handleNewMessage(context);
}

/**
 * Verifica si el flujo ha expirado por timeout
 */
function isFlowExpired(flowState: FlowState): boolean {
  if (!flowState.lastActivity) return false;
  
  const lastActivity = new Date(flowState.lastActivity);
  const now = new Date();
  const diffMinutes = (now.getTime() - lastActivity.getTime()) / (1000 * 60);
  
  return diffMinutes > FLOW_TIMEOUT_MINUTES;
}

/**
 * Maneja un mensaje nuevo (sin flujo activo)
 */
async function handleNewMessage(context: OrchestratorContext): Promise<OrchestratorResult> {
  const { conversation, knowledgeEntries, agentProvider } = context;
  
  // Clasificar intent
  const classification = await classifyIntent(context.event, conversation, knowledgeEntries, agentProvider);
  
  // Routing según intent
  switch (classification.intent) {
    case 'inquiry':
      debugLogger.orchestrator.routing(classification.intent, 'handleKnowledgeQuery');
      return await handleKnowledgeQuery(classification, context);
    
    case 'book_appointment':
    case 'check_availability':
      debugLogger.orchestrator.routing(classification.intent, 'handleBookingFlow');
      return await handleBookingFlow(classification, context);
    
    case 'support':
    case 'handoff':
      debugLogger.orchestrator.routing(classification.intent, 'handleEscalation');
      return handleEscalation(classification, context);
    
    default:
      debugLogger.orchestrator.routing(classification.intent, 'handleFallback');
      return handleFallback(classification, context);
  }
}

/**
 * Maneja la cancelación explícita del flujo
 */
function handleCancellation(
  activeFlow: FlowState,
  context: OrchestratorContext
): OrchestratorResult {
  debugLogger.flow.cancel(activeFlow.flowName || 'unknown', 'explicit_cancellation');
  
  // Marcar acción pendiente de confirmación
  const updatedFlowState: FlowState = {
    ...activeFlow,
    pendingAction: 'confirm_cancel',
    lastActivity: new Date().toISOString(),
  };
  
  return {
    decision: createFallbackDecision(),
    flowState: updatedFlowState,
    responseText: generateCancellationConfirmation(),
  };
}

/**
 * Maneja la salida confirmada del flujo
 */
function handleFlowExit(
  activeFlow: FlowState,
  context: OrchestratorContext
): OrchestratorResult {
  debugLogger.info('Orchestrator', 'User confirmed flow exit');
  
  // Limpiar flowState (marcar como completo para que se limpie)
  const clearedFlowState: FlowState = {
    name: 'complete',
    entities: {},
    lastActivity: new Date().toISOString(),
  };
  
  return {
    decision: createFallbackDecision(),
    flowState: clearedFlowState,
    responseText: 'Entendido. He cancelado el proceso. ¿En qué más puedo ayudarte?',
  };
}

/**
 * Maneja el cambio de tema durante un flujo activo
 */
function handleTopicChange(
  activeFlow: FlowState,
  classification: WhatsAppInboundAgentDecision,
  context: OrchestratorContext
): OrchestratorResult {
  debugLogger.info('Orchestrator', 'Topic change detected during active flow');
  
  // Marcar acción pendiente de confirmación
  const updatedFlowState: FlowState = {
    ...activeFlow,
    pendingAction: 'confirm_exit',
    lastActivity: new Date().toISOString(),
  };
  
  return {
    decision: createFallbackDecision(),
    flowState: updatedFlowState,
    responseText: generateTopicChangeConfirmation(activeFlow.flowName || 'book_appointment'),
  };
}

/**
 * Continúa un flujo activo
 */
async function continueFlow(
  activeFlow: FlowState,
  context: OrchestratorContext
): Promise<OrchestratorResult> {
  const { event, persisted } = context;
  
  debugLogger.info('Orchestrator', 'Continuing active flow', { 
    flowName: activeFlow.flowName,
    currentState: activeFlow.name,
  });
  
  // Determinar qué flujo continuar (por ahora solo book_appointment)
  const flowName = activeFlow.flowName || 'book_appointment';
  const flow = getFlowDefinition(flowName);
  
  // Extraer entidades del mensaje actual
  const entities = extractEntities(event.body || '');
  
  debugLogger.debug('Orchestrator', 'Extracted entities for flow continuation', { entities });
  
  // Ejecutar flow engine con el estado actual
  let result = flowEngine.execute(flow, activeFlow, entities);
  
  debugLogger.flow.transition(flowName, activeFlow.name, result.nextState.name, result.nextState.entities);
  
  // Procesar acciones del flujo
  while (result.action !== 'ask' && result.action !== 'complete') {
    const actionResult = await executeFlowAction(result, event, persisted);
    
    debugLogger.flow.action(flowName, result.nextState.name, result.action, actionResult);
    
    if (actionResult.success) {
      const nextState = { 
        ...result.nextState, 
        metadata: { ...result.nextState.metadata, ...actionResult.metadata }
      };
      result = flowEngine.advance(flow, nextState, actionResult.transition!, actionResult.entities);
      
      debugLogger.flow.transition(flowName, result.nextState.name, result.nextState.name, result.nextState.entities);
    } else {
      return {
        decision: createFallbackDecision(),
        flowState: { ...result.nextState, lastActivity: new Date().toISOString() },
        responseText: actionResult.error || 'Ocurrió un error. Una persona del consultorio te dará seguimiento.',
        needsHuman: true,
      };
    }
  }
  
  // Generar respuesta
  const responseText = await generateFlowResponse(result, context);
  
  debugLogger.flow.complete(flowName, result.action === 'complete');
  
  return {
    decision: createFallbackDecision(),
    flowState: { 
      ...result.nextState, 
      flowName,
      lastActivity: new Date().toISOString(),
      pendingAction: undefined, // Limpiar acción pendiente
    },
    responseText,
    booked: result.action === 'complete' && result.nextState.name === 'complete',
  };
}

/**
 * Crea una decisión fallback para flujos continuados
 */
function createFallbackDecision(): WhatsAppInboundAgentDecision {
  return {
    intent: 'book_appointment',
    summary: 'Continuación de flujo activo',
    confidence: 1,
    decision: 'tool_action',
    responseText: '',
    citedKnowledgeIds: [],
    citedToolCallIds: [],
  };
}

/**
 * Clasifica el intent del mensaje usando clasificación simple (sin LLM).
 */
async function classifyIntent(
  event: NormalizedWhatsAppInboundEvent,
  conversation: OrchestratorContext['conversation'],
  knowledgeEntries: WhatsAppKnowledgeEntry[],
  agentProvider?: WhatsAppInboundAgentProvider
): Promise<WhatsAppInboundAgentDecision> {
  if (event.messageType !== 'text' || !event.body) {
    return {
      intent: 'unknown',
      summary: `Mensaje ${event.messageType} recibido`,
      confidence: 1,
      decision: 'needs_human',
      escalationReason: 'Mensaje no es texto',
      responseText: 'Por ahora solo puedo procesar mensajes de texto.',
      citedKnowledgeIds: [],
      citedToolCallIds: [],
    };
  }

  debugLogger.classify.input(event.body);

  // Clasificación simple sin LLM
  const classification = classifyIntentSimple(event.body);
  const entities = extractEntities(event.body);

  debugLogger.classify.result(classification.intent, classification.confidence, entities);

  // Convertir a formato de decisión
  const decision: WhatsAppInboundAgentDecision = {
    intent: classification.intent,
    summary: classification.summary,
    confidence: classification.confidence,
    decision: classification.intent === 'support' ? 'needs_human' : 'tool_action',
    responseText: '', // Se generará después
    citedKnowledgeIds: [],
    citedToolCallIds: [],
    toolAction: classification.intent === 'book_appointment' || classification.intent === 'check_availability' ? {
      name: 'check_availability',
      args: {
        localDate: entities.localDate,
        serviceName: entities.serviceName,
        providerName: entities.providerName,
      },
    } : undefined,
  };

  recordWhatsAppAiEvent({
    type: 'ai.decision',
    outcome: 'success',
    diagnostics: {
      intent: decision.intent,
      confidence: decision.confidence,
      method: 'simple_classifier',
    },
  });

  return decision;
}

/**
 * Handler para consultas de knowledge.
 * LLM busca en knowledge y redacta respuesta directamente.
 */
async function handleKnowledgeQuery(
  classification: WhatsAppInboundAgentDecision,
  context: OrchestratorContext
): Promise<OrchestratorResult> {
  return {
    decision: classification,
    responseText: classification.responseText || 'Gracias por escribirnos.',
  };
}

/**
 * Handler para flujo de booking.
 * Usa Flow Engine para lógica determinística.
 */
async function handleBookingFlow(
  classification: WhatsAppInboundAgentDecision,
  context: OrchestratorContext
): Promise<OrchestratorResult> {
  const { conversation, event, persisted } = context;
  const flow = getFlowDefinition('book_appointment');

  debugLogger.flow.start('book_appointment', 'initial', classification.toolAction?.args);

  // Obtener o crear estado del flujo
  let flowState = conversation.flowState || flowEngine.createInitialState(flow);
  
  // Establecer flowName y lastActivity si es un flujo nuevo
  if (!flowState.flowName) {
    flowState = {
      ...flowState,
      flowName: 'book_appointment',
      lastActivity: new Date().toISOString(),
    };
  }

  // Extraer entidades de la clasificación
  const entities: ExtractedEntities = extractEntitiesFromClassification(classification);

  debugLogger.debug('Orchestrator', 'Starting booking flow', { 
    currentState: flowState.name,
    entities,
  });

  // Ejecutar flow engine
  let result = flowEngine.execute(flow, flowState, entities);

  debugLogger.flow.transition('book_appointment', flowState.name, result.nextState.name, result.nextState.entities);

  // Procesar acciones del flujo
  while (result.action !== 'ask' && result.action !== 'complete') {
    const actionResult = await executeFlowAction(result, event, persisted);
    
    debugLogger.flow.action('book_appointment', result.nextState.name, result.action, actionResult);
    
    if (actionResult.success) {
      const nextState = { 
        ...result.nextState, 
        metadata: { ...result.nextState.metadata, ...actionResult.metadata }
      };
      result = flowEngine.advance(flow, nextState, actionResult.transition!, actionResult.entities);
      
      debugLogger.flow.transition('book_appointment', result.nextState.name, result.nextState.name, result.nextState.entities);
    } else {
      // Error en acción, pedir reintento o escalar
      return {
        decision: classification,
        flowState: { ...result.nextState, flowName: 'book_appointment', lastActivity: new Date().toISOString() },
        responseText: actionResult.error || 'Ocurrió un error. Una persona del consultorio te dará seguimiento.',
        needsHuman: true,
      };
    }
  }

  // Generar respuesta final
  const responseText = await generateFlowResponse(result, context);

  debugLogger.flow.complete('book_appointment', result.action === 'complete');

  return {
    decision: classification,
    flowState: { 
      ...result.nextState, 
      flowName: 'book_appointment',
      lastActivity: new Date().toISOString(),
    },
    responseText,
    booked: result.action === 'complete' && result.nextState.name === 'complete',
  };
}

/**
 * Extrae entidades de la clasificación del LLM.
 */
function extractEntitiesFromClassification(classification: WhatsAppInboundAgentDecision): ExtractedEntities {
  const toolAction = classification.toolAction;
  if (!toolAction) return {};

  return {
    localDate: toolAction.args.localDate,
    serviceId: toolAction.args.serviceId,
    serviceName: toolAction.args.serviceName,
    providerId: toolAction.args.providerId,
    providerName: toolAction.args.providerName,
    startAt: toolAction.args.startAt,
    endAt: toolAction.args.endAt,
    notes: toolAction.args.fullName, // TODO: separar notes de fullName
    selectedCandidateIndex: toolAction.args.selectedCandidateIndex !== undefined 
      ? toolAction.args.selectedCandidateIndex 
      : undefined,
    knowledgeServiceName: toolAction.args.knowledgeServiceName,
  };
}

/**
 * Ejecuta una acción del flujo.
 */
async function executeFlowAction(
  result: FlowResult,
  event: NormalizedWhatsAppInboundEvent,
  persisted: PersistedWhatsAppInboundEvent
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

      // Guardar candidatos en metadata
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

      const patient = await resolvePatient({
        phone: event.fromPhone,
        fullName: event.profileName,
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

/**
 * Genera respuesta natural para el estado del flujo.
 */
async function generateFlowResponse(
  result: FlowResult,
  context: OrchestratorContext
): Promise<string> {
  const { entities, metadata } = result.nextState;
  let prompt = result.prompt;

  // Reemplazar placeholders
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

  return prompt;
}

/**
 * Handler para escalaciones.
 */
function handleEscalation(
  classification: WhatsAppInboundAgentDecision,
  context: OrchestratorContext
): OrchestratorResult {
  return {
    decision: classification,
    responseText: classification.responseText || 'Una persona del consultorio te dará seguimiento.',
    needsHuman: true,
  };
}

/**
 * Handler fallback para intents desconocidos.
 */
function handleFallback(
  classification: WhatsAppInboundAgentDecision,
  context: OrchestratorContext
): OrchestratorResult {
  return {
    decision: classification,
    responseText: 'Gracias por escribirnos. Una persona del consultorio revisará tu mensaje.',
    needsHuman: true,
  };
}

// Utilidades de formato
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
