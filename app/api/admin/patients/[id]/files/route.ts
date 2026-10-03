import { requireUser } from '../../../_lib/auth';
import {
  listPatientFilesWithUrls,
  uploadPatientFile,
  validatePatientFileUpload,
} from '@/lib/admin/patient-files';
import { handleAdminRequest } from '../../../_lib/responses';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { id } = await context.params;
    const clinicalVisitId = new URL(request.url).searchParams.get(
      'clinicalVisitId'
    );
    const files = await listPatientFilesWithUrls(id, { clinicalVisitId });
    return Response.json({ files });
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    const user = await requireUser();
    const { id } = await context.params;

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return Response.json(
        { error: 'invalid_file', message: 'Selecciona un archivo.' },
        { status: 400 }
      );
    }

    const validation = validatePatientFileUpload(file);
    if (!validation.ok) {
      return Response.json(
        { error: 'invalid_file', message: validation.message },
        { status: 400 }
      );
    }

    const patientFile = await uploadPatientFile(id, {
      file,
      category: (form.get('category') as string | null) ?? null,
      clinicalVisitId: (form.get('clinicalVisitId') as string | null) ?? null,
      uploadedBy: user.id,
    });
    return Response.json({ file: patientFile }, { status: 201 });
  });
}
