import { requireUser } from '../../_lib/auth';
import {
  deleteBusinessHour,
  updateBusinessHour,
} from '@/lib/admin/business-hours';
import { handleAdminRequest, parseJsonBody } from '../../_lib/responses';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(request);
    const businessHour = await updateBusinessHour(id, {
      providerId: body.providerId as string,
      dayOfWeek: body.dayOfWeek as number,
      startTime: body.startTime as string,
      endTime: body.endTime as string,
    });
    return Response.json({ businessHour });
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { id } = await params;
    await deleteBusinessHour(id);
    return new Response(null, { status: 204 });
  });
}
