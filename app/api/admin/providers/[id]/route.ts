import { requireUser } from '../../_lib/auth';
import { deleteProvider, updateProvider } from '@/lib/admin/providers';
import { getProviderSnapshot } from '@/lib/admin/provider-snapshot';
import { handleAdminRequest, parseJsonBody } from '../../_lib/responses';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { id } = await params;
    const snapshot = await getProviderSnapshot(id, new Date());
    return Response.json(snapshot);
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(request);
    const provider = await updateProvider(id, {
      name: body.name as string,
    });
    return Response.json({ provider });
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { id } = await params;
    await deleteProvider(id);
    return new Response(null, { status: 204 });
  });
}
