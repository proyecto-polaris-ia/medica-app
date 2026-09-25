import { requireUser } from '../../../../_lib/auth';
import {
  deleteClinicalVisit,
  getClinicalVisit,
  updateClinicalVisit,
} from '@/lib/admin/clinical-visits';
import { handleAdminRequest, parseJsonBody } from '../../../../_lib/responses';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; visitId: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { id, visitId } = await context.params;
    const clinicalVisit = await getClinicalVisit(id, visitId);
    return Response.json({ clinicalVisit });
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; visitId: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { id, visitId } = await context.params;
    const body = await parseJsonBody(request);
    const clinicalVisit = await updateClinicalVisit(id, visitId, {
      appointmentId: body.appointmentId as string | null | undefined,
      providerId: body.providerId as string | null | undefined,
      subjective: body.subjective as string | undefined,
      objective: body.objective as string | null | undefined,
      assessment: body.assessment as string | null | undefined,
      plan: body.plan as string | null | undefined,
      treatment: body.treatment as string | null | undefined,
      notes: body.notes as string | null | undefined,
    });
    return Response.json({ clinicalVisit });
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; visitId: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { id, visitId } = await context.params;
    await deleteClinicalVisit(id, visitId);
    return new Response(null, { status: 204 });
  });
}
