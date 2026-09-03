import { requireUser } from '../../_lib/auth';
import { deletePatient, updatePatient } from '@/lib/admin/patients';
import { handleAdminRequest, parseJsonBody } from '../../_lib/responses';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { id } = await context.params;
    const body = await parseJsonBody(request);
    const patient = await updatePatient(id, {
      fullName: body.fullName as string,
      phoneE164: body.phoneE164 as string,
      notes: body.notes as string | null | undefined,
    });
    return Response.json({ patient });
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { id } = await context.params;
    await deletePatient(id);
    return new Response(null, { status: 204 });
  });
}
