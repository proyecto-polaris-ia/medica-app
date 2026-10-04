import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appointmentReminderPeriod,
  selectAppointmentReminderCandidates,
  sendAppointmentReminder,
  type AppointmentReminderCandidate,
} from '@/lib/citas/send-appointment-reminder';
import { sendOnboardingNudge } from '@/lib/citas/send-onboarding-nudge';
import { isOnboardingNudgeEnabled } from '@/lib/whatsapp/onboarding-flag';
import { GET, POST } from './route';

vi.mock('@/lib/citas/send-appointment-reminder', () => ({
  selectAppointmentReminderCandidates: vi.fn(),
  sendAppointmentReminder: vi.fn(),
  appointmentReminderPeriod: vi.fn(),
}));

vi.mock('@/lib/citas/send-onboarding-nudge', () => ({
  sendOnboardingNudge: vi.fn(),
}));

vi.mock('@/lib/whatsapp/onboarding-flag', () => ({
  isOnboardingNudgeEnabled: vi.fn(),
}));

const APPOINTMENT_ID = '990e8400-e29b-41d4-a716-446655440000';
const OTHER_APPOINTMENT_ID = '990e8400-e29b-41d4-a716-446655440001';
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const CRON_SECRET = 'cron-test-secret';
const PATH = 'http://localhost/api/cron/appointment-reminders';
const PERIOD = { isoWeekKey: '2026-W41', clinicDate: '2026-10-06' };

function candidate(overrides: Partial<AppointmentReminderCandidate> = {}): AppointmentReminderCandidate {
  return {
    appointmentId: APPOINTMENT_ID,
    patientId: PATIENT_ID,
    patientName: 'María López',
    patientPhoneE164: '+5215512345678',
    providerName: 'Dr. Jorge',
    startAt: '2026-10-06T16:00:00.000Z',
    status: 'requested',
    ...overrides,
  };
}

function setEnv(vars: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function restoreEnv() {
  delete process.env.CRON_SECRET;
  delete process.env.APPOINTMENT_REMINDERS_ENABLED;
  delete process.env.APPOINTMENT_REMINDERS_DRY_RUN;
}

function request(method: 'POST' | 'GET', bearer: string | null = CRON_SECRET): Request {
  const headers: Record<string, string> = {};
  if (bearer !== null) headers.Authorization = `Bearer ${bearer}`;
  return new Request(PATH, { method, headers });
}

/** Mock the helper module so the route test only exercises orchestration. */
function helper() {
  return {
    select: vi.mocked(selectAppointmentReminderCandidates),
    send: vi.mocked(sendAppointmentReminder),
    period: vi.mocked(appointmentReminderPeriod),
  };
}

/** Mock del módulo de nudge: el hook sólo orquesta, no envía. */
function nudgeHelper() {
  return {
    send: vi.mocked(sendOnboardingNudge),
    enabled: vi.mocked(isOnboardingNudgeEnabled),
  };
}

function whenHelperReturns(
  byCadence: Partial<Record<'h24' | 'same_day', AppointmentReminderCandidate[]>>
) {
  helper().select.mockImplementation(async (cadence) => byCadence[cadence] ?? []);
}

describe('POST /api/cron/appointment-reminders', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    helper().period.mockReturnValue(PERIOD);
    helper().select.mockResolvedValue([]);
    helper().send.mockResolvedValue({ reminderKey: 'never-called', sent: false, skipped: false });
  });

  afterEach(() => {
    restoreEnv();
  });

  describe('CRON_SECRET authorization (fail-closed)', () => {
    it('returns 401 and does no work when the Authorization header is missing', async () => {
      setEnv({ CRON_SECRET, APPOINTMENT_REMINDERS_ENABLED: 'true' });

      const res = await POST(request('POST', null));

      expect(res.status).toBe(401);
      expect(helper().select).not.toHaveBeenCalled();
      expect(helper().send).not.toHaveBeenCalled();
    });

    it('returns 401 and does no work when the bearer secret is wrong', async () => {
      setEnv({ CRON_SECRET, APPOINTMENT_REMINDERS_ENABLED: 'true' });

      const res = await POST(request('POST', 'wrong-secret'));

      expect(res.status).toBe(401);
      expect(helper().select).not.toHaveBeenCalled();
      expect(helper().send).not.toHaveBeenCalled();
    });

    it('returns 401 and does no work when CRON_SECRET is not configured', async () => {
      setEnv({ APPOINTMENT_REMINDERS_ENABLED: 'true' });

      const res = await POST(request('POST'));

      expect(res.status).toBe(401);
      expect(helper().select).not.toHaveBeenCalled();
      expect(helper().send).not.toHaveBeenCalled();
    });

    it('rejects non-Bearer schemes even when the secret matches', async () => {
      setEnv({ CRON_SECRET, APPOINTMENT_REMINDERS_ENABLED: 'true' });

      const res = await POST(
        new Request(PATH, { method: 'POST', headers: { Authorization: `Basic ${CRON_SECRET}` } })
      );

      expect(res.status).toBe(401);
      expect(helper().select).not.toHaveBeenCalled();
    });
  });

  describe('APPOINTMENT_REMINDERS_ENABLED flag', () => {
    it.each([
      ['missing', undefined],
      ['false', 'false'],
      ['0', '0'],
    ])('returns 200 { skipped: true } and does no work when the flag is %s', async (_label, value) => {
      setEnv({ CRON_SECRET, APPOINTMENT_REMINDERS_ENABLED: value });

      const res = await POST(request('POST'));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ skipped: true });
      expect(helper().select).not.toHaveBeenCalled();
      expect(helper().send).not.toHaveBeenCalled();
    });
  });

  describe('dry-run mode', () => {
    it('defaults to dryRun=true when APPOINTMENT_REMINDERS_DRY_RUN is unset and calls the helper with dryRun:true', async () => {
      setEnv({ CRON_SECRET, APPOINTMENT_REMINDERS_ENABLED: 'true' });
      whenHelperReturns({ h24: [candidate()] });
      helper().send.mockResolvedValue({
        reminderKey: `cita:${APPOINTMENT_ID}:h24:2026-W41`,
        sent: false,
        skipped: false,
        dryRun: true,
      });

      const res = await POST(request('POST'));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.dryRun).toBe(true);
      expect(helper().send).toHaveBeenCalledTimes(1);
      expect(helper().send).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
      // Dry-run persists a simulated row; nothing is counted as actually sent.
      expect(body.sent).toBe(0);
      expect(body.skipped).toBe(1);
    });

    it('APPOINTMENT_REMINDERS_DRY_RUN=0 switches to real mode (dryRun:false)', async () => {
      setEnv({ CRON_SECRET, APPOINTMENT_REMINDERS_ENABLED: 'true', APPOINTMENT_REMINDERS_DRY_RUN: '0' });
      whenHelperReturns({ same_day: [candidate()] });
      helper().send.mockResolvedValue({
        reminderKey: `cita:${APPOINTMENT_ID}:same_day:2026-10-06`,
        sent: true,
        skipped: false,
      });

      const res = await POST(request('POST'));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.dryRun).toBe(false);
      expect(helper().send).toHaveBeenCalledWith(expect.objectContaining({ dryRun: false }));
      expect(body.sent).toBe(1);
    });
  });

  describe('run orchestration', () => {
    it('runs both cadences in one pass and reports real per-cadence counts', async () => {
      setEnv({ CRON_SECRET, APPOINTMENT_REMINDERS_ENABLED: 'true' });
      whenHelperReturns({
        h24: [candidate(), candidate({ appointmentId: OTHER_APPOINTMENT_ID })],
        same_day: [candidate({ startAt: '2026-10-06T20:00:00.000Z' })],
      });
      helper().send.mockImplementation(async (input) =>
        input.appointmentId === OTHER_APPOINTMENT_ID
          ? { reminderKey: 'dedup', sent: false, skipped: true }
          : { reminderKey: 'ok', sent: true, skipped: false }
      );

      const res = await POST(request('POST'));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.dryRun).toBe(true);
      expect(body.sent).toBe(2);
      expect(body.skipped).toBe(1);
      expect(body.cadencias).toEqual({
        h24: { sent: 1, skipped: 1, total: 2 },
        sameDay: { sent: 1, skipped: 0, total: 1 },
      });
      expect(helper().select).toHaveBeenCalledWith('h24', expect.any(Date));
      expect(helper().select).toHaveBeenCalledWith('same_day', expect.any(Date));
    });

    it('counts a helper-reported skip (dedup) as skipped, never as sent', async () => {
      setEnv({ CRON_SECRET, APPOINTMENT_REMINDERS_ENABLED: 'true' });
      whenHelperReturns({ h24: [candidate()] });
      helper().send.mockResolvedValue({
        reminderKey: `cita:${APPOINTMENT_ID}:h24:2026-W41`,
        sent: false,
        skipped: true,
      });

      const res = await POST(request('POST'));
      const body = await res.json();

      expect(body.sent).toBe(0);
      expect(body.skipped).toBe(1);
      expect(body.cadencias.h24).toEqual({ sent: 0, skipped: 1, total: 1 });
    });

    it('keeps running the remaining candidates when the helper throws for one of them', async () => {
      setEnv({ CRON_SECRET, APPOINTMENT_REMINDERS_ENABLED: 'true' });
      whenHelperReturns({
        h24: [candidate(), candidate({ appointmentId: OTHER_APPOINTMENT_ID })],
      });
      helper().send
        .mockRejectedValueOnce(new Error('provider exploded'))
        .mockResolvedValueOnce({ reminderKey: 'ok', sent: true, skipped: false });

      const res = await POST(request('POST'));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(helper().send).toHaveBeenCalledTimes(2);
      expect(body.cadencias.h24).toEqual({ sent: 1, skipped: 1, total: 2 });
    });

    it('reports zeroed cadences when there are no candidates', async () => {
      setEnv({ CRON_SECRET, APPOINTMENT_REMINDERS_ENABLED: 'true' });
      whenHelperReturns({});

      const res = await POST(request('POST'));
      const body = await res.json();

      expect(body).toEqual({
        sent: 0,
        skipped: 0,
        dryRun: true,
        cadencias: {
          h24: { sent: 0, skipped: 0, total: 0 },
          sameDay: { sent: 0, skipped: 0, total: 0 },
        },
      });
    });
  });

  describe('onboarding nudge hook', () => {
    it('llama al nudge sólo para los candidatos cuyo recordatorio devolvió sent === true', async () => {
      setEnv({ CRON_SECRET, APPOINTMENT_REMINDERS_ENABLED: 'true' });
      nudgeHelper().enabled.mockReturnValue(true);
      whenHelperReturns({
        h24: [candidate(), candidate({ appointmentId: OTHER_APPOINTMENT_ID })],
      });
      helper().send.mockImplementation(async (input) =>
        input.appointmentId === OTHER_APPOINTMENT_ID
          ? { reminderKey: 'ok', sent: true, skipped: false }
          : { reminderKey: 'dedup', sent: false, skipped: true }
      );
      nudgeHelper().send.mockResolvedValue({ reminderKey: 'nudge', sent: true, skipped: false });

      await POST(request('POST'));

      expect(nudgeHelper().send).toHaveBeenCalledTimes(1);
      expect(nudgeHelper().send).toHaveBeenCalledWith(
        expect.objectContaining({
          patientId: PATIENT_ID,
          patientPhoneE164: '+5215512345678',
          appointmentId: OTHER_APPOINTMENT_ID,
          startAt: '2026-10-06T16:00:00.000Z',
        })
      );
    });

    it('no llama al nudge cuando el recordatorio no se envió', async () => {
      setEnv({ CRON_SECRET, APPOINTMENT_REMINDERS_ENABLED: 'true' });
      nudgeHelper().enabled.mockReturnValue(true);
      whenHelperReturns({ h24: [candidate()] });
      helper().send.mockResolvedValue({ reminderKey: 'dedup', sent: false, skipped: true });

      await POST(request('POST'));

      expect(nudgeHelper().send).not.toHaveBeenCalled();
    });

    it('con WHATSAPP_ONBOARDING_NUDGE_ENABLED apagado no llama al nudge aunque el recordatorio salga', async () => {
      setEnv({ CRON_SECRET, APPOINTMENT_REMINDERS_ENABLED: 'true' });
      nudgeHelper().enabled.mockReturnValue(false);
      whenHelperReturns({ h24: [candidate()] });
      helper().send.mockResolvedValue({ reminderKey: 'ok', sent: true, skipped: false });

      const res = await POST(request('POST'));
      const body = await res.json();

      expect(nudgeHelper().send).not.toHaveBeenCalled();
      expect(body.sent).toBe(1);
    });

    it('un fallo del nudge nunca afecta el resultado del recordatorio', async () => {
      setEnv({ CRON_SECRET, APPOINTMENT_REMINDERS_ENABLED: 'true' });
      nudgeHelper().enabled.mockReturnValue(true);
      whenHelperReturns({ h24: [candidate()] });
      helper().send.mockResolvedValue({ reminderKey: 'ok', sent: true, skipped: false });
      nudgeHelper().send.mockRejectedValue(new Error('nudge exploded'));

      const res = await POST(request('POST'));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.sent).toBe(1);
      expect(body.skipped).toBe(0);
      expect(body.cadencias.h24).toEqual({ sent: 1, skipped: 0, total: 1 });
    });
  });

  describe('GET alias', () => {
    it('delegates to the same POST behavior', async () => {
      setEnv({ CRON_SECRET, APPOINTMENT_REMINDERS_ENABLED: 'true' });
      whenHelperReturns({ h24: [candidate()] });
      helper().send.mockResolvedValue({ reminderKey: 'ok', sent: true, skipped: false });

      const res = await GET(request('GET'));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.sent).toBe(1);
      expect(helper().send).toHaveBeenCalledWith(
        expect.objectContaining({ appointmentId: APPOINTMENT_ID, cadence: 'h24' })
      );
    });

    it('rejects GET without a valid bearer token', async () => {
      setEnv({ CRON_SECRET, APPOINTMENT_REMINDERS_ENABLED: 'true' });

      const res = await GET(request('GET', null));

      expect(res.status).toBe(401);
      expect(helper().select).not.toHaveBeenCalled();
    });
  });
});
