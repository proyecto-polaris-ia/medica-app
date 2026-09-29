import { requireUser } from '../../../../../_lib/auth';
import {
  createTreatmentPlanItem,
  getTreatmentPlan,
} from '@/lib/admin/treatment-plans';
import { handleAdminRequest, parseJsonBody } from '../../../../../_lib/responses';
import {
  parseFdiTooth,
  parseMoney,
  parseNonEmptyString,
  parseQuantity,
  parseUuid,
} from '@/lib/admin/validate';
import type { TreatmentPlanItemInput } from '@/lib/admin/types';

export const dynamic = 'force-dynamic';

function parseCreateItemBody(body: Record<string, unknown>): TreatmentPlanItemInput {
  const input: TreatmentPlanItemInput = {
    description: parseNonEmptyString(body.description, 'description'),
    unitPrice: parseMoney(body.unitPrice, 'unitPrice'),
  };

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

  return input;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; planId: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { planId } = await context.params;
    const { items } = await getTreatmentPlan(planId);
    return Response.json({ items });
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; planId: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { planId } = await context.params;
    const body = await parseJsonBody(request);
    const input = parseCreateItemBody(body);
    const item = await createTreatmentPlanItem(planId, input);
    return Response.json({ item }, { status: 201 });
  });
}
