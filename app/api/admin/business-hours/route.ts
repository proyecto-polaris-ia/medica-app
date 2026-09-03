import { requireUser } from '../_lib/auth';
import {
  createBusinessHour,
  listBusinessHours,
} from '@/lib/admin/business-hours';
import { parseJsonBody, handleAdminRequest } from '../_lib/responses';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const businessHours = await listBusinessHours();
    return Response.json({ businessHours });
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
