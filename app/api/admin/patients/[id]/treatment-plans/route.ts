import { requireUser } from '../../../_lib/auth';
import {
  createTreatmentPlan,
  listTreatmentPlans,
} from '@/lib/admin/treatment-plans';
import { handleAdminRequest, parseJsonBody } from '../../../_lib/responses';
import {
  parseFdiTooth,
  parseMoney,
  parseNonEmptyString,
  parseNotes,
  parseQuantity,
  parseUuid,
  ValidationError,
} from '@/lib/admin/validate';
import type { TreatmentPlanItemInput } from '@/lib/admin/types';

export const dynamic = 'force-dynamic';

function parseItemInput(
  raw: unknown,
  index: number
): TreatmentPlanItemInput {
  if (raw === null || typeof raw !== 'object') {
    throw new ValidationError(`items[${index}]`, `Invalid items[${index}]`);
  }
  const item = raw as Record<string, unknown>;
  const input: TreatmentPlanItemInput = {
    description: parseNonEmptyString(
      item.description,
      `items[${index}].description`
    ),
    unitPrice: parseMoney(item.unitPrice, `items[${index}].unitPrice`),
  };
  if (item.quantity !== undefined) {
    input.quantity = parseQuantity(item.quantity, `items[${index}].quantity`);
  }
  if (item.serviceId !== undefined) {
    input.serviceId =
      item.serviceId === null
        ? null
        : parseUuid(item.serviceId as string, `items[${index}].serviceId`);
  }
  if (item.tooth !== undefined) {
    input.tooth = parseFdiTooth(item.tooth, `items[${index}].tooth`);
  }
  return input;
}

function parseCreateBody(body: Record<string, unknown>) {
  const input: {
    providerId: string;
    name: string;
    notes?: string | null;
    clinicalVisitId?: string | null;
    items?: TreatmentPlanItemInput[];
  } = {
    providerId: parseUuid(body.providerId, 'providerId'),
    name: parseNonEmptyString(body.name, 'name'),
  };

  if (body.notes !== undefined) {
    input.notes = parseNotes(body.notes, 'notes');
  }
  if (body.clinicalVisitId !== undefined) {
    input.clinicalVisitId =
      body.clinicalVisitId === null
        ? null
        : parseUuid(body.clinicalVisitId as string, 'clinicalVisitId');
  }
  if (body.items !== undefined) {
    if (!Array.isArray(body.items)) {
      throw new ValidationError('items', 'Invalid items');
    }
    input.items = body.items.map(parseItemInput);
  }

  return input;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { id } = await context.params;
    const treatmentPlans = await listTreatmentPlans(id);
    return Response.json({ treatmentPlans });
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
    const input = parseCreateBody(body);
    const treatmentPlan = await createTreatmentPlan(id, input);
    return Response.json({ treatmentPlan }, { status: 201 });
  });
}
