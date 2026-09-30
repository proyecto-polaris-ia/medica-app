import { listAccountsReceivable } from '@/lib/admin/accounts-receivable';
import { parseThresholdDays } from '@/lib/admin/validate';
import { requireUser } from '../_lib/auth';
import { handleAdminRequest } from '../_lib/responses';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { searchParams } = new URL(request.url);
    const thresholdDays = parseThresholdDays(searchParams.get('thresholdDays'));
    const accountsReceivable = await listAccountsReceivable({ thresholdDays });

    return Response.json({ accountsReceivable });
  });
}
