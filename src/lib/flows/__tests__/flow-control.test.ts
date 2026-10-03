import { describe, it, expect } from 'vitest';
import {
  detectCancellation,
  detectConfirmation,
  detectTopicChange,
  analyzeFlowControl,
  generateTopicChangeConfirmation,
  generateCancellationConfirmation,
} from '../flow-control';

describe('flow-control', () => {
  describe('detectCancellation', () => {
    it('should detect explicit cancellation words', () => {
      expect(detectCancellation('cancelar')).toBe(true);
      expect(detectCancellation('quiero cancelar')).toBe(true);
      expect(detectCancellation('salir')).toBe(true);
      expect(detectCancellation('no quiero continuar')).toBe(true);
      expect(detectCancellation('basta')).toBe(true);
      expect(detectCancellation('olvídalo')).toBe(true);
    });

    it('should not detect cancellation in normal messages', () => {
      expect(detectCancellation('quiero agendar una cita')).toBe(false);
      expect(detectCancellation('limpieza dental')).toBe(false);
      expect(detectCancellation('con la dra. martínez')).toBe(false);
    });
  });

  describe('detectConfirmation', () => {
    it('should detect affirmative confirmations', () => {
      expect(detectConfirmation('sí')).toBe('yes');
      expect(detectConfirmation('si')).toBe('yes');
      expect(detectConfirmation('ok')).toBe('yes');
      expect(detectConfirmation('dale')).toBe('yes');
      expect(detectConfirmation('confirmo')).toBe('yes');
      expect(detectConfirmation('claro')).toBe('yes');
    });

    it('should detect negative confirmations', () => {
      expect(detectConfirmation('no')).toBe('no');
      expect(detectConfirmation('nel')).toBe('no');
      expect(detectConfirmation('nopes')).toBe('no');
      expect(detectConfirmation('mejor no')).toBe('no');
    });

    it('should return null for non-confirmation messages', () => {
      expect(detectConfirmation('limpieza dental')).toBe(null);
      expect(detectConfirmation('quiero agendar')).toBe(null);
      expect(detectConfirmation('mañana a las 10')).toBe(null);
    });
  });

  describe('detectTopicChange', () => {
    it('should detect topic change when intent differs from flow', () => {
      expect(detectTopicChange('cuál es su horario', 'collect_service', 'inquiry')).toBe(true);
      expect(detectTopicChange('qué servicios ofrecen', 'collect_provider', 'inquiry')).toBe(true);
    });

    it('should not detect topic change when intent matches flow', () => {
      expect(detectTopicChange('limpieza dental', 'collect_service', 'book_appointment')).toBe(false);
      expect(detectTopicChange('con la dra. martínez', 'collect_provider', 'book_appointment')).toBe(false);
    });

    it('should not detect topic change for unknown intent', () => {
      expect(detectTopicChange('algo random', 'collect_service', 'unknown')).toBe(false);
    });
  });

  describe('analyzeFlowControl', () => {
    it('should return continue when no active flow', () => {
      const result = analyzeFlowControl('quiero una cita', null, undefined, 'book_appointment');
      expect(result.type).toBe('continue');
    });

    it('should detect cancellation when flow is active', () => {
      const result = analyzeFlowControl('cancelar', 'collect_service', undefined, 'book_appointment');
      expect(result.type).toBe('cancel');
    });

    it('should detect confirmation yes when pending action is confirm_exit', () => {
      const result = analyzeFlowControl('sí', 'collect_service', 'confirm_exit', 'book_appointment');
      expect(result.type).toBe('confirm_exit_yes');
    });

    it('should detect confirmation no when pending action is confirm_exit', () => {
      const result = analyzeFlowControl('no', 'collect_service', 'confirm_exit', 'book_appointment');
      expect(result.type).toBe('confirm_exit_no');
    });

    it('should detect topic change when intent differs', () => {
      const result = analyzeFlowControl('cuál es su horario', 'collect_service', undefined, 'inquiry');
      expect(result.type).toBe('topic_change');
      expect(result.detectedIntent).toBe('inquiry');
    });

    it('should return continue when message is part of flow', () => {
      const result = analyzeFlowControl('limpieza dental', 'collect_service', undefined, 'book_appointment');
      expect(result.type).toBe('continue');
    });
  });

  describe('generateTopicChangeConfirmation', () => {
    it('should generate confirmation message for book_appointment flow', () => {
      const message = generateTopicChangeConfirmation('book_appointment');
      expect(message).toContain('creación de cita');
      expect(message).toContain('sí');
      expect(message).toContain('no');
    });

    it('should generate generic message for unknown flow', () => {
      const message = generateTopicChangeConfirmation('unknown_flow');
      expect(message).toContain('proceso actual');
    });

    it('should generate confirmation message for onboarding flow', () => {
      const message = generateTopicChangeConfirmation('onboarding');
      expect(message).toContain('tu registro de datos médicos');
      expect(message).toContain('sí');
      expect(message).toContain('no');
    });
  });

  describe('flowName-aware topic control', () => {
    it('keeps booking behavior unchanged without flowName', () => {
      expect(detectTopicChange('cuál es su horario', 'collect_service', 'inquiry')).toBe(true);
      expect(
        detectTopicChange('cuál es su horario', 'collect_service', 'inquiry', 'book_appointment')
      ).toBe(true);
    });

    it('treats inquiry and support as expected for onboarding', () => {
      expect(detectTopicChange('tengo alergia a la penicilina', 'ask_allergies', 'inquiry', 'onboarding')).toBe(false);
      expect(detectTopicChange('quiero hablar con alguien', 'ask_allergies', 'support', 'onboarding')).toBe(false);
      expect(detectTopicChange('algo random', 'ask_allergies', 'unknown', 'onboarding')).toBe(false);
    });

    it('detects booking intents as topic change during onboarding', () => {
      for (const intent of [
        'book_appointment',
        'check_availability',
        'reschedule_request',
        'cancel_request',
        'handoff',
      ]) {
        expect(detectTopicChange('mensaje', 'ask_allergies', intent, 'onboarding')).toBe(true);
      }
    });

    it('continues an onboarding session when the intent is inquiry', () => {
      const result = analyzeFlowControl('tengo alergia a la penicilina', 'ask_allergies', undefined, 'inquiry', 'onboarding');
      expect(result.type).toBe('continue');
    });

    it('asks for confirmation when a booking intent interrupts onboarding', () => {
      const result = analyzeFlowControl('quiero agendar una cita', 'ask_allergies', undefined, 'book_appointment', 'onboarding');
      expect(result.type).toBe('topic_change');
      expect(result.detectedIntent).toBe('book_appointment');
    });

    it('keeps booking flow control unchanged when flowName is book_appointment', () => {
      const result = analyzeFlowControl('cuál es su horario', 'collect_service', undefined, 'inquiry', 'book_appointment');
      expect(result.type).toBe('topic_change');
    });
  });

  describe('generateCancellationConfirmation', () => {
    it('should generate cancellation confirmation message', () => {
      const message = generateCancellationConfirmation();
      expect(message).toContain('cancelar');
      expect(message).toContain('sí');
      expect(message).toContain('no');
    });
  });
});
