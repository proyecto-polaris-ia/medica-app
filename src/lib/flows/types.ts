/**
 * Flow Engine Types
 * 
 * Define la estructura para flujos conversacionales determinísticos.
 * Cada flujo tiene estados, transiciones y acciones.
 */

// Entidades extraídas del mensaje del usuario
export type ExtractedEntities = {
  localDate?: string;
  serviceId?: string;
  serviceName?: string;
  providerId?: string;
  providerName?: string;
  startAt?: string;
  endAt?: string;
  notes?: string;
  selectedCandidateIndex?: number;
  knowledgeServiceName?: string;
  [key: string]: string | number | undefined;
};

// Estado actual del flujo
export type FlowState = {
  name: string;
  entities: ExtractedEntities;
  candidates?: Array<{
    startAt: string;
    endAt: string;
    serviceId?: string;
    providerId?: string;
  }>;
  attempts?: number;
  metadata?: Record<string, unknown>;
};

// Definición de un estado en el flujo
export type FlowStateDefinition = {
  // Entidades requeridas para avanzar
  required?: Array<keyof ExtractedEntities>;
  // Entidades opcionales
  optional?: Array<keyof ExtractedEntities>;
  // Acción a ejecutar cuando se cumplen las entidades
  action?: 'getFreeSlots' | 'bookAppointment' | 'resolveService' | 'resolveProvider';
  // Prompt para pedir información al usuario
  prompt: string;
  // Transiciones posibles basadas en resultado
  transitions?: {
    [key: string]: string; // resultado -> nombre del siguiente estado
  };
  // Si es estado terminal
  terminal?: boolean;
};

// Definición completa de un flujo
export type FlowDefinition = {
  name: string;
  initialState: string;
  states: {
    [stateName: string]: FlowStateDefinition;
  };
};

// Resultado de ejecutar el flow engine
export type FlowResult = {
  nextState: FlowState;
  action: 'ask' | 'getFreeSlots' | 'bookAppointment' | 'resolveService' | 'resolveProvider' | 'complete';
  prompt: string;
  missingEntity?: keyof ExtractedEntities;
  data?: unknown;
};

// Contexto de conversación para el flow engine
export type FlowContext = {
  conversationId: string;
  flowState: FlowState;
  contact: {
    id?: string;
    phone?: string;
    profileName?: string;
  };
};
