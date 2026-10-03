import { requireUser } from '../../../../_lib/auth';
import { handleAdminRequest } from '../../../../_lib/responses';
import { parseUuid } from '@/lib/admin/validate';
import { sendFollowUpDraft } from '@/lib/follow-up/send-follow-up-draft';

export const dynamic = 'force-dynamic';

/**
 * Envía un borrador aprobado por el transporte HSM existente.
 *
 * Exige aprobación humana previa: `sendFollowUpDraft` lanza `ConflictError`
 * (409) si el borrador no está en `approved`. Es idempotente: un reintento
 * sobre un borrador ya `sent` es un no-op.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    const user = await requireUser();
    const { id } = await params;

    const result = await sendFollowUpDraft({
      draftId: parseUuid(id, 'id'),
      userId: user.id,
    });

    return Response.json(result);
  });
}
