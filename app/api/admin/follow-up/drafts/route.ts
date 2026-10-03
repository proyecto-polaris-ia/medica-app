import { requireUser } from '../../_lib/auth';
import { handleAdminRequest, parseJsonBody } from '../../_lib/responses';
import { NotFoundError } from '@/lib/admin/errors';
import { parseStatus, parseUuid } from '@/lib/admin/validate';
import { buildFollowUpDraft } from '@/lib/admin/follow-up/draft';
import {
  createFollowUpDraft,
  FOLLOW_UP_DRAFT_STATUSES,
} from '@/lib/admin/follow-up/drafts';
import {
  currentRoundDate,
  listDailyFollowUpCases,
} from '@/lib/admin/follow-up/follow-up';
import { getWccFollowUpDrafts } from '@/lib/wcc-follow-up-drafts';

export const dynamic = 'force-dynamic';

/**
 * Lista de borradores de seguimiento para el WhatsApp Command Center.
 *
 * `?status=` es opcional y debe pertenecer al enum del ciclo de vida.
 */
export async function GET(request: Request): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status') ?? undefined;
    const status =
      statusParam === undefined
        ? undefined
        : (parseStatus(statusParam, FOLLOW_UP_DRAFT_STATUSES) ?? undefined);

    const queue = await getWccFollowUpDrafts(status ? { status } : undefined);
    return Response.json({ drafts: queue.drafts });
  });
}

/**
 * Genera y persiste el borrador determinista de un paciente de la lista del día.
 *
 * `now` y la ronda se derivan en el servidor; la generación es idempotente por
 * `follow-up-draft:<patientId>:<roundDate>` (no duplica si ya existe) y los
 * guardrails de texto se ejecutan antes de persistir. Esta ruta **no** envía
 * nada: el envío exige aprobación humana explícita.
 */
export async function POST(request: Request): Promise<Response> {
  return handleAdminRequest(async () => {
    const user = await requireUser();
    const body = await parseJsonBody(request);
    const patientId = parseUuid(body.patientId, 'patientId');
    const now = new Date();
    const roundDate = currentRoundDate(now);

    const cases = await listDailyFollowUpCases({ now });
    const followUpCase = cases.find((item) => item.patientId === patientId);
    if (!followUpCase) {
      throw new NotFoundError('Follow-up case');
    }

    const draftText = buildFollowUpDraft({
      patientName: followUpCase.patientName,
      reason: followUpCase.reason,
    });

    const { draft, created } = await createFollowUpDraft({
      patientId,
      userId: user.id,
      body: draftText.body,
      templateName: draftText.templateName,
      roundDate,
    });

    return Response.json({ draft }, { status: created ? 201 : 200 });
  });
}
