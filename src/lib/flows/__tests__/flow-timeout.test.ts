import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FlowState } from '../types';

// Mock de la función isFlowExpired para testing
function isFlowExpired(flowState: FlowState, timeoutMinutes: number = 30): boolean {
  if (!flowState.lastActivity) return false;
  
  const lastActivity = new Date(flowState.lastActivity);
  const now = new Date();
  const diffMinutes = (now.getTime() - lastActivity.getTime()) / (1000 * 60);
  
  return diffMinutes > timeoutMinutes;
}

describe('Flow Timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not expire when lastActivity is recent', () => {
    const flowState: FlowState = {
      name: 'collect_service',
      entities: {},
      lastActivity: new Date().toISOString(),
      flowName: 'book_appointment',
    };

    expect(isFlowExpired(flowState, 30)).toBe(false);
  });

  it('should not expire when lastActivity is 29 minutes ago', () => {
    const twentyNineMinutesAgo = new Date(Date.now() - 29 * 60 * 1000);
    const flowState: FlowState = {
      name: 'collect_service',
      entities: {},
      lastActivity: twentyNineMinutesAgo.toISOString(),
      flowName: 'book_appointment',
    };

    expect(isFlowExpired(flowState, 30)).toBe(false);
  });

  it('should expire when lastActivity is 31 minutes ago', () => {
    const thirtyOneMinutesAgo = new Date(Date.now() - 31 * 60 * 1000);
    const flowState: FlowState = {
      name: 'collect_service',
      entities: {},
      lastActivity: thirtyOneMinutesAgo.toISOString(),
      flowName: 'book_appointment',
    };

    expect(isFlowExpired(flowState, 30)).toBe(true);
  });

  it('should expire when lastActivity is 1 hour ago', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const flowState: FlowState = {
      name: 'collect_service',
      entities: {},
      lastActivity: oneHourAgo.toISOString(),
      flowName: 'book_appointment',
    };

    expect(isFlowExpired(flowState, 30)).toBe(true);
  });

  it('should not expire when lastActivity is undefined', () => {
    const flowState: FlowState = {
      name: 'collect_service',
      entities: {},
      flowName: 'book_appointment',
    };

    expect(isFlowExpired(flowState, 30)).toBe(false);
  });

  it('should respect custom timeout', () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const flowState: FlowState = {
      name: 'collect_service',
      entities: {},
      lastActivity: tenMinutesAgo.toISOString(),
      flowName: 'book_appointment',
    };

    expect(isFlowExpired(flowState, 5)).toBe(true);
    expect(isFlowExpired(flowState, 15)).toBe(false);
  });
});
