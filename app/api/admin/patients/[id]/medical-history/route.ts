import { requireUser } from '../../../_lib/auth';
import {
  getMedicalHistory,
  upsertMedicalHistory,
} from '@/lib/admin/medical-history';
import { handleAdminRequest, parseJsonBody } from '../../../_lib/responses';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { id } = await context.params;
    const medicalHistory = await getMedicalHistory(id);
    return Response.json({ medicalHistory });
  });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { id } = await context.params;
    const body = await parseJsonBody(request);
    const medicalHistory = await upsertMedicalHistory(id, {
      allergies: body.allergies as string[] | undefined,
      systemicConditions: body.systemicConditions as string[] | undefined,
      medications: body.medications as string[] | undefined,
      pregnancyStatus: body.pregnancyStatus as
        | 'not_applicable'
        | 'no'
        | 'yes'
        | null
        | undefined,
      coagulationDisorders: body.coagulationDisorders as string | undefined,
      anticoagulants: body.anticoagulants as string | undefined,
      surgeries: body.surgeries as string | undefined,
      infectiousDiseases: body.infectiousDiseases as string | undefined,
      smoking: body.smoking as 'never' | 'former' | 'current' | undefined,
      alcohol: body.alcohol as 'never' | 'occasional' | 'frequent' | undefined,
      dentalHistory: body.dentalHistory as string | undefined,
      oralHabits: body.oralHabits as string[] | undefined,
      clinicalNotes: body.clinicalNotes as string | undefined,
    });
    return Response.json({ medicalHistory });
  });
}
