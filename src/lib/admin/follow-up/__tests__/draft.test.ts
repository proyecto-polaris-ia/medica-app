import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/lib/admin/validate';
import {
  FOLLOW_UP_TEMPLATE_NAME,
  MAX_DRAFT_LENGTH,
  buildFollowUpDraft,
  validateFollowUpDraftText,
} from '../draft';
import type { FollowUpReason } from '../rules';

const ALL_REASONS: FollowUpReason[] = [
  'no_show',
  'treatment_in_progress',
  'quote_no_response',
  'inactive',
];

describe('buildFollowUpDraft', () => {
  it('is deterministic by template and reason', () => {
    const first = buildFollowUpDraft({
      patientName: 'María López',
      reason: 'no_show',
    });
    const second = buildFollowUpDraft({
      patientName: 'María López',
      reason: 'no_show',
    });

    expect(first).toEqual(second);
    expect(first.templateName).toBe(FOLLOW_UP_TEMPLATE_NAME);
    expect(first.body).toContain('María');
    expect(first.body).toMatch(/no pudimos atenderte/i);
  });

  it('produces a distinct text per reason', () => {
    const bodies = ALL_REASONS.map(
      (reason) =>
        buildFollowUpDraft({ patientName: 'María López', reason }).body
    );
    expect(new Set(bodies).size).toBe(ALL_REASONS.length);
    expect(bodies[1]).toMatch(/seguimiento a tu tratamiento/i);
    expect(bodies[2]).toMatch(/plan de tratamiento/i);
    expect(bodies[3]).toMatch(/hace tiempo que no te vemos/i);
  });

  it('greets with the formatted first name only', () => {
    const { body } = buildFollowUpDraft({
      patientName: '  maría   lópez  ',
      reason: 'inactive',
    });
    expect(body.startsWith('Hola María,')).toBe(true);
    expect(body).not.toContain('López');
  });

  it('never includes prices, clinical guidance or commercial pressure', () => {
    for (const reason of ALL_REASONS) {
      const { body } = buildFollowUpDraft({
        patientName: 'María López',
        reason,
      });
      expect(body).not.toMatch(/\$\s?\d/);
      expect(body).not.toMatch(/\b(precio|costo|descuento)\b/i);
      expect(body).not.toMatch(
        /\b(diagnóstico|receta|medicamento|antibiótico|analgésico|infección|dolor intenso)\b/i
      );
      expect(body).not.toMatch(
        /\b(última oportunidad|oferta|promoción|urgente|ahora o nunca)\b/i
      );
      expect(validateFollowUpDraftText(body)).toBe(body);
    }
  });

  it('rejects a generated draft whose patient name injects a forbidden term', () => {
    expect(() =>
      buildFollowUpDraft({
        patientName: 'Precio $500 María',
        reason: 'no_show',
      })
    ).toThrow(ValidationError);
  });

  it('rejects a patient name injecting clinical or pressure terms', () => {
    for (const name of ['Diagnóstico María', 'Receta María', 'Promoción María']) {
      expect(() =>
        buildFollowUpDraft({ patientName: name, reason: 'no_show' })
      ).toThrow(ValidationError);
    }
  });
});

describe('validateFollowUpDraftText', () => {
  it('trims and collapses newlines and repeated spaces', () => {
    expect(
      validateFollowUpDraftText('  Hola   María,\n\n  ¿Cómo estás?  ')
    ).toBe('Hola María, ¿Cómo estás?');
  });

  it('accepts exactly the maximum length', () => {
    const body = 'a'.repeat(MAX_DRAFT_LENGTH);
    expect(validateFollowUpDraftText(body)).toHaveLength(MAX_DRAFT_LENGTH);
  });

  it('rejects a body above the maximum length', () => {
    const body = 'a'.repeat(MAX_DRAFT_LENGTH + 1);
    expect(() => validateFollowUpDraftText(body)).toThrow(ValidationError);
    try {
      validateFollowUpDraftText(body);
    } catch (error) {
      expect((error as ValidationError).field).toBe('body');
    }
  });

  it('rejects prices and money', () => {
    expect(() => validateFollowUpDraftText('Tu precio es $ 500')).toThrow(
      ValidationError
    );
    expect(() => validateFollowUpDraftText('Te damos un descuento')).toThrow(
      ValidationError
    );
    expect(() => validateFollowUpDraftText('El costo es alto')).toThrow(
      ValidationError
    );
  });

  it('rejects clinical terms and prescriptions', () => {
    for (const term of [
      'diagnóstico',
      'receta',
      'medicamento',
      'antibiótico',
      'analgésico',
      'infección',
      'dolor intenso',
    ]) {
      expect(() => validateFollowUpDraftText(`Tu ${term} sigue igual`)).toThrow(
        ValidationError
      );
    }
  });

  it('rejects commercial pressure', () => {
    for (const term of [
      'última oportunidad',
      'oferta',
      'promoción',
      'urgente',
      'ahora o nunca',
    ]) {
      expect(() => validateFollowUpDraftText(`Es tu ${term}`)).toThrow(
        ValidationError
      );
    }
  });

  it('rejects an empty body', () => {
    expect(() => validateFollowUpDraftText('   \n  ')).toThrow(ValidationError);
  });

  it('is case-insensitive and detects injected forbidden text', () => {
    expect(() =>
      validateFollowUpDraftText('MENSAJE CON DIAGNÓSTICO')
    ).toThrow(ValidationError);
    expect(() => validateFollowUpDraftText('PRECIO: $100')).toThrow(
      ValidationError
    );
  });
});
