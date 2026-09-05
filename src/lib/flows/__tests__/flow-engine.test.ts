import { describe, it, expect } from 'vitest';
import { FlowEngine } from '../flow-engine';
import { bookAppointmentFlow } from '../definitions/book-appointment.flow';

describe('FlowEngine', () => {
  const engine = new FlowEngine();

  describe('execute', () => {
    it('should start at initial state', () => {
      const initialState = engine.createInitialState(bookAppointmentFlow);
      expect(initialState.name).toBe('collect_date');
    });

    it('should ask for missing required entity', () => {
      const initialState = engine.createInitialState(bookAppointmentFlow);
      const result = engine.execute(bookAppointmentFlow, initialState, {});
      
      expect(result.action).toBe('ask');
      expect(result.missingEntity).toBe('localDate');
      expect(result.prompt).toContain('día');
    });

    it('should advance when required entity is provided', () => {
      const initialState = engine.createInitialState(bookAppointmentFlow);
      const result = engine.execute(bookAppointmentFlow, initialState, {
        localDate: '2026-09-15',
      });
      
      expect(result.action).toBe('ask');
      expect(result.missingEntity).toBe('serviceId');
      expect(result.nextState.name).toBe('collect_service');
      expect(result.nextState.entities.localDate).toBe('2026-09-15');
    });

    it('should execute action when all required entities are present', () => {
      const state = {
        name: 'check_availability',
        entities: {
          localDate: '2026-09-15',
          serviceId: 'service-123',
          providerId: 'provider-456',
        },
      };
      
      const result = engine.execute(bookAppointmentFlow, state, {});
      
      expect(result.action).toBe('getFreeSlots');
      expect(result.nextState.name).toBe('check_availability');
    });

    it('should merge entities from multiple messages', () => {
      const initialState = engine.createInitialState(bookAppointmentFlow);
      
      // First message: provides date
      let result = engine.execute(bookAppointmentFlow, initialState, {
        localDate: '2026-09-15',
      });
      
      // Second message: provides service
      result = engine.execute(bookAppointmentFlow, result.nextState, {
        serviceName: 'Limpieza dental',
      });
      
      expect(result.nextState.entities.localDate).toBe('2026-09-15');
      expect(result.nextState.entities.serviceName).toBe('Limpieza dental');
    });
  });

  describe('advance', () => {
    it('should advance to next state based on transition', () => {
      const state = {
        name: 'check_availability',
        entities: {
          localDate: '2026-09-15',
          serviceId: 'service-123',
          providerId: 'provider-456',
        },
      };
      
      const result = engine.advance(bookAppointmentFlow, state, 'has_slots');
      
      expect(result.nextState.name).toBe('select_slot');
      expect(result.action).toBe('ask');
    });

    it('should merge additional entities when advancing', () => {
      const state = {
        name: 'check_availability',
        entities: {
          localDate: '2026-09-15',
          serviceId: 'service-123',
          providerId: 'provider-456',
        },
      };
      
      const result = engine.advance(
        bookAppointmentFlow,
        state,
        'has_slots',
        undefined,
        { candidates: [{ startAt: '2026-09-15T10:00:00', endAt: '2026-09-15T10:30:00' }] }
      );
      
      expect(result.nextState.metadata?.candidates).toBeDefined();
    });
  });

  describe('terminal state', () => {
    it('should return complete action for terminal state', () => {
      const state = {
        name: 'complete',
        entities: {},
      };
      
      const result = engine.execute(bookAppointmentFlow, state, {});
      
      expect(result.action).toBe('complete');
    });
  });
});
