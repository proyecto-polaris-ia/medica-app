import { requireUser } from '../_lib/auth';
import { createProvider, listProviders } from '@/lib/admin/providers';
import { parseJsonBody, handleAdminRequest } from '../_lib/responses';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const providers = await listProviders();
    return Response.json({ providers });
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const body = await parseJsonBody(request);
    const provider = await createProvider({
      name: body.name as string,
    });
    return Response.json({ provider }, { status: 201 });
  });
}
