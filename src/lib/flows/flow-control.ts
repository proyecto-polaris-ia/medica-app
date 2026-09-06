/**
 * Flow Control Detector
 * 
 * Detecta:
 * - Cancelación explícita del flujo
 * - Cambio de tema (interrupción del flujo)
 * - Confirmación de acciones pendientes
 */

import { debugLogger } from '@/lib/observability/debug-logger';

export type FlowControlResult = {
  type: 'continue' | 'cancel' | 'confirm_exit_yes' | 'confirm_exit_no' | 'topic_change';
  confidence: number;
  detectedIntent?: string;
};

// Patrones de cancelación explícita
const CANCEL_PATTERNS = [
  /\b(cancelar|salir|terminar|detener|stop|cancel)\b/i,
  /\b(no quiero|ya no|basta|suficiente)\b/i,
  /\b(olvida|olvídalo|déjalo)\b/i,
  /\b(empezar de nuevo|reiniciar|restart)\b/i,
];

// Patrones de confirmación afirmativa
const CONFIRM_YES_PATTERNS = [
  /^(sí|si|yes|ok|okay|dale|confirmo|confirmar|claro|por supuesto|afirmativo)$/i,
  /^(sí,? (quiero|continúo|confirmo))$/i,
  /^(adelante|procede|continúa)$/i,
];

// Patrones de confirmación negativa
const CONFIRM_NO_PATTERNS = [
  /^(no|nel|nopes|negativo)$/i,
  /^(no,? (quiero|continúo|confirmo))$/i,
  /^(mejor no|paso|skip)$/i,
];

/**
 * Detecta si el mensaje es una cancelación explícita del flujo
 */
export function detectCancellation(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  const isCancel = CANCEL_PATTERNS.some(pattern => pattern.test(normalized));
  
  if (isCancel) {
    debugLogger.info('FlowControl', 'Cancellation detected', { message });
  }
  
  return isCancel;
}

/**
 * Detecta si el mensaje es una confirmación (sí/no)
 */
export function detectConfirmation(message: string): 'yes' | 'no' | null {
  const normalized = message.trim().toLowerCase();
  
  if (CONFIRM_YES_PATTERNS.some(pattern => pattern.test(normalized))) {
    debugLogger.info('FlowControl', 'Confirmation YES detected', { message });
    return 'yes';
  }
  
  if (CONFIRM_NO_PATTERNS.some(pattern => pattern.test(normalized))) {
    debugLogger.info('FlowControl', 'Confirmation NO detected', { message });
    return 'no';
  }
  
  return null;
}

/**
 * Detecta si el mensaje es un cambio de tema (no relacionado con el flujo actual)
 */
export function detectTopicChange(
  message: string,
  currentFlowState: string,
  classifiedIntent: string
): boolean {
  // Si el intent clasificado es diferente al flujo activo, es cambio de tema
  const isTopicChange = classifiedIntent !== 'book_appointment' && 
                        classifiedIntent !== 'check_availability' &&
                        classifiedIntent !== 'unknown';
  
  if (isTopicChange) {
    debugLogger.orchestrator.topicChange(currentFlowState, classifiedIntent);
  }
  
  return isTopicChange;
}

/**
 * Analiza el control de flujo del mensaje
 */
export function analyzeFlowControl(
  message: string,
  currentFlowState: string | null,
  pendingAction: string | undefined,
  classifiedIntent: string
): FlowControlResult {
  // Si no hay flujo activo, continuar normalmente
  if (!currentFlowState) {
    return { type: 'continue', confidence: 1 };
  }

  // Si hay una acción pendiente de confirmación
  if (pendingAction === 'confirm_exit') {
    const confirmation = detectConfirmation(message);
    
    if (confirmation === 'yes') {
      debugLogger.info('FlowControl', 'User confirmed exit from flow');
      return { type: 'confirm_exit_yes', confidence: 0.95 };
    }
    
    if (confirmation === 'no') {
      debugLogger.info('FlowControl', 'User declined exit, continuing flow');
      return { type: 'confirm_exit_no', confidence: 0.95 };
    }
    
    // Si no es confirmación clara, tratar como continuación
    return { type: 'continue', confidence: 0.5 };
  }

  // Detectar cancelación explícita
  if (detectCancellation(message)) {
    return { type: 'cancel', confidence: 0.9 };
  }

  // Detectar cambio de tema
  if (detectTopicChange(message, currentFlowState, classifiedIntent)) {
    return { 
      type: 'topic_change', 
      confidence: 0.8,
      detectedIntent: classifiedIntent 
    };
  }

  // Continuar flujo normalmente
  return { type: 'continue', confidence: 1 };
}

/**
 * Genera mensaje de confirmación para cambio de tema
 */
export function generateTopicChangeConfirmation(currentFlowName: string): string {
  const flowNames: Record<string, string> = {
    'book_appointment': 'la creación de cita',
    'reschedule_appointment': 'la reprogramación de cita',
    'cancel_appointment': 'la cancelación de cita',
  };

  const flowDescription = flowNames[currentFlowName] || 'el proceso actual';
  
  return `¿Quieres salir de ${flowDescription} para atender tu consulta? Responde "sí" para salir o "no" para continuar.`;
}

/**
 * Genera mensaje de confirmación para cancelación
 */
export function generateCancellationConfirmation(): string {
  return '¿Estás seguro de que quieres cancelar el proceso? Responde "sí" para confirmar o "no" para continuar.';
}
