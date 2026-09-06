/**
 * Debug Logger con niveles configurables
 * 
 * Niveles:
 * - 0: Sin logging (producción)
 * - 1: Errores y warnings críticos
 * - 2: Info de flujos y decisiones importantes
 * - 3: Debug detallado (entidades, estados, transiciones)
 */

export type DebugLevel = 0 | 1 | 2 | 3;

function getDebugLevel(): DebugLevel {
  const level = parseInt(process.env.DEBUG_LEVEL || '0', 10);
  return (level >= 0 && level <= 3 ? level : 0) as DebugLevel;
}

const DEBUG_LEVEL = getDebugLevel();

export const debugLogger = {
  error: (component: string, message: string, data?: unknown) => {
    if (DEBUG_LEVEL >= 1) {
      console.error(`[${component}] ERROR:`, message, data || '');
    }
  },

  warn: (component: string, message: string, data?: unknown) => {
    if (DEBUG_LEVEL >= 1) {
      console.warn(`[${component}] WARN:`, message, data || '');
    }
  },

  info: (component: string, message: string, data?: unknown) => {
    if (DEBUG_LEVEL >= 2) {
      console.log(`[${component}] INFO:`, message, data || '');
    }
  },

  debug: (component: string, message: string, data?: unknown) => {
    if (DEBUG_LEVEL >= 3) {
      console.log(`[${component}] DEBUG:`, message, JSON.stringify(data, null, 2));
    }
  },

  // Helper para logging de flujos
  flow: {
    start: (flowName: string, state: string, entities: unknown) => {
      debugLogger.info('Flow', `Starting flow: ${flowName}, state: ${state}`, { entities });
    },

    transition: (flowName: string, fromState: string, toState: string, entities: unknown) => {
      debugLogger.info('Flow', `Transition: ${fromState} → ${toState}`, { flowName, entities });
    },

    action: (flowName: string, state: string, action: string, result: unknown) => {
      debugLogger.debug('Flow', `Executing action: ${action} in state: ${state}`, { flowName, result });
    },

    complete: (flowName: string, success: boolean) => {
      debugLogger.info('Flow', `Flow completed: ${flowName}`, { success });
    },

    timeout: (flowName: string, lastActivity: string, timeoutMinutes: number) => {
      debugLogger.warn('Flow', `Flow timed out: ${flowName}`, { lastActivity, timeoutMinutes });
    },

    cancel: (flowName: string, reason: string) => {
      debugLogger.info('Flow', `Flow cancelled: ${flowName}`, { reason });
    },
  },

  // Helper para logging de clasificación
  classify: {
    input: (message: string) => {
      debugLogger.debug('Classify', 'Classifying message', { message });
    },

    result: (intent: string, confidence: number, entities: unknown) => {
      debugLogger.debug('Classify', 'Classification result', { intent, confidence, entities });
    },
  },

  // Helper para logging de orchestrator
  orchestrator: {
    checkActiveFlow: (hasActiveFlow: boolean, flowState?: unknown) => {
      debugLogger.debug('Orchestrator', 'Checking for active flow', { hasActiveFlow, flowState });
    },

    routing: (intent: string, handler: string) => {
      debugLogger.info('Orchestrator', `Routing to handler: ${handler}`, { intent });
    },

    topicChange: (currentFlow: string, detectedIntent: string) => {
      debugLogger.info('Orchestrator', 'Topic change detected', { currentFlow, detectedIntent });
    },
  },
};
