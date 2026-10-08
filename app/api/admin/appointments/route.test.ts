import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { GET, POST } from '../appointments/route';
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

vi.mock('@/lib/admin/appointments', () => ({
  listAppointmentsPaged: vi.fn(),
  listAppointmentsRange: vi.fn(),
  createAppointment: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import {
  createAppointment,
  listAppointmentsPaged,
  listAppointmentsRange,
} from '@/lib/admin/appointments';

const USER = { id: 'user-1', email: 'a@b.c' };
const SERVICE_ID = '550e8400-e29b-41d4-a716-446655440000';
const PROVIDER_ID = '550e8400-e29b-41d4-a716-446655440001';
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440002';

const ROW = { id: 'appt-1', serviceId: SERVICE_ID, providerId: PROVIDER_ID };

function mockPaged(rows: unknown[] = [ROW], total = rows.length) {
  (listAppointmentsPaged as Mock).mockResolvedValue({
    appointments: rows,
    total,
  });
}

function get(query = '') {
  return GET(new Request(`http://localhost/api/admin/appointments${query}`));
}

describe('/api/admin/appointments', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as Mock).mockResolvedValue(USER);
  });

  it('GET returns 401 without session', async () => {
    (requireUser as Mock).mockRejectedValue(new UnauthorizedError());
    const res = await get();
    expect(res.status).toBe(401);
  });

  describe('modo lista', () => {
    it('GET applies the default page, pageSize and order', async () => {
      mockPaged([ROW], 45);

      const res = await get();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(listAppointmentsPaged).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 20,
          sort: 'start_at',
          sortDir: 'desc',
        })
      );
      expect(body.appointments).toHaveLength(1);
      expect(body.pagination).toEqual({
        total: 45,
        page: 1,
        pageSize: 20,
        totalPages: 3,
      });
      expect(listAppointmentsRange).not.toHaveBeenCalled();
    });

    it('GET forwards page, pageSize, filters and order to the paged query', async () => {
      mockPaged([ROW], 7);

      const res = await get(
        `?page=2&pageSize=10&serviceId=${SERVICE_ID}&patientId=${PATIENT_ID}` +
          `&providerId=${PROVIDER_ID}&sort=created_at&sortDir=asc`
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(listAppointmentsPaged).toHaveBeenCalledWith({
        page: 2,
        pageSize: 10,
        serviceId: SERVICE_ID,
        patientId: PATIENT_ID,
        providerId: PROVIDER_ID,
        startAtIso: undefined,
        endAtIso: undefined,
        sort: 'created_at',
        sortDir: 'asc',
      });
      expect(body.pagination).toEqual({
        total: 7,
        page: 2,
        pageSize: 10,
        totalPages: 1,
      });
    });

    it('GET forwards an optional date range in list mode', async () => {
      mockPaged([ROW], 3);

      const res = await get(
        '?page=1&start=2026-06-01T06:00:00.000Z&end=2026-07-01T06:00:00.000Z'
      );

      expect(res.status).toBe(200);
      expect(listAppointmentsPaged).toHaveBeenCalledWith(
        expect.objectContaining({
          startAtIso: '2026-06-01T06:00:00.000Z',
          endAtIso: '2026-07-01T06:00:00.000Z',
        })
      );
    });

    it('GET computes totalPages as 0 when the filtered set is empty', async () => {
      mockPaged([], 0);

      const res = await get('?page=1&pageSize=20');
      const body = await res.json();

      expect(body.appointments).toEqual([]);
      expect(body.pagination).toEqual({
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      });
    });

    it('GET returns an empty page with intact metadata when beyond the total', async () => {
      mockPaged([], 5);

      const res = await get('?page=9&pageSize=20');
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.appointments).toEqual([]);
      expect(body.pagination).toEqual({
        total: 5,
        page: 9,
        pageSize: 20,
        totalPages: 1,
      });
    });

    it('GET accepts sortBy as an alias of sort', async () => {
      mockPaged([ROW], 1);

      const res = await get('?page=1&sortBy=provider&sortDir=asc');

      expect(res.status).toBe(200);
      expect(listAppointmentsPaged).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'provider', sortDir: 'asc' })
      );
    });

    it('GET includes reminders per appointment in the payload', async () => {
      mockPaged(
        [
          {
            ...ROW,
            reminders: [
              {
                cadence: 'h24',
                status: 'sent',
                sentAt: '2026-10-01T15:15:00.000Z',
                dryRun: false,
                createdAt: '2026-10-01T15:15:00.000Z',
              },
            ],
          },
          { id: 'appt-2', serviceId: SERVICE_ID, providerId: PROVIDER_ID, reminders: [] },
        ],
        2
      );

      const res = await get('?page=1&pageSize=20');
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.appointments[0].reminders).toHaveLength(1);
      expect(body.appointments[0].reminders[0]).toMatchObject({
        cadence: 'h24',
        status: 'sent',
        sentAt: '2026-10-01T15:15:00.000Z',
      });
      expect(body.appointments[1].reminders).toEqual([]);
    });

    it('GET returns 400 when the list-mode range is invalid', async () => {
      (listAppointmentsPaged as Mock).mockRejectedValue(
        new ValidationError('end', 'end must be after start')
      );

      const res = await get(
        '?page=1&start=2026-06-10T06:00:00.000Z&end=2026-06-09T06:00:00.000Z'
      );
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe('invalid_request');
      expect(body).not.toHaveProperty('appointments');
    });
  });

  describe('validación de parámetros', () => {
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
      ['sort fuera del whitelist', '?sort=patient_name'],
      ['sortDir fuera del dominio', '?sortDir=up'],
      ['sortBy fuera del whitelist', '?sortBy=patient_name'],
    ];

    it.each(invalidQueries)('GET returns 400 for %s', async (_label, query) => {
      const res = await get(query);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe('invalid_request');
      expect(body).not.toHaveProperty('appointments');
      expect(body).not.toHaveProperty('pagination');
      expect(listAppointmentsPaged).not.toHaveBeenCalled();
    });

    it('GET returns 400 when only start is present in list mode', async () => {
      const res = await get('?start=2026-06-01T06:00:00.000Z');
      expect(res.status).toBe(400);
      expect(listAppointmentsPaged).not.toHaveBeenCalled();
    });

    it('GET returns 400 when only end is present in list mode', async () => {
      const res = await get('?page=1&end=2026-07-01T06:00:00.000Z');
      expect(res.status).toBe(400);
      expect(listAppointmentsPaged).not.toHaveBeenCalled();
    });

    it('GET accepts the pageSize upper boundary of 100', async () => {
      mockPaged([ROW], 1);
      const res = await get('?page=1&pageSize=100');
      expect(res.status).toBe(200);
      expect(listAppointmentsPaged).toHaveBeenCalledWith(
        expect.objectContaining({ pageSize: 100 })
      );
    });
  });

  describe('modo calendario', () => {
    it('GET lists every appointment in range when start and end are provided', async () => {
      const rows = Array.from({ length: 25 }, (_value, index) => ({
        id: `appt-${index}`,
        serviceId: SERVICE_ID,
        providerId: PROVIDER_ID,
      }));
      (listAppointmentsRange as Mock).mockResolvedValue(rows);

      const res = await get(
        '?start=2026-06-01T06:00:00.000Z&end=2026-07-01T06:00:00.000Z'
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.appointments).toHaveLength(25);
      expect(body).not.toHaveProperty('pagination');
      expect(listAppointmentsRange).toHaveBeenCalledWith(
        '2026-06-01T06:00:00.000Z',
        '2026-07-01T06:00:00.000Z'
      );
      expect(listAppointmentsPaged).not.toHaveBeenCalled();
    });

    it('GET returns 400 for an invalid range', async () => {
      (listAppointmentsRange as Mock).mockRejectedValue(
        new ValidationError('end', 'end must be after start')
      );
      const res = await get(
        '?start=2026-06-10T06:00:00.000Z&end=2026-06-09T06:00:00.000Z'
      );
      expect(res.status).toBe(400);
    });
  });

  it('POST creates an appointment', async () => {
    (createAppointment as Mock).mockResolvedValue({
      id: 'appt-1',
      serviceId: SERVICE_ID,
      providerId: PROVIDER_ID,
      startAt: '2026-09-10T14:00:00.000Z',
      endAt: '2026-09-10T14:30:00.000Z',
      status: 'requested',
      notes: null,
    });
    const res = await POST(
      new Request('http://localhost/api/admin/appointments', {
        method: 'POST',
        body: JSON.stringify({
          serviceId: SERVICE_ID,
          providerId: PROVIDER_ID,
          startAt: '2026-09-10T14:00:00.000Z',
          endAt: '2026-09-10T14:30:00.000Z',
        }),
      })
    );
    expect(res.status).toBe(201);
  });

  it('POST forwards notes to createAppointment', async () => {
    (createAppointment as Mock).mockResolvedValue({
      id: 'appt-1',
      serviceId: SERVICE_ID,
      providerId: PROVIDER_ID,
      startAt: '2026-09-10T14:00:00.000Z',
      endAt: '2026-09-10T14:30:00.000Z',
      status: 'requested',
      notes: 'Traer estudios previos',
    });

    await POST(
      new Request('http://localhost/api/admin/appointments', {
        method: 'POST',
        body: JSON.stringify({
          serviceId: SERVICE_ID,
          providerId: PROVIDER_ID,
          startAt: '2026-09-10T14:00:00.000Z',
          endAt: '2026-09-10T14:30:00.000Z',
          notes: 'Traer estudios previos',
        }),
      })
    );

    expect(createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ notes: 'Traer estudios previos' })
    );
  });

  it('POST returns 400 for invalid input', async () => {
    (createAppointment as Mock).mockRejectedValue(
      new ValidationError('endAt', 'Invalid endAt')
    );
    const res = await POST(
      new Request('http://localhost/api/admin/appointments', {
        method: 'POST',
        body: JSON.stringify({
          serviceId: SERVICE_ID,
          providerId: PROVIDER_ID,
          startAt: '2026-09-10T14:30:00.000Z',
          endAt: '2026-09-10T14:00:00.000Z',
        }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('POST returns 409 on overlap conflict', async () => {
    (createAppointment as Mock).mockRejectedValue(
      new ConflictError('Time slot overlaps with an existing appointment')
    );
    const res = await POST(
      new Request('http://localhost/api/admin/appointments', {
        method: 'POST',
        body: JSON.stringify({
          serviceId: SERVICE_ID,
          providerId: PROVIDER_ID,
          startAt: '2026-09-10T14:00:00.000Z',
          endAt: '2026-09-10T14:30:00.000Z',
        }),
      })
    );
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.code).toBe('conflict');
  });
});
