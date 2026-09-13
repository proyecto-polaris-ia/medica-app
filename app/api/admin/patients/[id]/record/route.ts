import { requireUser } from '../../../_lib/auth';
import { getPatientRecord } from '@/lib/admin/patient-record';
import { handleAdminRequest } from '../../../_lib/responses';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { id } = await context.params;
    const record = await getPatientRecord(id);
    return Response.json({ record });
  });
}
