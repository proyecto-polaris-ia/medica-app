import { reversePayment, updatePayment } from '@/lib/admin/payments';
import type { PaymentMethod, PaymentUpdateInput } from '@/lib/admin/types';
import { ValidationError } from '@/lib/admin/validate';
import { requireUser } from '../../_lib/auth';
import { handleAdminRequest, parseJsonBody } from '../../_lib/responses';

export const dynamic = 'force-dynamic';

type PaymentPatchAction = 'update' | 'reverse';

function parseAction(value: unknown): PaymentPatchAction {
  if (value !== 'update' && value !== 'reverse') {
    throw new ValidationError('action', 'Invalid action');
  }
  return value;
}

function parseUpdateBody(body: Record<string, unknown>): PaymentUpdateInput {
  return {
    treatmentPlanId: body.treatmentPlanId as string | null | undefined,
    amount: body.amount as number | undefined,
    method: body.method as PaymentMethod | undefined,
    paidAt: body.paidAt as string | undefined,
    reference: body.reference as string | null | undefined,
    notes: body.notes as string | null | undefined,
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ paymentId: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    const user = await requireUser();
    const { paymentId } = await context.params;
    const body = await parseJsonBody(request);
    const action = parseAction(body.action);

    const payment =
      action === 'update'
        ? await updatePayment(paymentId, parseUpdateBody(body))
        : await reversePayment(paymentId, { reason: body.reason as string }, user.id);

    return Response.json({ payment });
  });
}
