import type { TreatmentPlanStatus } from '../types';
import {
  FOLLOW_UP_REASON_PRIORITY,
  INACTIVE_PATIENT_DAYS,
  MS_PER_DAY,
  NO_SHOW_WINDOW_DAYS,
  STALLED_TREATMENT_DAYS,
  UNANSWERED_QUOTE_DAYS,
} from './config';

export type FollowUpReason = (typeof FOLLOW_UP_REASON_PRIORITY)[number];

export type FollowUpAppointmentStatus =
  | 'requested'
  | 'confirmed'
  | 'pending'
  | 'cancelled'
  | 'rescheduled'
  | 'no_show'
  | 'attended';

export type FollowUpAppointment = {
  id: string;
  patientId: string;
  startAt: string;
  status: FollowUpAppointmentStatus;
};

export type FollowUpPlan = {
  id: string;
  patientId: string;
  name: string;
  status: TreatmentPlanStatus;
  createdAt: string;
  updatedAt: string;
};

export type FollowUpRulesInput = {
  now: Date;
  appointments: FollowUpAppointment[];
  plans: FollowUpPlan[];
  /** Última visita por paciente: created_at máximo de clinical_visits. */
  lastVisitByPatient: Map<string, string>;
};

export type FollowUpCandidate = {
  patientId: string;
  reason: FollowUpReason;
  reasonDate: string;
  reasonLabel: string;
  sourceAppointmentId: string | null;
  sourcePlanId: string | null;
};

/**
 * Días completos entre un instante ISO y `now`. Negativo si el instante está en
 * el futuro respecto de `now`.
 */
export function daysBetween(instantIso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(instantIso).getTime()) / MS_PER_DAY);
}

/**
 * Un no-show es recuperable cuando su `start_at` cae dentro de la ventana
 * (incluido el límite exacto de 90 días) y el paciente no tiene ninguna cita
 * posterior no cancelada. Una cita posterior `cancelled` no excluye; cualquier
 * otro estado posterior (por ejemplo `rescheduled`) sí.
 */
export function isRecoverableNoShow(
  appointment: FollowUpAppointment,
  patientAppointments: FollowUpAppointment[],
  now: Date
): boolean {
  if (appointment.status !== 'no_show') {
    return false;
  }

  const days = daysBetween(appointment.startAt, now);
  if (days < 0 || days > NO_SHOW_WINDOW_DAYS) {
    return false;
  }

  const hasLaterNonCancelled = patientAppointments.some(
    (other) =>
      other.startAt > appointment.startAt && other.status !== 'cancelled'
  );

  return !hasLaterNonCancelled;
}

/**
 * Un plan `in_progress` está inconcluso cuando su fecha de referencia tiene más
 * de 45 días. La referencia es la última visita clínica (`clinical_visits.created_at`
 * máxima) o, si no hay visitas, `treatment_plans.created_at`.
 */
export function isStalledTreatmentPlan(
  plan: FollowUpPlan,
  lastVisitCreatedAt: string | null,
  now: Date
): boolean {
  if (plan.status !== 'in_progress') {
    return false;
  }

  const reference = lastVisitCreatedAt ?? plan.createdAt;
  return daysBetween(reference, now) > STALLED_TREATMENT_DAYS;
}

function latestNonCancelled(
  appointments: FollowUpAppointment[]
): FollowUpAppointment | null {
  return mostRecentByDateAndId(
    appointments.filter((appointment) => appointment.status !== 'cancelled'),
    (appointment) => appointment.startAt,
    (appointment) => appointment.id
  );
}

/**
 * Un paciente está inactivo cuando tiene al menos una cita histórica (atendida
 * o con `start_at` en el pasado) y su cita más reciente no cancelada tiene más
 * de 6 meses (180 días). Una cita futura no cancelada hace que `daysBetween`
 * sea negativo y por lo tanto el paciente no califica como inactivo.
 */
export function isInactivePatient(
  patientId: string,
  patientAppointments: FollowUpAppointment[],
  now: Date
): boolean {
  const appointments = patientAppointments.filter(
    (appointment) => appointment.patientId === patientId
  );

  const hasHistoricalAppointment = appointments.some(
    (appointment) =>
      appointment.status === 'attended' ||
      (appointment.status !== 'cancelled' &&
        daysBetween(appointment.startAt, now) >= 0)
  );
  if (!hasHistoricalAppointment) {
    return false;
  }

  const latest = latestNonCancelled(appointments);
  if (!latest) {
    return false;
  }

  return daysBetween(latest.startAt, now) > INACTIVE_PATIENT_DAYS;
}

/**
 * Un plan `presented` sigue sin respuesta cuando su `updated_at` tiene más de
 * 21 días.
 *
 * Limitación documentada: el esquema no tiene `presented_at`, por lo que la
 * antigüedad se aproxima con `treatment_plans.updated_at`. Esa fecha es el
 * último cambio del plan y nunca debe presentarse como la fecha exacta de
 * presentación al paciente.
 */
export function isUnansweredQuote(plan: FollowUpPlan, now: Date): boolean {
  if (plan.status !== 'presented') {
    return false;
  }

  return daysBetween(plan.updatedAt, now) > UNANSWERED_QUOTE_DAYS;
}

const REASON_LABELS: Record<FollowUpReason, string> = {
  no_show: 'Cita no atendida',
  treatment_in_progress: 'Tratamiento inconcluso',
  quote_no_response: 'Presupuesto sin respuesta',
  inactive: 'Paciente inactivo',
};

export function followUpReasonLabel(reason: FollowUpReason): string {
  return REASON_LABELS[reason];
}

/** Candidato no nulo con la mayor `reasonDate`; `id` ascendente como desempate. */
function mostRecentByDateAndId<T>(
  items: T[],
  dateOf: (item: T) => string,
  idOf: (item: T) => string
): T | null {
  return items.reduce<T | null>((best, item) => {
    if (!best) {
      return item;
    }
    const date = dateOf(item);
    const bestDate = dateOf(best);
    if (date > bestDate) {
      return item;
    }
    if (date === bestDate && idOf(item) < idOf(best)) {
      return item;
    }
    return best;
  }, null);
}

function buildCandidate(
  patientId: string,
  reason: FollowUpReason,
  reasonDate: string,
  sourceAppointmentId: string | null,
  sourcePlanId: string | null
): FollowUpCandidate {
  return {
    patientId,
    reason,
    reasonDate,
    reasonLabel: followUpReasonLabel(reason),
    sourceAppointmentId,
    sourcePlanId,
  };
}

/**
 * Devuelve el motivo principal de un paciente aplicando la prioridad
 * `no_show` > `treatment_in_progress` > `quote_no_response` > `inactive`, o
 * `null` si el paciente no califica para ningún segmento.
 */
export function pickReasonForPatient(
  patientId: string,
  patientAppointments: FollowUpAppointment[],
  patientPlans: FollowUpPlan[],
  lastVisitCreatedAt: string | null,
  now: Date
): FollowUpCandidate | null {
  const appointments = patientAppointments.filter(
    (appointment) => appointment.patientId === patientId
  );
  const plans = patientPlans.filter((plan) => plan.patientId === patientId);

  const noShow = mostRecentByDateAndId(
    appointments.filter((appointment) =>
      isRecoverableNoShow(appointment, appointments, now)
    ),
    (appointment) => appointment.startAt,
    (appointment) => appointment.id
  );
  if (noShow) {
    return buildCandidate(patientId, 'no_show', noShow.startAt, noShow.id, null);
  }

  const stalledPlan = mostRecentByDateAndId(
    plans.filter((plan) =>
      isStalledTreatmentPlan(plan, lastVisitCreatedAt, now)
    ),
    (plan) => lastVisitCreatedAt ?? plan.createdAt,
    (plan) => plan.id
  );
  if (stalledPlan) {
    return buildCandidate(
      patientId,
      'treatment_in_progress',
      lastVisitCreatedAt ?? stalledPlan.createdAt,
      null,
      stalledPlan.id
    );
  }

  const unansweredQuote = mostRecentByDateAndId(
    plans.filter((plan) => isUnansweredQuote(plan, now)),
    (plan) => plan.updatedAt,
    (plan) => plan.id
  );
  if (unansweredQuote) {
    return buildCandidate(
      patientId,
      'quote_no_response',
      unansweredQuote.updatedAt,
      null,
      unansweredQuote.id
    );
  }

  if (isInactivePatient(patientId, appointments, now)) {
    const latest = latestNonCancelled(appointments);
    if (latest) {
      return buildCandidate(
        patientId,
        'inactive',
        latest.startAt,
        latest.id,
        null
      );
    }
  }

  return null;
}

/**
 * Construye la lista del día: un candidato por paciente con su motivo principal.
 * Puro y determinista para la misma `now` y los mismos datos.
 */
export function buildFollowUpList(
  input: FollowUpRulesInput
): FollowUpCandidate[] {
  const patientIds = Array.from(
    new Set([
      ...input.appointments.map((appointment) => appointment.patientId),
      ...input.plans.map((plan) => plan.patientId),
    ])
  );

  const candidates: FollowUpCandidate[] = [];
  for (const patientId of patientIds) {
    const candidate = pickReasonForPatient(
      patientId,
      input.appointments,
      input.plans,
      input.lastVisitByPatient.get(patientId) ?? null,
      input.now
    );
    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates.sort(compareCandidates);
}

function reasonPriorityIndex(reason: FollowUpReason): number {
  return FOLLOW_UP_REASON_PRIORITY.indexOf(reason);
}

/** Orden estable: (índice de prioridad asc, `reasonDate` asc, `patientId` asc). */
function compareCandidates(
  a: FollowUpCandidate,
  b: FollowUpCandidate
): number {
  const byPriority = reasonPriorityIndex(a.reason) - reasonPriorityIndex(b.reason);
  if (byPriority !== 0) {
    return byPriority;
  }
  if (a.reasonDate !== b.reasonDate) {
    return a.reasonDate < b.reasonDate ? -1 : 1;
  }
  if (a.patientId !== b.patientId) {
    return a.patientId < b.patientId ? -1 : 1;
  }
  return 0;
}
