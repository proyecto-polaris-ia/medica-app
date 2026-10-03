import { requireUser } from '../../../../_lib/auth';
import {
  deletePatientFile,
  getPatientFileDownloadUrl,
} from '@/lib/admin/patient-files';
import { handleAdminRequest } from '../../../../_lib/responses';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; fileId: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { id, fileId } = await context.params;
    const result = await getPatientFileDownloadUrl(id, fileId);
    return Response.json(result);
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; fileId: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { id, fileId } = await context.params;
    await deletePatientFile(id, fileId);
    return Response.json({ ok: true });
  });
}
