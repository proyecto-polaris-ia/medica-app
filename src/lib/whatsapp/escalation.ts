import type { WhatsAppInboundAgentDecision } from '@/lib/ai/whatsapp-inbound-agent';
import type { NormalizedWhatsAppInboundEvent } from './normalize';

export type WhatsAppEscalationWork = {
  reason: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  summary: string;
  customerFollowUpText: string;
  humanAlertText: string;
};

function priorityFor(reason: string, event: NormalizedWhatsAppInboundEvent) {
  const text = `${reason} ${event.body || ''}`.toLowerCase();
  if (/dolor\s+(fuerte|intenso|insoportable)|urgenc|emergenc|infecci[oó]n|hinchaz[oó]n|sangrado|alerg/.test(text)) return 'urgent';
  if (/medicament|receta|antibi[oó]tico|analg[eé]sico|precio|costo|cancel|reprogram/.test(text)) return 'high';
  return 'normal';
}

function defaultCustomerFollowUp(event: NormalizedWhatsAppInboundEvent, decision: WhatsAppInboundAgentDecision) {
  const text = `${event.body || ''} ${decision.summary || ''} ${decision.escalationReason || ''}`.toLowerCase();
  if (/precio|costo|cu[aá]nto cuesta|cotiz|presupuesto/.test(text)) {
    return 'Gracias por escribirnos. Para darte un costo responsable necesitamos una valoración. Una persona del consultorio te dará seguimiento.';
  }
  if (/dolor|urgenc|emergenc|infecci[oó]n|hinchaz[oó]n|sangrado|alerg|medicament|receta/.test(text)) {
    return 'Gracias por escribirnos. Para cuidarte bien, este caso lo debe revisar una persona del consultorio. Ya lo estamos escalando para que te den seguimiento.';
  }
  return 'Gracias por escribirnos. Una persona del consultorio revisará tu mensaje y te dará seguimiento.';
}

export function buildWhatsAppEscalationWork(event: NormalizedWhatsAppInboundEvent, decision: WhatsAppInboundAgentDecision): WhatsAppEscalationWork {
  const reason = decision.escalationReason || 'El mensaje requiere seguimiento humano.';
  const summary = decision.summary || event.body || 'Mensaje de WhatsApp recibido.';
  const priority = priorityFor(reason, event);
  const customerFollowUpText = decision.responseText || defaultCustomerFollowUp(event, decision);
  const humanAlertText = [`WhatsApp requiere seguimiento (${priority}).`, `Paciente/contacto: ${event.profileName || event.fromPhone}`, `Teléfono: ${event.fromPhone}`, `Motivo: ${reason}`, `Resumen: ${summary}`].join('\n');
  return { reason, priority, summary, customerFollowUpText, humanAlertText };
}
