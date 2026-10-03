import { describe, expect, it } from 'vitest';
import { formatClinicDateLabel } from '../send-appointment-reminder';
import { clinicTimeLabel } from '@/lib/admin/timezone';
import {
  buildReminderAlreadyConfirmedReply,
  buildReminderAmbiguityReply,
  buildReminderCancellationAck,
  buildReminderConfirmationAck,
  buildReminderOutOfWindowReply,
} from '../reminder-reply-messages';

// 2026-10-05T16:00:00.000Z = lunes 5 de octubre, 10:00 en America/Mexico_City.
const START_AT = '2026-10-05T16:00:00.000Z';

/**
 * Fase 1 — Mensajes deterministas (design.md §6). Sin LLM: la fecha y hora
 * SIEMPRE salen de la cita registrada con los helpers existentes.
 */
describe('buildReminderConfirmationAck', () => {
  it('usa la fecha y hora reales de la cita', () => {
    const text = buildReminderConfirmationAck({ startAt: START_AT });

    expect(text).toContain(formatClinicDateLabel(START_AT)); // "lunes 5 de octubre"
    expect(text).toContain(clinicTimeLabel(START_AT)); // "10:00"
    expect(text).toContain('confirmada');
  });

  it('saluda con el nombre cuando está disponible', () => {
    const text = buildReminderConfirmationAck({ startAt: START_AT, patientName: 'María López' });
    expect(text).toContain('María');
    expect(text).toContain('lunes 5 de octubre');
    expect(text).toContain('10:00');
  });

  it('no rompe la plantilla sin nombre de paciente', () => {
    const text = buildReminderConfirmationAck({ startAt: START_AT, patientName: undefined });
    expect(text).toContain('lunes 5 de octubre');
    expect(text).toContain('10:00');
  });
});

describe('buildReminderCancellationAck', () => {
  it('usa la fecha y hora reales y ofrece reagendar', () => {
    const text = buildReminderCancellationAck({ startAt: START_AT });

    expect(text).toContain(formatClinicDateLabel(START_AT));
    expect(text).toContain(clinicTimeLabel(START_AT));
    expect(text).toMatch(/reagendar/i);
  });
});

describe('buildReminderAlreadyConfirmedReply', () => {
  it('usa la fecha y hora reales', () => {
    const text = buildReminderAlreadyConfirmedReply({ startAt: START_AT });
    expect(text).toContain(formatClinicDateLabel(START_AT));
    expect(text).toContain(clinicTimeLabel(START_AT));
    expect(text).toMatch(/confirmada/i);
  });
});

describe('buildReminderAmbiguityReply', () => {
  it('es un texto fijo es-MX sin fecha inventada', () => {
    const text = buildReminderAmbiguityReply();
    expect(text).toMatch(/una persona del consultorio/i);
  });
});

describe('buildReminderOutOfWindowReply', () => {
  it('es un texto fijo es-MX de seguimiento humano', () => {
    const text = buildReminderOutOfWindowReply();
    expect(text).toMatch(/una persona del consultorio/i);
  });
});
