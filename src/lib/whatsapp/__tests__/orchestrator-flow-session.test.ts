import { describe, expect, it } from 'vitest';
import type { FlowState } from '@/lib/flows/types';
import {
  FLOW_TIMEOUT_MINUTES,
  isFlowExpired,
  isFlowSessionActive,
} from '@/lib/flows/flow-engine';

const NOW = new Date('2026-10-05T13:00:00.000Z');

function flowState(overrides: Partial<FlowState> = {}): FlowState {
  return {
    name: 'collect_date',
    entities: {},
    lastActivity: NOW.toISOString(),
    ...overrides,
  };
}

function minutesBefore(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60 * 1000).toISOString();
}

/**
 * Precedencia de la sesión de flow engine (design.md decisión 2).
 * `isFlowSessionActive` reutiliza el timeout de 30 minutos; los helpers puros se
 * movieron desde el orquestador legacy (Stage 7 Fase 3) a
 * `@/lib/flows/flow-engine`, que es un módulo vivo.
 */
describe('FLOW_TIMEOUT_MINUTES', () => {
  it('expone el timeout de sesión de 30 minutos', () => {
    expect(FLOW_TIMEOUT_MINUTES).toBe(30);
  });
});

describe('isFlowExpired', () => {
  it('es false sin `lastActivity`', () => {
    expect(isFlowExpired(flowState({ lastActivity: undefined }), NOW)).toBe(false);
  });

  it('es false dentro del timeout', () => {
    expect(isFlowExpired(flowState({ lastActivity: minutesBefore(29) }), NOW)).toBe(false);
  });

  it('es true pasando el timeout', () => {
    expect(isFlowExpired(flowState({ lastActivity: minutesBefore(31) }), NOW)).toBe(true);
  });
});

describe('isFlowSessionActive', () => {
  it('es false cuando no hay `flowState`', () => {
    expect(isFlowSessionActive(null, NOW)).toBe(false);
  });

  it('es true con sesión no `complete` y no expirada', () => {
    expect(isFlowSessionActive(flowState({ name: 'collect_date' }), NOW)).toBe(true);
  });

  it('es false con sesión `complete`', () => {
    expect(isFlowSessionActive(flowState({ name: 'complete' }), NOW)).toBe(false);
  });

  it('es false con sesión expirada', () => {
    expect(
      isFlowSessionActive(flowState({ lastActivity: minutesBefore(31) }), NOW)
    ).toBe(false);
  });
});
