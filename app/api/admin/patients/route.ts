import { requireUser } from '../_lib/auth';
import {
  createPatient,
  listPatientsPage,
  normalizePatientsPagination,
} from '@/lib/admin/patients';
import { parseJsonBody, handleAdminRequest } from '../_lib/responses';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') ?? '').trim();
    const { page, pageSize } = normalizePatientsPagination(
      searchParams.get('page'),
      searchParams.get('pageSize')
    );

    const result = await listPatientsPage({ q, page, pageSize });

    return Response.json({
      patients: result.patients,
      page: result.page,
      pageSize: result.pageSize,
      total: result.totalCount,
      totalPages: result.totalPages,
    });
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const body = await parseJsonBody(request);
    const patient = await createPatient({
      fullName: body.fullName as string,
      phoneE164: body.phoneE164 as string | null | undefined,
      email: body.email as string | null | undefined,
      notes: body.notes as string | null | undefined,
    });
    return Response.json({ patient }, { status: 201 });
  });
}
