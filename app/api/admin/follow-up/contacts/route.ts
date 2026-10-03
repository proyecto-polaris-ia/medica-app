import { requireUser } from '../../_lib/auth';
import { handleAdminRequest, parseJsonBody } from '../../_lib/responses';
import { markFollowUpContact } from '@/lib/admin/follow-up/follow-up';
import { parseFollowUpContactStatus, parseUuid } from '@/lib/admin/validate';
import { getPatient } from '@/lib/admin/patients';
import { NotFoundError } from '@/lib/admin/errors';

export const dynamic = 'force-dynamic';

/**
 * Registra el estado de contacto (`contacted`/`dismissed`) de un caso del día.
 *
 * Valida el UUID del paciente y verifica su existencia antes de persistir el
 * estado; el `now` y la ronda se derivan en el servidor dentro de
 * `markFollowUpContact`.
 */
export async function POST(request: Request): Promise<Response> {
  return handleAdminRequest(async () => {
    const user = await requireUser();
    const body = await parseJsonBody(request);
    const patientId = parseUuid(body.patientId, 'patientId');
    const status = parseFollowUpContactStatus(body.status);

    const patient = await getPatient(patientId);
    if (!patient) {
      throw new NotFoundError('Patient');
    }

    const contact = await markFollowUpContact({
      patientId,
      status,
      note: typeof body.note === 'string' ? body.note : null,
      userId: user.id,
      now: new Date(),
    });

    return Response.json({ contact }, { status: 201 });
  });
}
