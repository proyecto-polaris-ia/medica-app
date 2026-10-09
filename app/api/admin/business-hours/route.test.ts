import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
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
  listBusinessHoursPage: vi.fn(),
  createBusinessHour: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import {
  createBusinessHour,
  listBusinessHoursPage,
} from '@/lib/admin/business-hours';

const USER = { id: 'user-1', email: 'a@b.c' };
const PROVIDER_ID = '550e8400-e29b-41d4-a716-446655440000';

const ROW = {
  id: 'bh-1',
  providerId: PROVIDER_ID,
  dayOfWeek: 1,
  startTime: '09:00:00',
  endTime: '17:00:00',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function mockPaged(rows: unknown[] = [ROW], total = rows.length) {
  (listBusinessHoursPage as Mock).mockResolvedValue({
    businessHours: rows,
    total,
  });
}

function get(query = '') {
  return GET(new Request(`http://localhost/api/admin/business-hours${query}`));
}

describe('/api/admin/business-hours', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as Mock).mockResolvedValue(USER);
  });

  it('GET returns 401 without session', async () => {
    (requireUser as Mock).mockRejectedValue(new UnauthorizedError());
    const res = await get();
    expect(res.status).toBe(401);
    expect(listBusinessHoursPage).not.toHaveBeenCalled();
  });

  describe('GET paginado', () => {
    it('GET applies the default page and pageSize and returns metadata (3.2)', async () => {
      mockPaged([ROW], 1);

      const res = await get();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(listBusinessHoursPage).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        providerId: undefined,
      });
      expect(body.pagination).toEqual({
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
    });

    it('GET forwards page and pageSize and computes totalPages (3.1)', async () => {
      mockPaged([ROW], 45);

      const res = await get('?page=2&pageSize=20');
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(listBusinessHoursPage).toHaveBeenCalledWith({
        page: 2,
        pageSize: 20,
        providerId: undefined,
      });
      expect(body.pagination).toEqual({
        total: 45,
        page: 2,
        pageSize: 20,
        totalPages: 3,
      });
    });

    it('GET preserves the businessHours shape and fields (3.3)', async () => {
      mockPaged([ROW], 1);

      const res = await get();
      const body = await res.json();

      expect(body.businessHours).toEqual([ROW]);
    });

    it('GET returns an empty page with intact metadata beyond the total', async () => {
      mockPaged([], 5);

      const res = await get('?page=9&pageSize=20');
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.businessHours).toEqual([]);
      expect(body.pagination).toEqual({
        total: 5,
        page: 9,
        pageSize: 20,
        totalPages: 1,
      });
    });

    it('GET computes totalPages as 0 when the filtered set is empty', async () => {
      mockPaged([], 0);

      const res = await get('?page=1&pageSize=20');
      const body = await res.json();

      expect(body.pagination).toEqual({
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      });
    });

    it('GET accepts the pageSize upper boundary of 100', async () => {
      mockPaged([ROW], 1);

      const res = await get('?page=1&pageSize=100');

      expect(res.status).toBe(200);
      expect(listBusinessHoursPage).toHaveBeenCalledWith(
        expect.objectContaining({ pageSize: 100 })
      );
    });
  });

  describe('GET filtro por proveedor', () => {
    it('GET forwards a valid providerId to the paged query (3.5)', async () => {
      mockPaged([ROW], 7);

      const res = await get(`?page=1&providerId=${PROVIDER_ID}`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(listBusinessHoursPage).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        providerId: PROVIDER_ID,
      });
      expect(body.pagination.total).toBe(7);
    });

    it('GET treats an empty providerId as no filter (3.5)', async () => {
      mockPaged([ROW], 1);

      const res = await get('?page=1&providerId=');

      expect(res.status).toBe(200);
      expect(listBusinessHoursPage).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        providerId: undefined,
      });
    });

    it('GET returns 400 for a malformed providerId (3.4)', async () => {
      const res = await get('?providerId=no-es-un-uuid');
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe('invalid_request');
      expect(body).not.toHaveProperty('businessHours');
      expect(body).not.toHaveProperty('pagination');
      expect(listBusinessHoursPage).not.toHaveBeenCalled();
    });

    it('GET normaliza a minúsculas un providerId UUID válido (triangulación)', async () => {
      mockPaged([ROW], 1);

      const res = await get(
        `?page=1&providerId=${PROVIDER_ID.toUpperCase()}`
      );

      expect(res.status).toBe(200);
      expect(listBusinessHoursPage).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        providerId: PROVIDER_ID,
      });
    });
  });

  describe('GET validación de parámetros (3.4)', () => {
    const invalidQueries: Array<[string, string]> = [
      ['page no entero', '?page=abc'],
      ['page menor que 1', '?page=0'],
      ['page negativo', '?page=-1'],
      ['page decimal', '?page=1.5'],
      ['page vacío', '?page='],
      ['pageSize no entero', '?pageSize=abc'],
      ['pageSize menor que 1', '?pageSize=0'],
      ['pageSize mayor a 100', '?pageSize=101'],
      ['pageSize decimal', '?pageSize=20.5'],
    ];

    it.each(invalidQueries)('GET returns 400 for %s', async (_label, query) => {
      const res = await get(query);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe('invalid_request');
      expect(body).not.toHaveProperty('businessHours');
      expect(body).not.toHaveProperty('pagination');
      expect(listBusinessHoursPage).not.toHaveBeenCalled();
    });
  });

  it('POST creates a business hour', async () => {
    (createBusinessHour as Mock).mockResolvedValue({
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
    (createBusinessHour as Mock).mockRejectedValue(
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
    (createBusinessHour as Mock).mockRejectedValue(
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
