/**
 * Flow Engine
 * 
 * Motor determinístico que ejecuta flujos conversacionales.
 * No depende del LLM para la lógica de flujo, solo para clasificación y redacción.
 */

import type {
  FlowDefinition,
  FlowState,
  FlowResult,
  ExtractedEntities,
} from './types';

export class FlowEngine {
  /**
   * Ejecuta un paso del flujo.
   * Determina qué hacer basado en el estado actual y las entidades disponibles.
   */
  execute(
    flow: FlowDefinition,
    currentState: FlowState,
    newEntities: ExtractedEntities
  ): FlowResult {
    // Merge de entidades previas con las nuevas
    const mergedEntities = { ...currentState.entities, ...newEntities };
    
    // Obtener definición del estado actual
    const stateDef = flow.states[currentState.name];
    if (!stateDef) {
      throw new Error(`Estado desconocido: ${currentState.name}`);
    }

    // Si es estado terminal, completar
    if (stateDef.terminal) {
      return {
        nextState: { name: 'complete', entities: mergedEntities },
        action: 'complete',
        prompt: stateDef.prompt,
      };
    }

    // Verificar si faltan entidades requeridas
    const missing = this.findMissingEntities(stateDef.required, mergedEntities);
    
    if (missing.length > 0) {
      // Pedir la primera entidad faltante
      return {
        nextState: { ...currentState, entities: mergedEntities },
        action: 'ask',
        prompt: stateDef.prompt,
        missingEntity: missing[0],
      };
    }

    // Si hay acción que ejecutar
    if (stateDef.action) {
      return {
        nextState: { ...currentState, entities: mergedEntities },
        action: stateDef.action,
        prompt: stateDef.prompt,
      };
    }

    // Transicionar al siguiente estado
    const nextTransition = Object.keys(stateDef.transitions || {})[0];
    const nextStateName = stateDef.transitions?.[nextTransition];
    
    if (!nextStateName) {
      throw new Error(`No hay transición definida para estado: ${currentState.name}`);
    }

    const nextStateDef = flow.states[nextStateName];
    const nextState: FlowState = { name: nextStateName, entities: mergedEntities };
    
    // Verificar si faltan entidades en el nuevo estado
    const missingInNext = this.findMissingEntities(nextStateDef.required, mergedEntities);
    
    if (missingInNext.length > 0) {
      return {
        nextState,
        action: 'ask',
        prompt: nextStateDef.prompt,
        missingEntity: missingInNext[0],
      };
    }
    
    return {
      nextState,
      action: nextStateDef.action || 'ask',
      prompt: nextStateDef.prompt,
    };
  }

  /**
   * Avanza el flujo después de ejecutar una acción.
   */
  advance(
    flow: FlowDefinition,
    currentState: FlowState,
    actionResult: string,
    additionalEntities?: ExtractedEntities,
    additionalMetadata?: Record<string, unknown>
  ): FlowResult {
    const stateDef = flow.states[currentState.name];
    if (!stateDef) {
      throw new Error(`Estado desconocido: ${currentState.name}`);
    }

    const nextStateName = stateDef.transitions?.[actionResult];
    if (!nextStateName) {
      throw new Error(`Transición desconocida: ${actionResult} para estado: ${currentState.name}`);
    }

    const nextStateDef = flow.states[nextStateName];
    const mergedEntities = { ...currentState.entities, ...additionalEntities };
    const mergedMetadata = { ...currentState.metadata, ...additionalMetadata };

    return {
      nextState: { name: nextStateName, entities: mergedEntities, metadata: mergedMetadata },
      action: nextStateDef.action || 'ask',
      prompt: nextStateDef.prompt,
    };
  }

  /**
   * Encuentra entidades faltantes requeridas.
   */
  private findMissingEntities(
    required: Array<keyof ExtractedEntities> | undefined,
    entities: ExtractedEntities
  ): Array<keyof ExtractedEntities> {
    if (!required) return [];
    
    return required.filter(key => {
      const value = entities[key];
      return value === undefined || value === null || value === '';
    });
  }

  /**
   * Crea un estado inicial para un flujo.
   */
  createInitialState(flow: FlowDefinition, initialEntities?: ExtractedEntities): FlowState {
    return {
      name: flow.initialState,
      entities: initialEntities || {},
    };
  }
}

// Instancia singleton
export const flowEngine = new FlowEngine();
