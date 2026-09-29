import { requireUser } from '../../../../_lib/auth';
import {
  deleteTreatmentPlan,
  getTreatmentPlan,
  updateTreatmentPlan,
} from '@/lib/admin/treatment-plans';
import { handleAdminRequest, parseJsonBody } from '../../../../_lib/responses';
import {
  parseNonEmptyString,
  parseNotes,
  parseTreatmentPlanStatus,
  parseUuid,
} from '@/lib/admin/validate';
import type { TreatmentPlanUpdateInput } from '@/lib/admin/types';

export const dynamic = 'force-dynamic';

function parseUpdateBody(body: Record<string, unknown>): TreatmentPlanUpdateInput {
  const input: TreatmentPlanUpdateInput = {};

  if (body.providerId !== undefined) {
    input.providerId = parseUuid(body.providerId, 'providerId');
  }
  if (body.name !== undefined) {
    input.name = parseNonEmptyString(body.name, 'name');
  }
  if (body.notes !== undefined) {
    input.notes = parseNotes(body.notes, 'notes');
  }
  if (body.clinicalVisitId !== undefined) {
    input.clinicalVisitId =
      body.clinicalVisitId === null
        ? null
        : parseUuid(body.clinicalVisitId as string, 'clinicalVisitId');
  }
  if (body.status !== undefined) {
    input.status = parseTreatmentPlanStatus(body.status, 'status');
  }

  return input;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; planId: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { planId } = await context.params;
    const treatmentPlan = await getTreatmentPlan(planId);
    return Response.json({ treatmentPlan });
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; planId: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { planId } = await context.params;
    const body = await parseJsonBody(request);
    const input = parseUpdateBody(body);
    const treatmentPlan = await updateTreatmentPlan(planId, input);
    return Response.json({ treatmentPlan });
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; planId: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { planId } = await context.params;
    await deleteTreatmentPlan(planId);
    return new Response(null, { status: 204 });
  });
}
