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
      phoneE164: body.phoneE164 as string | null | undefined,
      email: body.email as string | null | undefined,
      notes: body.notes as string | null | undefined,
      birthDate: body.birthDate as string | null | undefined,
      sex: body.sex as 'male' | 'female' | 'other' | null | undefined,
      address: body.address as string | null | undefined,
      occupation: body.occupation as string | null | undefined,
      referralSource: body.referralSource as string | null | undefined,
      secondaryPhone: body.secondaryPhone as string | null | undefined,
      emergencyContactName: body.emergencyContactName as string | null | undefined,
      emergencyContactPhone: body.emergencyContactPhone as string | null | undefined,
      emergencyContactRelationship: body.emergencyContactRelationship as string | null | undefined,
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
