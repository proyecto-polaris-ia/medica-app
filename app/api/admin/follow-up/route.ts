import { requireUser } from '../_lib/auth';
import { handleAdminRequest } from '../_lib/responses';
import {
  currentRoundDate,
  listDailyFollowUpCases,
} from '@/lib/admin/follow-up/follow-up';

export const dynamic = 'force-dynamic';

/**
 * Lista del día de pacientes a contactar.
 *
 * `now` se calcula en el servidor (no se acepta la fecha del cliente) y la
 * ronda se deriva con `currentRoundDate` en `America/Mexico_City`.
 */
export async function GET(_request: Request): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const now = new Date();
    const roundDate = currentRoundDate(now);
    const cases = await listDailyFollowUpCases({ now });
    return Response.json({ cases, roundDate });
  });
}
