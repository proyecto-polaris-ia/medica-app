import { describe, expect, it } from 'vitest';
import { buildWhatsAppClinicalEscalationDecision, decideWhatsAppInboundMessage } from '../whatsapp-inbound-agent';

const knowledge = [{ id: 'k1', topic: 'horario', question: '¿Cuál es el horario?', answer: 'Atendemos de lunes a viernes con cita.', tags: ['horario'], source: null }];

describe('whatsapp inbound dental agent', () => {
  it('escalates clinical medication requests before provider output', async () => {
    const decision = await decideWhatsAppInboundMessage({ messageText: 'Me duele fuerte, ¿me receta antibiótico?' }, { knowledgeEntries: knowledge, provider: () => ({ decision: 'auto_answer', intent: 'inquiry', summary: 'bad', confidence: 1, responseText: 'toma medicina', citedKnowledgeIds: ['k1'], citedToolCallIds: [] }) });
    expect(decision.decision).toBe('needs_human');
    expect(decision.escalationReason).toMatch(/criterio clínico|atención humana/i);
  });

  it('answers only with approved knowledge citations', async () => {
    const decision = await decideWhatsAppInboundMessage({ messageText: 'horario' }, { knowledgeEntries: knowledge });
    expect(decision.decision).toBe('auto_answer');
    expect(decision.citedKnowledgeIds).toEqual(['k1']);
  });

  it('returns a booking tool action for appointment messages', async () => {
    const decision = await decideWhatsAppInboundMessage({ messageText: 'Quiero agendar una cita' }, { knowledgeEntries: [] });
    expect(decision.decision).toBe('tool_action');
    expect(decision.toolAction?.name).toBe('check_availability');
  });

  it('detects deterministic price escalation', () => {
    expect(buildWhatsAppClinicalEscalationDecision('¿Cuánto cuesta una limpieza?')?.decision).toBe('needs_human');
  });
});
