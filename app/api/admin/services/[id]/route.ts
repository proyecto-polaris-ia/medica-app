import { requireUser } from '../../_lib/auth';
import { deleteService, updateService } from '@/lib/admin/services';
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
    const service = await updateService(id, {
      name: body.name as string,
      durationMinutes: body.durationMinutes as number,
    });
    return Response.json({ service });
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { id } = await params;
    await deleteService(id);
    return new Response(null, { status: 204 });
  });
}
