import { requireUser } from '../../../_lib/auth';
import { handleAdminRequest, parseJsonBody } from '../../../_lib/responses';
import { ValidationError, parseUuid } from '@/lib/admin/validate';
import { transitionFollowUpDraft } from '@/lib/admin/follow-up/drafts';

export const dynamic = 'force-dynamic';

const TRANSITION_STATUSES = ['approved', 'rejected'] as const;
type TransitionStatus = (typeof TRANSITION_STATUSES)[number];

function parseTransitionStatus(value: unknown): TransitionStatus {
  if (
    typeof value === 'string' &&
    (TRANSITION_STATUSES as readonly string[]).includes(value)
  ) {
    return value as TransitionStatus;
  }
  throw new ValidationError('status', 'Invalid status');
}

/**
 * Aprobación o rechazo humano explícito de un borrador.
 *
 * Solo es válido desde `draft`; cualquier otro estado responde 409. Esta ruta
 * **no** envía el mensaje: el envío vive en `.../[id]/send`.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(request);
    const status = parseTransitionStatus(body.status);

    const draft = await transitionFollowUpDraft({
      id: parseUuid(id, 'id'),
      status,
      userId: user.id,
      now: new Date(),
    });

    return Response.json({ draft });
  });
}
