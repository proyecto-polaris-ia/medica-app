import { requireUser } from '../../../_lib/auth';
import { handleAdminRequest, parseJsonBody } from '../../../_lib/responses';
import { ValidationError, parseNonEmptyString, parseUuid } from '@/lib/admin/validate';
import {
  transitionFollowUpDraft,
  updateFollowUpDraftBody,
} from '@/lib/admin/follow-up/drafts';

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
 * Edición del texto o transición humana explícita de un borrador.
 *
 * Payload discriminado y retrocompatible:
 * - `{ status: 'approved' | 'rejected' }` → aprueba o rechaza (solo desde
 *   `draft`; cualquier otro estado responde 409).
 * - `{ action: 'edit', body }` → edita el texto y registra la auditoría,
 *   dejando el borrador en `draft`. Fuera de `draft` responde 409 y un texto
 *   que viola un guardrail responde 400, en ambos casos sin escribir.
 * - Cualquier otro payload → 400.
 *
 * Esta ruta **no** envía el mensaje: el envío vive en `.../[id]/send`.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(request);
    const draftId = parseUuid(id, 'id');

    if (body.action === 'edit') {
      const text = parseNonEmptyString(body.body, 'body');
      const draft = await updateFollowUpDraftBody({
        id: draftId,
        body: text,
        userId: user.id,
        now: new Date(),
      });
      return Response.json({ draft });
    }

    const status = parseTransitionStatus(body.status);

    const draft = await transitionFollowUpDraft({
      id: draftId,
      status,
      userId: user.id,
      now: new Date(),
    });

    return Response.json({ draft });
  });
}
