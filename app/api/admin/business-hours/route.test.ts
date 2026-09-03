import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../business-hours/route';
import { UnauthorizedError } from '@/lib/supabase/auth';
import { ValidationError } from '@/lib/admin/validate';
import { ConflictError } from '@/lib/admin/errors';

vi.mock('@/lib/supabase/auth', () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class extends Error {
    constructor() {
      super('Unauthorized');
      this.name = 'UnauthorizedError';
    }
  },
}));

vi.mock('@/lib/admin/business-hours', () => ({
  listBusinessHours: vi.fn(),
  createBusinessHour: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import {
  createBusinessHour,
  listBusinessHours,
} from '@/lib/admin/business-hours';

const USER = { id: 'user-1', email: 'a@b.c' };
const PROVIDER_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('/api/admin/business-hours', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('GET returns 401 without session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );
    const res = await GET(
      new Request('http://localhost/api/admin/business-hours')
    );
    expect(res.status).toBe(401);
  });

  it('GET lists business hours', async () => {
    (listBusinessHours as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'bh-1', providerId: PROVIDER_ID, dayOfWeek: 1 },
    ]);
    const res = await GET(
      new Request('http://localhost/api/admin/business-hours')
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.businessHours).toHaveLength(1);
  });

  it('POST creates a business hour', async () => {
    (createBusinessHour as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'bh-1',
      providerId: PROVIDER_ID,
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '17:00',
    });
    const res = await POST(
      new Request('http://localhost/api/admin/business-hours', {
        method: 'POST',
        body: JSON.stringify({
          providerId: PROVIDER_ID,
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '17:00',
        }),
      })
    );
    expect(res.status).toBe(201);
  });

  it('POST returns 400 for invalid input', async () => {
    (createBusinessHour as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ValidationError('endTime', 'Invalid endTime')
    );
    const res = await POST(
      new Request('http://localhost/api/admin/business-hours', {
        method: 'POST',
        body: JSON.stringify({
          providerId: PROVIDER_ID,
          dayOfWeek: 1,
          startTime: '17:00',
          endTime: '09:00',
        }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('POST returns 409 on conflict', async () => {
    (createBusinessHour as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ConflictError('Business hour conflict')
    );
    const res = await POST(
      new Request('http://localhost/api/admin/business-hours', {
        method: 'POST',
        body: JSON.stringify({
          providerId: PROVIDER_ID,
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '17:00',
        }),
      })
    );
    expect(res.status).toBe(409);
  });
});
