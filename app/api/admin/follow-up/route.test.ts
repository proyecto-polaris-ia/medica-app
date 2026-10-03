import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, dynamic } from './route';
import { UnauthorizedError } from '@/lib/supabase/auth';

vi.mock('@/lib/supabase/auth', () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class extends Error {
    constructor() {
      super('Unauthorized');
      this.name = 'UnauthorizedError';
    }
  },
}));

vi.mock('@/lib/admin/follow-up/follow-up', () => ({
  listDailyFollowUpCases: vi.fn(),
  currentRoundDate: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import {
  currentRoundDate,
  listDailyFollowUpCases,
} from '@/lib/admin/follow-up/follow-up';

const USER = { id: '990e8400-e29b-41d4-a716-446655440000', email: 'a@b.c' };
const ROUND_DATE = '2026-10-03';
const CASE = {
  patientId: '550e8400-e29b-41d4-a716-446655440000',
  patientName: 'María García',
  patientPhoneE164: '+5215512345678',
  reason: 'no_show' as const,
  reasonLabel: 'Cita no atendida',
  reasonDate: '2026-09-01T18:00:00.000Z',
  roundDate: ROUND_DATE,
  sourceAppointmentId: '550e8400-e29b-41d4-a716-446655440010',
  sourcePlanId: null,
};

describe('/api/admin/follow-up', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
    (currentRoundDate as ReturnType<typeof vi.fn>).mockReturnValue(ROUND_DATE);
    (listDailyFollowUpCases as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it('is force-dynamic', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('GET returns 401 without session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );
    const res = await GET(new Request('http://localhost/api/admin/follow-up'));
    expect(res.status).toBe(401);
  });

  it('GET returns the cases and the round date', async () => {
    (listDailyFollowUpCases as ReturnType<typeof vi.fn>).mockResolvedValue([
      CASE,
    ]);
    const res = await GET(new Request('http://localhost/api/admin/follow-up'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.cases).toHaveLength(1);
    expect(body.cases[0].patientName).toBe('María García');
    expect(body.roundDate).toBe(ROUND_DATE);
  });

  it('GET computes now on the server and ignores a client-supplied date', async () => {
    await GET(
      new Request('http://localhost/api/admin/follow-up?date=1999-01-01')
    );
    expect(listDailyFollowUpCases).toHaveBeenCalledWith({
      now: expect.any(Date),
    });
    expect(currentRoundDate).toHaveBeenCalledWith(expect.any(Date));
  });
});
