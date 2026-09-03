import { requireUser } from '../_lib/auth';
import { createPatient, listPatients } from '@/lib/admin/patients';
import { parseJsonBody, handleAdminRequest } from '../_lib/responses';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const patients = await listPatients();
    return Response.json({ patients });
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const body = await parseJsonBody(request);
    const patient = await createPatient({
      fullName: body.fullName as string,
      phoneE164: body.phoneE164 as string,
      notes: body.notes as string | null | undefined,
    });
    return Response.json({ patient }, { status: 201 });
  });
}
