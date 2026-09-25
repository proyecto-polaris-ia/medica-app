import { requireUser } from '../../../_lib/auth';
import {
  createClinicalVisit,
  listClinicalVisits,
} from '@/lib/admin/clinical-visits';
import { handleAdminRequest, parseJsonBody } from '../../../_lib/responses';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { id } = await context.params;
    const clinicalVisits = await listClinicalVisits(id);
    return Response.json({ clinicalVisits });
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { id } = await context.params;
    const body = await parseJsonBody(request);
    const clinicalVisit = await createClinicalVisit(id, {
      appointmentId: body.appointmentId as string | null | undefined,
      providerId: body.providerId as string | null | undefined,
      subjective: body.subjective as string,
      objective: body.objective as string | null | undefined,
      assessment: body.assessment as string | null | undefined,
      plan: body.plan as string | null | undefined,
      treatment: body.treatment as string | null | undefined,
      notes: body.notes as string | null | undefined,
    });
    return Response.json({ clinicalVisit }, { status: 201 });
  });
}
