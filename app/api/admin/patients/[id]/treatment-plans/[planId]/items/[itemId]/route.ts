import { requireUser } from '../../../../../../_lib/auth';
import {
  deleteTreatmentPlanItem,
  updateTreatmentPlanItem,
} from '@/lib/admin/treatment-plans';
import { handleAdminRequest, parseJsonBody } from '../../../../../../_lib/responses';
import {
  parseFdiTooth,
  parseMoney,
  parseNonEmptyString,
  parseQuantity,
  parseTreatmentPlanItemStatus,
  parseUuid,
} from '@/lib/admin/validate';
import type { TreatmentPlanItemUpdateInput } from '@/lib/admin/types';

export const dynamic = 'force-dynamic';

function parseUpdateItemBody(
  body: Record<string, unknown>
): TreatmentPlanItemUpdateInput {
  const input: TreatmentPlanItemUpdateInput = {};

  if (body.description !== undefined) {
    input.description = parseNonEmptyString(body.description, 'description');
  }
  if (body.unitPrice !== undefined) {
    input.unitPrice = parseMoney(body.unitPrice, 'unitPrice');
  }
  if (body.quantity !== undefined) {
    input.quantity = parseQuantity(body.quantity, 'quantity');
  }
  if (body.serviceId !== undefined) {
    input.serviceId =
      body.serviceId === null
        ? null
        : parseUuid(body.serviceId as string, 'serviceId');
  }
  if (body.tooth !== undefined) {
    input.tooth = parseFdiTooth(body.tooth, 'tooth');
  }
  if (body.status !== undefined) {
    input.status = parseTreatmentPlanItemStatus(body.status, 'status');
  }

  return input;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; planId: string; itemId: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { planId, itemId } = await context.params;
    const body = await parseJsonBody(request);
    const input = parseUpdateItemBody(body);
    const item = await updateTreatmentPlanItem(planId, itemId, input);
    return Response.json({ item });
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; planId: string; itemId: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { planId, itemId } = await context.params;
    await deleteTreatmentPlanItem(planId, itemId);
    return new Response(null, { status: 204 });
  });
}
