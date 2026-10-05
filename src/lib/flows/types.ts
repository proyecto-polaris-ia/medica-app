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

// Candidato de horario ofrecido al usuario durante el flujo de agendado.
// Lo produce web-inbound-service a partir de los slots disponibles y se
// serializa como ISO strings para persistir en el estado del flujo.
export type SlotCandidate = {
  startAt: string;
  endAt: string;
  serviceId?: string;
  providerId?: string;
};

// Estado actual del flujo
export type FlowState = {
  name: string;
  entities: ExtractedEntities;
  candidates?: SlotCandidate[];
  metadata?: Record<string, unknown>;
  lastActivity?: string; // ISO timestamp de la última actividad
  flowName?: string; // Nombre del flujo activo (ej: 'book_appointment')
  pendingAction?: 'confirm_exit' | 'confirm_cancel'; // Acción pendiente de confirmación
};

// Definición de un estado en el flujo
export type FlowStateDefinition = {
  // Entidades requeridas para avanzar
  required?: Array<keyof ExtractedEntities>;
  // Entidades opcionales
  optional?: Array<keyof ExtractedEntities>;
  // Acción a ejecutar cuando se cumplen las entidades
  action?:
    | 'getFreeSlots'
    | 'bookAppointment'
    | 'resolveService'
    | 'resolveProvider'
    | 'evaluateOnboardingAnswer'
    | 'saveOnboardingHistory'
    | 'saveOnboardingContact';
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
  action:
    | 'ask'
    | 'getFreeSlots'
    | 'bookAppointment'
    | 'resolveService'
    | 'resolveProvider'
    | 'evaluateOnboardingAnswer'
    | 'saveOnboardingHistory'
    | 'saveOnboardingContact'
    | 'complete';
  prompt: string;
  missingEntity?: keyof ExtractedEntities;
  data?: unknown;
};
