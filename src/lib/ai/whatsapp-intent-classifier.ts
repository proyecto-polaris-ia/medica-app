/**
 * WhatsApp Intent Classifier
 * 
 * Clasificación simple de intents para el Flow Engine.
 * Solo identifica el intent y extrae entidades básicas, sin decidir el flujo.
 */

import type { WhatsAppInboundIntent } from '@/lib/ai/whatsapp-inbound-agent';

export type ClassificationResult = {
  intent: WhatsAppInboundIntent;
  confidence: number;
  summary: string;
  entities: {
    localDate?: string;
    serviceName?: string;
    providerName?: string;
    time?: string;
  };
};

/**
 * Clasifica el intent de un mensaje de forma simple y rápida.
 * No usa LLM, solo patrones y regex.
 */
export function classifyIntentSimple(message: string): ClassificationResult {
  const normalized = message.toLowerCase().trim();
  const entities: ClassificationResult['entities'] = {};

  // Extraer fecha (formato: "15 de septiembre", "mañana", etc.)
  const dateMatch = normalized.match(/(\d{1,2})\s+de\s+(\w+)/);
  if (dateMatch) {
    entities.localDate = `${dateMatch[1]} ${dateMatch[2]}`;
  } else if (normalized.includes('mañana')) {
    entities.localDate = 'mañana';
  } else if (normalized.includes('hoy')) {
    entities.localDate = 'hoy';
  }

  // Extraer hora
  const timeMatch = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*(?:am|pm|a\.m\.|p\.m\.)/);
  if (timeMatch) {
    entities.time = timeMatch[0];
  }

  // Clasificar intent basado en patrones
  // Orden de prioridad: support > inquiry > booking
  // (support es más crítico, inquiry es más específico que booking)
  
  const supportPatterns = [
    /dolor|molesta|urgencia|emergencia|infección|hinchazón|sangrado/,
    /alergia|reacción|medicamento|pastilla|antibiótico/,
    /cancelar|reprogramar|cambiar|mover/,
    /queja|problema|no.*puedo|error/,
  ];

  const inquiryPatterns = [
    /qué.*servicio|cuál.*servicio|qué.*ofrecen|cuál.*ofrecen/,
    /precio|costo|cuánto|tarifa|cotización/,
    /cuál.*horario|qué.*horario|horario.*de|horarios/,
    /dónde|dirección|ubicación|cómo.*lleg/,
    /qué.*hacen|cuál.*es/,
  ];

  const bookingPatterns = [
    /agendar|cita|reservar|appointment|disponibilidad|horario|turno/,
    /quiero.*cita|necesito.*cita|pedir.*cita/,
    /atención|consulta|revisión|chequeo/,
  ];

  // Verificar patrones de soporte (prioridad alta por seguridad)
  if (supportPatterns.some(p => p.test(normalized))) {
    return {
      intent: 'support',
      confidence: 0.9,
      summary: 'Mensaje relacionado con soporte o urgencia',
      entities,
    };
  }

  // Verificar patrones de inquiry (antes de booking, más específico)
  if (inquiryPatterns.some(p => p.test(normalized))) {
    return {
      intent: 'inquiry',
      confidence: 0.8,
      summary: 'Usuario hace una consulta informativa',
      entities,
    };
  }

  // Verificar patrones de booking
  if (bookingPatterns.some(p => p.test(normalized))) {
    return {
      intent: 'book_appointment',
      confidence: 0.85,
      summary: 'Usuario quiere agendar una cita',
      entities,
    };
  }

  // Default: inquiry (más seguro que escalar)
  return {
    intent: 'inquiry',
    confidence: 0.5,
    summary: 'Mensaje no clasificado claramente',
    entities,
  };
}

/**
 * Extrae entidades adicionales del mensaje.
 */
export function extractEntities(message: string): ClassificationResult['entities'] {
  const normalized = message.toLowerCase();
  const entities: ClassificationResult['entities'] = {};

  // Servicios comunes
  const services = [
    'limpieza', 'blanqueamiento', 'extracción', 'empaste', 'resina',
    'ortodoncia', 'brackets', 'endodoncia', 'tratamiento', 'valoración',
    'consulta', 'revisión', 'chequeo', 'profilaxis', 'carillas',
  ];

  for (const service of services) {
    if (normalized.includes(service)) {
      entities.serviceName = service;
      break;
    }
  }

  // Doctores (patrones comunes) - soporta caracteres con acentos
  const doctorMatch = normalized.match(/(?:dr\.?|dra\.?|doctor|doctora)\s+([\wáéíóúñ]+)/i);
  if (doctorMatch) {
    entities.providerName = doctorMatch[1];
  }

  // Fecha
  const dateMatch = normalized.match(/(\d{1,2})\s+de\s+(\w+)/);
  if (dateMatch) {
    entities.localDate = `${dateMatch[1]} ${dateMatch[2]}`;
  }

  // Hora
  const timeMatch = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*(?:am|pm|a\.m\.|p\.m\.)/);
  if (timeMatch) {
    entities.time = timeMatch[0];
  }

  return entities;
}
