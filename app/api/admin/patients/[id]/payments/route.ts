import { getPatientReceivableSummary } from '@/lib/admin/accounts-receivable';
import { createPayment, listPayments } from '@/lib/admin/payments';
import type { PaymentInput } from '@/lib/admin/types';
import { requireUser } from '../../../_lib/auth';
import { handleAdminRequest, parseJsonBody } from '../../../_lib/responses';

export const dynamic = 'force-dynamic';

function parsePaymentBody(body: Record<string, unknown>): PaymentInput {
  return {
    treatmentPlanId: body.treatmentPlanId as string | null | undefined,
    amount: body.amount as number,
    method: body.method as PaymentInput['method'],
    paidAt: body.paidAt as string,
    reference: body.reference as string | null | undefined,
    notes: body.notes as string | null | undefined,
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { id } = await context.params;
    const [payments, summary] = await Promise.all([
      listPayments(id),
      getPatientReceivableSummary(id),
    ]);

    return Response.json({ payments, summary });
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const body = await parseJsonBody(request);
    const payment = await createPayment(id, parsePaymentBody(body), user.id);

    return Response.json({ payment }, { status: 201 });
  });
}
