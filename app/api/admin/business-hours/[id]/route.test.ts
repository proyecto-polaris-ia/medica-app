import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, PATCH } from './route';
import { UnauthorizedError } from '@/lib/supabase/auth';
import { NotFoundError } from '@/lib/admin/errors';

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
  updateBusinessHour: vi.fn(),
  deleteBusinessHour: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import {
  deleteBusinessHour,
  updateBusinessHour,
} from '@/lib/admin/business-hours';

const USER = { id: 'user-1', email: 'a@b.c' };
const HOUR_ID = '550e8400-e29b-41d4-a716-446655440000';
const PROVIDER_ID = '550e8400-e29b-41d4-a716-446655440001';

describe('/api/admin/business-hours/[id]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('PATCH returns 401 without session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );
    const res = await PATCH(
      new Request(`http://localhost/api/admin/business-hours/${HOUR_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({
          providerId: PROVIDER_ID,
          dayOfWeek: 2,
          startTime: '10:00',
          endTime: '18:00',
        }),
      }),
      { params: Promise.resolve({ id: HOUR_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it('PATCH updates a business hour', async () => {
    (updateBusinessHour as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: HOUR_ID,
      providerId: PROVIDER_ID,
      dayOfWeek: 2,
      startTime: '10:00',
      endTime: '18:00',
    });
    const res = await PATCH(
      new Request(`http://localhost/api/admin/business-hours/${HOUR_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({
          providerId: PROVIDER_ID,
          dayOfWeek: 2,
          startTime: '10:00',
          endTime: '18:00',
        }),
      }),
      { params: Promise.resolve({ id: HOUR_ID }) }
    );
    expect(res.status).toBe(200);
  });

  it('PATCH returns 404 when not found', async () => {
    (updateBusinessHour as ReturnType<typeof vi.fn>).mockRejectedValue(
      new NotFoundError('Business hour')
    );
    const res = await PATCH(
      new Request(`http://localhost/api/admin/business-hours/${HOUR_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({
          providerId: PROVIDER_ID,
          dayOfWeek: 2,
          startTime: '10:00',
          endTime: '18:00',
        }),
      }),
      { params: Promise.resolve({ id: HOUR_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it('DELETE removes a business hour', async () => {
    (deleteBusinessHour as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const res = await DELETE(
      new Request(`http://localhost/api/admin/business-hours/${HOUR_ID}`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: HOUR_ID }) }
    );
    expect(res.status).toBe(204);
  });
});
