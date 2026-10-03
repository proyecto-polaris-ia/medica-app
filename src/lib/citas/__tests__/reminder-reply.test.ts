import { describe, expect, it } from 'vitest';
import {
  CANCEL_ALLOWED_FROM,
  CONFIRM_ALLOWED_FROM,
  REMINDER_REPLY_WINDOW_HOURS,
  appendReminderReplyNotes,
  buildReminderReplyNotesEntry,
  classifyReminderReply,
  hasClinicalAmbiguity,
  isEligibleReminderReplyCandidate,
  isReminderReplyCancellation,
  isReminderReplyConfirmation,
  normalizePhoneValue,
  pickEligibleReminderReplyCandidate,
  reminderReplyWindowStart,
  type ReminderReplyCandidate,
} from '../reminder-reply';

/**
 * Fase 1 — Clasificación pura de intención (design.md §5).
 *
 * Orden exigido: ambigüedad → cancelación → confirmación. Los afirmativos
 * simples ("1", "va", "ok") son una extensión local porque
 * `detectConfirmation` (flow-control.ts) no los reconoce; `"no puedo"` es
 * extensión local porque `detectCancellation` no lo captura.
 */
describe('classifyReminderReply', () => {
  it('clasifica afirmativos simples como confirmación', () => {
    for (const message of ['1', 'si', 'sí', 'confirmo', 'va', 'ok']) {
      expect(classifyReminderReply(message), message).toBe('confirmation');
    }
  });

  it('tolera mayúsculas y acentos en los afirmativos', () => {
    for (const message of ['Sí', 'SI', 'OK', 'Confirmo', ' VA ']) {
      expect(classifyReminderReply(message), message).toBe('confirmation');
    }
  });

  it('no confirma mensajes no afirmativos', () => {
    for (const message of ['no', 'tal vez', 'después te digo', 'gracias']) {
      expect(classifyReminderReply(message), message).toBe('none');
    }
  });

  it('clasifica cancelaciones explícitas como cancelación', () => {
    for (const message of ['no puedo', 'no podré', 'cancelo', 'no alcanzo']) {
      expect(classifyReminderReply(message), message).toBe('cancellation');
    }
  });

  it('clasifica como ambigua la confirmación mezclada con síntoma', () => {
    expect(classifyReminderReply('sí, me duele mucho')).toBe('ambiguous');
  });

  it('clasifica como ambigua la cancelación mezclada con clínica', () => {
    expect(classifyReminderReply('no puedo, tengo una infección')).toBe('ambiguous');
  });

  it('clasifica como ambigua la solicitud de medicamento junto a confirmación', () => {
    expect(classifyReminderReply('ok, pero recuérdame qué medicina tomo')).toBe('ambiguous');
  });

  it('respeta la precedencia ambigüedad → cancelación → confirmación', () => {
    // Ambigua gana sobre cancelación.
    expect(classifyReminderReply('no puedo, tengo una infección')).toBe('ambiguous');
    // Ambigua gana sobre confirmación.
    expect(classifyReminderReply('sí, pero me duele mucho')).toBe('ambiguous');
    // Sin clínica, gana la cancelación.
    expect(classifyReminderReply('no alcanzo')).toBe('cancellation');
  });
});

describe('isReminderReplyConfirmation', () => {
  it('reconoce afirmativos propios y los de detectConfirmation', () => {
    expect(isReminderReplyConfirmation('1')).toBe(true);
    expect(isReminderReplyConfirmation('va')).toBe(true);
    expect(isReminderReplyConfirmation('Sí')).toBe(true);
    expect(isReminderReplyConfirmation('sí, confirmo')).toBe(true);
  });

  it('no reconoce negativos ni texto libre', () => {
    expect(isReminderReplyConfirmation('no')).toBe(false);
    expect(isReminderReplyConfirmation('mañana te confirmo')).toBe(false);
  });
});

describe('isReminderReplyCancellation', () => {
  it('reconoce las cancelaciones propias y las de detectCancellation', () => {
    expect(isReminderReplyCancellation('no puedo')).toBe(true);
    expect(isReminderReplyCancellation('no podré')).toBe(true);
    expect(isReminderReplyCancellation('cancelo')).toBe(true);
    expect(isReminderReplyCancellation('ya no quiero la cita')).toBe(true);
  });

  it('no reconoce afirmativos ni texto libre', () => {
    expect(isReminderReplyCancellation('sí')).toBe(false);
    expect(isReminderReplyCancellation('ok')).toBe(false);
  });
});

describe('hasClinicalAmbiguity', () => {
  it('detecta dolor, urgencia, infección, alergia y medicamento', () => {
    for (const message of [
      'me duele mucho',
      'tengo dolor fuerte',
      'es una urgencia',
      'creo que es una infección',
      'tengo alergia',
      'recuérdame qué medicina tomo',
      'necesito una receta',
    ]) {
      expect(hasClinicalAmbiguity(message), message).toBe(true);
    }
  });

  it('no marca mensajes sin señal clínica', () => {
    expect(hasClinicalAmbiguity('1')).toBe(false);
    expect(hasClinicalAmbiguity('sí, ahí estaré')).toBe(false);
  });

  it('detecta la señal clínica aunque venga sola (sin confirmar ni cancelar)', () => {
    expect(hasClinicalAmbiguity('me duele mucho')).toBe(true);
    // Señal clínica sin confirmación/cancelación → el pipeline general escala.
    expect(classifyReminderReply('me duele mucho')).toBe('none');
  });

  it('trata mensajes vacíos o solo espacios como ninguna intención', () => {
    expect(classifyReminderReply('')).toBe('none');
    expect(classifyReminderReply('    ')).toBe('none');
    expect(isReminderReplyConfirmation('')).toBe(false);
    expect(isReminderReplyCancellation('    ')).toBe(false);
  });

  it('tolera mayúsculas y acentos mixtos sin falsos positivos', () => {
    expect(classifyReminderReply('  SÍ  ')).toBe('confirmation');
    expect(classifyReminderReply('No PoDrÉ')).toBe('cancellation');
    expect(classifyReminderReply('OK, gracias')).toBe('confirmation');
  });
});

// ---------------------------------------------------------------------------
// Fase 2 — Elegibilidad y rastro (design.md §1 y §4)
// ---------------------------------------------------------------------------

const NOW = new Date('2026-10-05T13:00:00.000Z');
const PHONE = '+5215512345678';

function candidate(overrides: Partial<ReminderReplyCandidate> = {}): ReminderReplyCandidate {
  return {
    reminderId: 'reminder-1',
    appointmentId: 'appointment-1',
    sentAt: '2026-10-05T12:00:00.000Z', // 1 h antes de NOW
    appointmentStatus: 'requested',
    patientName: 'María López',
    patientPhoneE164: PHONE,
    startAt: '2026-10-06T16:00:00.000Z',
    endAt: '2026-10-06T17:00:00.000Z',
    notes: null,
    ...overrides,
  };
}

describe('ventana de recordatorio', () => {
  it('fija la ventana en 36 horas', () => {
    expect(REMINDER_REPLY_WINDOW_HOURS).toBe(36);
  });

  it('reminderReplyWindowStart resta 36 horas a now', () => {
    expect(reminderReplyWindowStart(NOW).toISOString()).toBe('2026-10-04T01:00:00.000Z');
  });

  it('declara los estados permitidos por destino', () => {
    expect(CONFIRM_ALLOWED_FROM).toEqual(['requested', 'pending']);
    expect(CANCEL_ALLOWED_FROM).toEqual(['requested', 'pending', 'confirmed']);
  });
});

describe('normalizePhoneValue', () => {
  it('deja solo dígitos (espejo de normalize_whatsapp_phone)', () => {
    expect(normalizePhoneValue('+52 155 1234 5678')).toBe('5215512345678');
    expect(normalizePhoneValue('(55) 1234-5678')).toBe('5512345678');
  });
});

describe('isEligibleReminderReplyCandidate', () => {
  it('acepta una cita elegible con recordatorio dentro de la ventana', () => {
    expect(
      isEligibleReminderReplyCandidate(candidate(), { phone: PHONE, now: NOW, to: 'confirmed' })
    ).toBe(true);
  });

  it('rechaza un recordatorio fuera de la ventana de 36 horas', () => {
    const stale = candidate({ sentAt: '2026-10-03T23:00:00.000Z' }); // > 36 h
    expect(
      isEligibleReminderReplyCandidate(stale, { phone: PHONE, now: NOW, to: 'confirmed' })
    ).toBe(false);
  });

  it('rechaza un sentAt posterior a now', () => {
    const future = candidate({ sentAt: '2026-10-05T14:00:00.000Z' });
    expect(
      isEligibleReminderReplyCandidate(future, { phone: PHONE, now: NOW, to: 'confirmed' })
    ).toBe(false);
  });

  it('rechaza estados terminales para confirmar y cancelar', () => {
    for (const status of ['cancelled', 'rescheduled', 'no_show', 'attended'] as const) {
      expect(
        isEligibleReminderReplyCandidate(candidate({ appointmentStatus: status }), {
          phone: PHONE,
          now: NOW,
          to: 'confirmed',
        }),
        `${status}:confirmed`
      ).toBe(false);
      expect(
        isEligibleReminderReplyCandidate(candidate({ appointmentStatus: status }), {
          phone: PHONE,
          now: NOW,
          to: 'cancelled',
        }),
        `${status}:cancelled`
      ).toBe(false);
    }
  });

  it('permite cancelar una cita ya confirmada pero no confirmarla de nuevo', () => {
    const confirmed = candidate({ appointmentStatus: 'confirmed' });
    expect(
      isEligibleReminderReplyCandidate(confirmed, { phone: PHONE, now: NOW, to: 'cancelled' })
    ).toBe(true);
    expect(
      isEligibleReminderReplyCandidate(confirmed, { phone: PHONE, now: NOW, to: 'confirmed' })
    ).toBe(false);
  });

  it('rechaza un teléfono distinto aunque tenga otro formato', () => {
    expect(
      isEligibleReminderReplyCandidate(candidate(), {
        phone: '+5215599999999',
        now: NOW,
        to: 'confirmed',
      })
    ).toBe(false);
    // Mismo número con espacios/guiones: normaliza igual y es elegible.
    expect(
      isEligibleReminderReplyCandidate(candidate(), {
        phone: '+52 155 1234 5678',
        now: NOW,
        to: 'confirmed',
      })
    ).toBe(true);
  });
});

describe('pickEligibleReminderReplyCandidate', () => {
  const input = { phone: PHONE, now: NOW, to: 'confirmed' as const };

  it('elige el sentAt más reciente', () => {
    const older = candidate({ reminderId: 'r-old', sentAt: '2026-10-05T10:00:00.000Z' });
    const newer = candidate({ reminderId: 'r-new', sentAt: '2026-10-05T12:00:00.000Z' });
    const picked = pickEligibleReminderReplyCandidate([older, newer], input);
    expect(picked?.reminderId).toBe('r-new');
  });

  it('en empate de sentAt elige el startAt más próximo (más temprano)', () => {
    const far = candidate({ reminderId: 'r-far', startAt: '2026-10-09T16:00:00.000Z' });
    const near = candidate({ reminderId: 'r-near', startAt: '2026-10-06T16:00:00.000Z' });
    const picked = pickEligibleReminderReplyCandidate([far, near], input);
    expect(picked?.reminderId).toBe('r-near');
  });

  it('devuelve null cuando no hay candidatos elegibles', () => {
    expect(pickEligibleReminderReplyCandidate([], input)).toBeNull();
    expect(
      pickEligibleReminderReplyCandidate([candidate({ patientPhoneE164: '+5215500000000' })], input)
    ).toBeNull();
  });
});

describe('buildReminderReplyNotesEntry', () => {
  const occurredAt = new Date('2026-09-05T18:30:00.000Z'); // 12:30 en America/Mexico_City

  it('formatea una confirmación sin motivo', () => {
    expect(buildReminderReplyNotesEntry({ to: 'confirmed', occurredAt })).toBe(
      '[2026-09-05 12:30 America/Mexico_City] Confirmada desde recordatorio (quién: sistema/recordatorio)'
    );
  });

  it('formatea una cancelación con motivo', () => {
    expect(
      buildReminderReplyNotesEntry({ to: 'cancelled', occurredAt, reasonText: 'no alcanzo, trabajo' })
    ).toBe(
      '[2026-09-05 12:30 America/Mexico_City] Cancelada desde recordatorio (quién: sistema/recordatorio). Motivo: no alcanzo, trabajo'
    );
  });

  it('sanea el motivo: recorta, colapsa saltos y trunca a 200 caracteres', () => {
    const entry = buildReminderReplyNotesEntry({
      to: 'cancelled',
      occurredAt,
      reasonText: '  no\npuedo   ir  ',
    });
    expect(entry).toContain('Motivo: no puedo ir');

    const long = buildReminderReplyNotesEntry({
      to: 'cancelled',
      occurredAt,
      reasonText: 'x'.repeat(250),
    });
    const motivo = long.split('Motivo: ')[1];
    expect(motivo).toHaveLength(200);
  });

  it('omite el motivo cuando viene vacío o solo espacios', () => {
    const entry = buildReminderReplyNotesEntry({
      to: 'cancelled',
      occurredAt,
      reasonText: '   ',
    });
    expect(entry).not.toContain('Motivo:');
  });
});

describe('appendReminderReplyNotes', () => {
  it('usa la entrada directa cuando no hay notas previas', () => {
    expect(appendReminderReplyNotes(null, 'NUEVO')).toBe('NUEVO');
    expect(appendReminderReplyNotes('   ', 'NUEVO')).toBe('NUEVO');
  });

  it('concatena con " | " cuando ya hay notas', () => {
    expect(appendReminderReplyNotes('nota previa', 'NUEVO')).toBe('nota previa | NUEVO');
  });
});
