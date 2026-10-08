import { requireUser } from '../_lib/auth';
import {
  createAppointment,
  listAppointmentsPaged,
  listAppointmentsRange,
} from '@/lib/admin/appointments';
import {
  APPOINTMENT_SORT_COLUMNS,
  APPOINTMENT_SORT_DIRECTIONS,
  type AppointmentSortColumn,
  type AppointmentSortDirection,
  type AppointmentStatus,
} from '@/lib/admin/types';
import { ValidationError } from '@/lib/admin/validate';
import { parseJsonBody, handleAdminRequest } from '../_lib/responses';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** Entero positivo simple (sin signos, decimales ni notación científica). */
function parsePositiveIntegerParam(
  raw: string,
  field: string,
  min: number,
  max: number
): number {
  if (!/^\d+$/.test(raw)) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  return value;
}

function parsePageParam(raw: string | null): number {
  if (raw === null) return DEFAULT_PAGE;
  return parsePositiveIntegerParam(raw, 'page', 1, Number.MAX_SAFE_INTEGER);
}

function parsePageSizeParam(raw: string | null): number {
  if (raw === null) return DEFAULT_PAGE_SIZE;
  return parsePositiveIntegerParam(raw, 'pageSize', 1, MAX_PAGE_SIZE);
}

function parseSortParam(raw: string | null): AppointmentSortColumn {
  if (raw === null || raw === '') return 'start_at';
  if (!(APPOINTMENT_SORT_COLUMNS as readonly string[]).includes(raw)) {
    throw new ValidationError('sort', 'Invalid sort');
  }
  return raw as AppointmentSortColumn;
}

function parseSortDirParam(raw: string | null): AppointmentSortDirection {
  if (raw === null || raw === '') return 'desc';
  if (!(APPOINTMENT_SORT_DIRECTIONS as readonly string[]).includes(raw)) {
    throw new ValidationError('sortDir', 'Invalid sortDir');
  }
  return raw as AppointmentSortDirection;
}

export async function GET(request: Request): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    const page = searchParams.get('page');
    const pageSize = searchParams.get('pageSize');
    const hasPagination = page !== null || pageSize !== null;

    // Modo calendario (contrato intacto): `start` + `end` sin paginación.
    if (!hasPagination && start !== null && end !== null) {
      const appointments = await listAppointmentsRange(start, end);
      return Response.json({ appointments });
    }

    // Modo lista: filtros + orden + paginación con metadatos.
    const parsedPage = parsePageParam(page);
    const parsedPageSize = parsePageSizeParam(pageSize);
    // `sort` es el parámetro del delta spec; `sortBy` se acepta como alias.
    const parsedSort = parseSortParam(
      searchParams.get('sort') ?? searchParams.get('sortBy')
    );
    const parsedSortDir = parseSortDirParam(searchParams.get('sortDir'));

    if ((start === null) !== (end === null)) {
      throw new ValidationError(
        'start',
        'start and end must be provided together'
      );
    }

    const result = await listAppointmentsPaged({
      page: parsedPage,
      pageSize: parsedPageSize,
      serviceId: searchParams.get('serviceId') ?? undefined,
      patientId: searchParams.get('patientId') ?? undefined,
      providerId: searchParams.get('providerId') ?? undefined,
      startAtIso: start ?? undefined,
      endAtIso: end ?? undefined,
      sort: parsedSort,
      sortDir: parsedSortDir,
    });

    const totalPages = Math.ceil(result.total / parsedPageSize);

    return Response.json({
      appointments: result.appointments,
      pagination: {
        total: result.total,
        page: parsedPage,
        pageSize: parsedPageSize,
        totalPages,
      },
    });
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const body = await parseJsonBody(request);
    const appointment = await createAppointment({
      patientId: body.patientId as string | null | undefined,
      serviceId: body.serviceId as string,
      providerId: body.providerId as string,
      startAt: body.startAt as string,
      endAt: body.endAt as string,
      status: body.status as AppointmentStatus | undefined,
      notes: body.notes as string | null | undefined,
    });
    return Response.json({ appointment }, { status: 201 });
  });
}
