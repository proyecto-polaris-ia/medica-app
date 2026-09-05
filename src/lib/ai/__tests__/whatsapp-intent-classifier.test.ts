import { describe, it, expect } from 'vitest';
import { classifyIntentSimple, extractEntities } from '../whatsapp-intent-classifier';

describe('whatsapp-intent-classifier', () => {
  describe('classifyIntentSimple', () => {
    it('should classify booking intent', () => {
      const result = classifyIntentSimple('quiero agendar una cita');
      expect(result.intent).toBe('book_appointment');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should classify booking intent with date', () => {
      const result = classifyIntentSimple('quiero hacer una cita para el 15 de septiembre');
      expect(result.intent).toBe('book_appointment');
      expect(result.entities.localDate).toBe('15 septiembre');
    });

    it('should classify support intent for pain', () => {
      const result = classifyIntentSimple('tengo un dolor muy fuerte');
      expect(result.intent).toBe('support');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should classify support intent for emergency', () => {
      const result = classifyIntentSimple('es una urgencia');
      expect(result.intent).toBe('support');
    });

    it('should classify inquiry intent for services', () => {
      const result = classifyIntentSimple('qué servicios ofrecen');
      expect(result.intent).toBe('inquiry');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should classify inquiry intent for hours', () => {
      const result = classifyIntentSimple('cuál es su horario');
      expect(result.intent).toBe('inquiry');
    });

    it('should classify inquiry intent for prices', () => {
      const result = classifyIntentSimple('cuánto cuesta una limpieza');
      expect(result.intent).toBe('inquiry');
    });

    it('should extract date from message', () => {
      const result = classifyIntentSimple('quiero cita el 20 de octubre');
      expect(result.entities.localDate).toBe('20 octubre');
    });

    it('should extract time from message', () => {
      const result = classifyIntentSimple('quiero cita a las 10:30am');
      expect(result.entities.time).toBe('10:30am');
    });

    it('should handle "mañana" as date', () => {
      const result = classifyIntentSimple('quiero cita mañana');
      expect(result.entities.localDate).toBe('mañana');
    });

    it('should handle "hoy" as date', () => {
      const result = classifyIntentSimple('quiero cita hoy');
      expect(result.entities.localDate).toBe('hoy');
    });
  });

  describe('extractEntities', () => {
    it('should extract service name', () => {
      const entities = extractEntities('quiero una limpieza dental');
      expect(entities.serviceName).toBe('limpieza');
    });

    it('should extract provider name', () => {
      const entities = extractEntities('con el dr. garcía');
      expect(entities.providerName).toBe('garcía');
    });

    it('should extract provider name with dra', () => {
      const entities = extractEntities('con la dra. martínez');
      expect(entities.providerName).toBe('martínez');
    });

    it('should extract multiple entities', () => {
      const entities = extractEntities('quiero blanqueamiento con la dra. pérez el 15 de septiembre');
      expect(entities.serviceName).toBe('blanqueamiento');
      expect(entities.providerName).toBe('pérez');
      expect(entities.localDate).toBe('15 septiembre');
    });

    it('should handle various service names', () => {
      expect(extractEntities('ortodoncia').serviceName).toBe('ortodoncia');
      expect(extractEntities('brackets').serviceName).toBe('brackets');
      expect(extractEntities('empaste').serviceName).toBe('empaste');
      expect(extractEntities('extracción').serviceName).toBe('extracción');
    });
  });
});
