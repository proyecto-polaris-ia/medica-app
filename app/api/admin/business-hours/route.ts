import { requireUser } from '../_lib/auth';
import {
  createBusinessHour,
  listBusinessHoursPage,
} from '@/lib/admin/business-hours';
import { parseUuid, ValidationError } from '@/lib/admin/validate';
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

/** `providerId` ausente o vacío equivale a "sin filtro". */
function parseProviderIdParam(raw: string | null): string | undefined {
  if (raw === null || raw === '') return undefined;
  return parseUuid(raw, 'providerId');
}

export async function GET(request: Request): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { searchParams } = new URL(request.url);
    const page = parsePageParam(searchParams.get('page'));
    const pageSize = parsePageSizeParam(searchParams.get('pageSize'));
    const providerId = parseProviderIdParam(searchParams.get('providerId'));

    const result = await listBusinessHoursPage({ page, pageSize, providerId });

    const totalPages = Math.ceil(result.total / pageSize);

    return Response.json({
      businessHours: result.businessHours,
      pagination: {
        total: result.total,
        page,
        pageSize,
        totalPages,
      },
    });
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const body = await parseJsonBody(request);
    const businessHour = await createBusinessHour({
      providerId: body.providerId as string,
      dayOfWeek: body.dayOfWeek as number,
      startTime: body.startTime as string,
      endTime: body.endTime as string,
    });
    return Response.json({ businessHour }, { status: 201 });
  });
}
