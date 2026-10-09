import { requireUser } from '../../../../_lib/auth';
import { listPatientAttendedAppointmentsPage } from '@/lib/admin/patient-record';
import { NotFoundError } from '@/lib/admin/errors';
import { parseUuid } from '@/lib/admin/validate';
import { handleAdminRequest } from '../../../../_lib/responses';
import { parsePageParam, parsePageSizeParam } from '../../../../_lib/pagination';

export const dynamic = 'force-dynamic';

/** Un id de ruta que no es UUID se trata como paciente inexistente (404). */
function resolvePatientId(id: string): string {
  try {
    return parseUuid(id, 'id');
  } catch {
    throw new NotFoundError('Patient');
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const page = parsePageParam(searchParams.get('page'));
    const pageSize = parsePageSizeParam(searchParams.get('pageSize'));
    const patientId = resolvePatientId(id);

    const result = await listPatientAttendedAppointmentsPage(
      patientId,
      page,
      pageSize
    );

    return Response.json({
      appointments: result.appointments,
      pagination: {
        total: result.total,
        page,
        pageSize,
        totalPages: Math.ceil(result.total / pageSize),
      },
    });
  });
}
