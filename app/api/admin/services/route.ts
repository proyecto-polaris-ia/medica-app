import { requireUser } from '../_lib/auth';
import { createService, listServices } from '@/lib/admin/services';
import { parseJsonBody, handleAdminRequest } from '../_lib/responses';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const services = await listServices();
    return Response.json({ services });
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const body = await parseJsonBody(request);
    const service = await createService({
      name: body.name as string,
      durationMinutes: body.durationMinutes as number,
    });
    return Response.json({ service }, { status: 201 });
  });
}
