import { describe, expect, it } from 'vitest';
import {
  buildFollowUpList,
  daysBetween,
  isInactivePatient,
  isRecoverableNoShow,
  isStalledTreatmentPlan,
  isUnansweredQuote,
  pickReasonForPatient,
} from '../rules';
import type { FollowUpAppointment, FollowUpPlan, FollowUpRulesInput } from '../rules';
import {
  INACTIVE_PATIENT_DAYS,
  NO_SHOW_WINDOW_DAYS,
  STALLED_TREATMENT_DAYS,
  UNANSWERED_QUOTE_DAYS,
} from '../config';

const NOW = new Date('2026-10-01T12:00:00.000Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * MS_PER_DAY).toISOString();
}

function appointment(
  overrides: Partial<FollowUpAppointment> = {}
): FollowUpAppointment {
  return {
    id: 'appt-1',
    patientId: 'patient-1',
    startAt: daysAgo(30),
    status: 'no_show',
    ...overrides,
  };
}

function plan(overrides: Partial<FollowUpPlan> = {}): FollowUpPlan {
  return {
    id: 'plan-1',
    patientId: 'patient-1',
    name: 'Ortodoncia',
    status: 'in_progress',
    createdAt: daysAgo(120),
    updatedAt: daysAgo(120),
    ...overrides,
  };
}

describe('rules — segmento de no-shows recuperables (R1)', () => {
  describe('daysBetween', () => {
    it('counts whole days between an ISO instant and the injected now', () => {
      expect(daysBetween(daysAgo(30), NOW)).toBe(30);
      expect(daysBetween(daysAgo(90), NOW)).toBe(90);
      expect(daysBetween(daysAgo(-5), NOW)).toBe(-5);
    });
  });

  describe('isRecoverableNoShow', () => {
    it('includes a no-show 30 days ago without a later appointment', () => {
      const noShow = appointment({ startAt: daysAgo(30) });

      expect(isRecoverableNoShow(noShow, [noShow], NOW)).toBe(true);
    });

    it('includes a no-show at the exact 90-day limit', () => {
      const noShow = appointment({ startAt: daysAgo(90) });

      expect(isRecoverableNoShow(noShow, [noShow], NOW)).toBe(true);
    });

    it('excludes a no-show with a later attended appointment', () => {
      const noShow = appointment({ startAt: daysAgo(20) });
      const attended = appointment({
        id: 'appt-2',
        startAt: daysAgo(5),
        status: 'attended',
      });

      expect(isRecoverableNoShow(noShow, [noShow, attended], NOW)).toBe(false);
    });

    it('includes a no-show that only has later cancelled appointments', () => {
      const noShow = appointment({ startAt: daysAgo(20) });
      const cancelled = appointment({
        id: 'appt-2',
        startAt: daysAgo(5),
        status: 'cancelled',
      });

      expect(isRecoverableNoShow(noShow, [noShow, cancelled], NOW)).toBe(true);
    });

    it('excludes a no-show with a later rescheduled appointment', () => {
      const noShow = appointment({ startAt: daysAgo(20) });
      const rescheduled = appointment({
        id: 'appt-2',
        startAt: daysAgo(5),
        status: 'rescheduled',
      });

      expect(isRecoverableNoShow(noShow, [noShow, rescheduled], NOW)).toBe(
        false
      );
    });

    it('excludes a future no-show that has not happened yet', () => {
      const future = appointment({ startAt: daysAgo(-3) });

      expect(isRecoverableNoShow(future, [future], NOW)).toBe(false);
    });
  });
});

describe('rules — segmento de tratamientos inconclusos (R2)', () => {
  it('includes an in_progress plan whose last visit is 60 days old', () => {
    expect(isStalledTreatmentPlan(plan(), daysAgo(60), NOW)).toBe(true);
  });

  it('excludes an in_progress plan whose last visit is 30 days old', () => {
    expect(isStalledTreatmentPlan(plan(), daysAgo(30), NOW)).toBe(false);
  });

  it('uses treatment_plans.created_at when the patient has no visits', () => {
    const created60DaysAgo = plan({ createdAt: daysAgo(60) });

    expect(isStalledTreatmentPlan(created60DaysAgo, null, NOW)).toBe(true);
  });

  it('excludes an in_progress plan at the exact 45-day threshold', () => {
    expect(isStalledTreatmentPlan(plan(), daysAgo(45), NOW)).toBe(false);
  });
});

describe('rules — segmento de pacientes inactivos (R3)', () => {
  const PATIENT_ID = 'patient-1';

  it('includes a patient whose latest attended appointment was 8 months ago', () => {
    const attended = appointment({
      startAt: daysAgo(8 * 30),
      status: 'attended',
    });

    expect(isInactivePatient(PATIENT_ID, [attended], NOW)).toBe(true);
  });

  it('excludes a patient whose latest attended appointment was 2 months ago', () => {
    const attended = appointment({ startAt: daysAgo(60), status: 'attended' });

    expect(isInactivePatient(PATIENT_ID, [attended], NOW)).toBe(false);
  });

  it('excludes a patient with a future scheduled appointment', () => {
    const past = appointment({ startAt: daysAgo(8 * 30), status: 'attended' });
    const future = appointment({
      id: 'appt-2',
      startAt: daysAgo(-10),
      status: 'confirmed',
    });

    expect(isInactivePatient(PATIENT_ID, [past, future], NOW)).toBe(false);
  });

  it('excludes a patient without any historical appointment', () => {
    expect(isInactivePatient(PATIENT_ID, [], NOW)).toBe(false);
  });
});

describe('rules — segmento de presupuestos sin respuesta (R4)', () => {
  it('includes a presented plan updated 30 days ago', () => {
    const presented = plan({ status: 'presented', updatedAt: daysAgo(30) });

    expect(isUnansweredQuote(presented, NOW)).toBe(true);
  });

  it('excludes a presented plan updated 10 days ago', () => {
    const presented = plan({ status: 'presented', updatedAt: daysAgo(10) });

    expect(isUnansweredQuote(presented, NOW)).toBe(false);
  });

  it('excludes plans that are no longer presented', () => {
    const accepted = plan({ status: 'accepted', updatedAt: daysAgo(30) });
    const cancelled = plan({ status: 'cancelled', updatedAt: daysAgo(30) });

    expect(isUnansweredQuote(accepted, NOW)).toBe(false);
    expect(isUnansweredQuote(cancelled, NOW)).toBe(false);
  });
});

describe('rules — deduplicación y prioridad (R5)', () => {
  const PATIENT_ID = 'patient-1';

  it('keeps the patient once with no_show when qualifying for no_show and quote', () => {
    const noShow = appointment({
      patientId: PATIENT_ID,
      startAt: daysAgo(20),
      status: 'no_show',
    });
    const quote = plan({
      patientId: PATIENT_ID,
      status: 'presented',
      updatedAt: daysAgo(30),
    });

    const candidate = pickReasonForPatient(
      PATIENT_ID,
      [noShow],
      [quote],
      null,
      NOW
    );

    expect(candidate?.reason).toBe('no_show');
    expect(candidate?.sourceAppointmentId).toBe(noShow.id);
    expect(candidate?.sourcePlanId).toBeNull();
  });

  it('prefers treatment_in_progress over quote and inactive', () => {
    const attended = appointment({
      patientId: PATIENT_ID,
      startAt: daysAgo(8 * 30),
      status: 'attended',
    });
    const stalled = plan({
      id: 'plan-stalled',
      patientId: PATIENT_ID,
      status: 'in_progress',
      createdAt: daysAgo(120),
    });
    const quote = plan({
      id: 'plan-quote',
      patientId: PATIENT_ID,
      status: 'presented',
      updatedAt: daysAgo(30),
    });

    const candidate = pickReasonForPatient(
      PATIENT_ID,
      [attended],
      [stalled, quote],
      daysAgo(60),
      NOW
    );

    expect(candidate?.reason).toBe('treatment_in_progress');
    expect(candidate?.sourcePlanId).toBe(stalled.id);
    expect(candidate?.sourceAppointmentId).toBeNull();
  });

  it('keeps the reason of a patient qualifying for a single segment', () => {
    const attended = appointment({
      patientId: PATIENT_ID,
      startAt: daysAgo(8 * 30),
      status: 'attended',
    });

    const candidate = pickReasonForPatient(
      PATIENT_ID,
      [attended],
      [],
      null,
      NOW
    );

    expect(candidate?.reason).toBe('inactive');
    expect(candidate?.sourceAppointmentId).toBe(attended.id);
  });

  it('buildFollowUpList emits one entry per patient', () => {
    const p1NoShow = appointment({
      id: 'appt-p1',
      patientId: 'patient-1',
      startAt: daysAgo(20),
      status: 'no_show',
    });
    const p1Quote = plan({
      id: 'plan-p1',
      patientId: 'patient-1',
      status: 'presented',
      updatedAt: daysAgo(30),
    });
    const p2Inactive = appointment({
      id: 'appt-p2',
      patientId: 'patient-2',
      startAt: daysAgo(8 * 30),
      status: 'attended',
    });

    const list = buildFollowUpList({
      now: NOW,
      appointments: [p1NoShow, p2Inactive],
      plans: [p1Quote],
      lastVisitByPatient: new Map(),
    });

    expect(list).toHaveLength(2);
    expect(list.map((entry) => entry.patientId)).toEqual([
      'patient-1',
      'patient-2',
    ]);
    expect(list[0].reason).toBe('no_show');
    expect(list[1].reason).toBe('inactive');
    expect(new Set(list.map((entry) => entry.patientId)).size).toBe(list.length);
  });
});

describe('rules — determinismo, orden y umbrales (R6)', () => {
  function determinismInput(): FollowUpRulesInput {
    return {
      now: NOW,
      appointments: [
        appointment({
          id: 'appt-b',
          patientId: 'patient-b',
          startAt: daysAgo(240),
          status: 'attended',
        }),
        appointment({
          id: 'appt-c',
          patientId: 'patient-c',
          startAt: daysAgo(10),
          status: 'no_show',
        }),
        appointment({
          id: 'appt-a',
          patientId: 'patient-a',
          startAt: daysAgo(40),
          status: 'no_show',
        }),
        appointment({
          id: 'appt-d',
          patientId: 'patient-d',
          startAt: daysAgo(300),
          status: 'attended',
        }),
      ],
      plans: [
        plan({
          id: 'plan-d',
          patientId: 'patient-d',
          status: 'presented',
          updatedAt: daysAgo(30),
        }),
      ],
      lastVisitByPatient: new Map(),
    };
  }

  it('returns identical content and order for the same now and data', () => {
    const first = buildFollowUpList(determinismInput());
    const second = buildFollowUpList(determinismInput());

    expect(first).toEqual(second);
  });

  it('orders by priority index, then reasonDate asc, then patientId asc', () => {
    const list = buildFollowUpList(determinismInput());

    expect(list.map((entry) => [entry.patientId, entry.reason])).toEqual([
      ['patient-a', 'no_show'],
      ['patient-c', 'no_show'],
      ['patient-d', 'quote_no_response'],
      ['patient-b', 'inactive'],
    ]);
  });

  it('derives every exact-threshold case from the config constants', () => {
    const noShow = appointment({ startAt: daysAgo(NO_SHOW_WINDOW_DAYS) });
    const noShowTooOld = appointment({
      id: 'appt-old',
      startAt: daysAgo(NO_SHOW_WINDOW_DAYS + 1),
    });
    expect(isRecoverableNoShow(noShow, [noShow], NOW)).toBe(true);
    expect(isRecoverableNoShow(noShowTooOld, [noShowTooOld], NOW)).toBe(false);

    expect(
      isStalledTreatmentPlan(plan(), daysAgo(STALLED_TREATMENT_DAYS), NOW)
    ).toBe(false);
    expect(
      isStalledTreatmentPlan(
        plan(),
        daysAgo(STALLED_TREATMENT_DAYS + 1),
        NOW
      )
    ).toBe(true);

    const quote = plan({
      status: 'presented',
      updatedAt: daysAgo(UNANSWERED_QUOTE_DAYS),
    });
    const olderQuote = plan({
      status: 'presented',
      updatedAt: daysAgo(UNANSWERED_QUOTE_DAYS + 1),
    });
    expect(isUnansweredQuote(quote, NOW)).toBe(false);
    expect(isUnansweredQuote(olderQuote, NOW)).toBe(true);

    const inactive = appointment({
      startAt: daysAgo(INACTIVE_PATIENT_DAYS),
      status: 'attended',
    });
    const moreInactive = appointment({
      startAt: daysAgo(INACTIVE_PATIENT_DAYS + 1),
      status: 'attended',
    });
    expect(isInactivePatient('patient-1', [inactive], NOW)).toBe(false);
    expect(isInactivePatient('patient-1', [moreInactive], NOW)).toBe(true);
  });

  it('depends only on the injected now, never on the system clock', () => {
    const startAt = daysAgo(100);
    const data = {
      appointments: [
        appointment({
          patientId: 'patient-1',
          startAt,
          status: 'no_show' as const,
        }),
      ],
      plans: [] as FollowUpPlan[],
      lastVisitByPatient: new Map<string, string>(),
    };

    const today = buildFollowUpList({ ...data, now: NOW });
    const threeWeeksEarlier = buildFollowUpList({
      ...data,
      now: new Date(NOW.getTime() - 20 * MS_PER_DAY),
    });

    expect(today).toEqual([]);
    expect(threeWeeksEarlier.map((entry) => entry.patientId)).toEqual([
      'patient-1',
    ]);
  });
});

describe('rules — triangulación de bordes (R1–R6)', () => {
  it('returns an empty list for empty inputs', () => {
    expect(
      buildFollowUpList({
        now: NOW,
        appointments: [],
        plans: [],
        lastVisitByPatient: new Map(),
      })
    ).toEqual([]);
  });

  it('excludes a completed plan even when its reference date is old', () => {
    const completed = plan({ status: 'completed', createdAt: daysAgo(200) });

    expect(isStalledTreatmentPlan(completed, daysAgo(200), NOW)).toBe(false);
    expect(
      pickReasonForPatient('patient-1', [], [completed], daysAgo(200), NOW)
    ).toBeNull();
  });

  it('excludes a no-show older than the window', () => {
    const tooOld = appointment({ startAt: daysAgo(120) });

    expect(isRecoverableNoShow(tooOld, [tooOld], NOW)).toBe(false);
    expect(pickReasonForPatient('patient-1', [tooOld], [], null, NOW)).toBeNull();
  });

  it('does not treat a past cancelled appointment as a historical appointment', () => {
    const cancelled = appointment({
      startAt: daysAgo(240),
      status: 'cancelled',
    });

    expect(isInactivePatient('patient-1', [cancelled], NOW)).toBe(false);
  });

  it('emits a single entry when the same patient has two recoverable no-shows', () => {
    const older = appointment({
      id: 'appt-1',
      patientId: 'patient-1',
      startAt: daysAgo(40),
    });
    const newer = appointment({
      id: 'appt-2',
      patientId: 'patient-1',
      startAt: daysAgo(20),
    });

    const list = buildFollowUpList({
      now: NOW,
      appointments: [older, newer],
      plans: [],
      lastVisitByPatient: new Map(),
    });

    expect(list).toHaveLength(1);
    expect(list[0].reason).toBe('no_show');
    expect(list[0].sourceAppointmentId).toBe('appt-2');
  });
});
