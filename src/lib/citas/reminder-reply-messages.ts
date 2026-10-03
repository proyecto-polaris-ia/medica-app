/**
 * Mensajes deterministas es-MX para la respuesta al recordatorio (issue #87,
 * design.md §6). Sin LLM: la fecha y hora SIEMPRE se leen de la cita registrada
 * con los helpers existentes (`formatClinicDateLabel` y `clinicTimeLabel`); el
 * texto nunca inventa una fecha distinta.
 */

import { clinicTimeLabel } from '@/lib/admin/timezone';
import { formatClinicDateLabel, formatPatientFirstName } from './send-appointment-reminder';

function appointmentDateTimeLabel(startAt: string): string {
  return `${formatClinicDateLabel(startAt)} a las ${clinicTimeLabel(startAt)}`;
}

/** Acuse de cita confirmada desde el recordatorio. */
export function buildReminderConfirmationAck(input: {
  startAt: string;
  patientName?: string;
}): string {
  const firstName = input.patientName?.trim() ? formatPatientFirstName(input.patientName) : '';
  const greeting = firstName ? `¡Listo, ${firstName}!` : '¡Listo!';
  return `${greeting} Tu cita quedó confirmada para el ${appointmentDateTimeLabel(input.startAt)}. Te esperamos.`;
}

/** Acuse de cita cancelada desde el recordatorio, ofreciendo reagendar. */
export function buildReminderCancellationAck(input: { startAt: string }): string {
  return `Entendido, cancelamos tu cita del ${appointmentDateTimeLabel(input.startAt)}. Una persona del consultorio te contactará para reagendar.`;
}

/** Acuse corto cuando la cita ya estaba confirmada (respuesta repetida). */
export function buildReminderAlreadyConfirmedReply(input: { startAt: string }): string {
  return `Tu cita del ${appointmentDateTimeLabel(input.startAt)} ya estaba confirmada. Te esperamos.`;
}

/** Respuesta cuando la intención mezcla una señal clínica (ambigüedad). */
export function buildReminderAmbiguityReply(): string {
  return 'Gracias por avisarnos. Para cuidarte bien, una persona del consultorio revisará tu mensaje y te dará seguimiento.';
}

/** Respuesta cuando la respuesta llega fuera de la ventana de recordatorio. */
export function buildReminderOutOfWindowReply(): string {
  return 'Gracias por escribirnos. Una persona del consultorio revisará tu mensaje y te dará seguimiento.';
}
