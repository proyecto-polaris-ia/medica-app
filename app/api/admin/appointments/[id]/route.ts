import { requireUser } from '../../_lib/auth';
import {
  deleteAppointment,
  updateAppointment,
} from '@/lib/admin/appointments';
import type { AppointmentStatus } from '@/lib/admin/types';
import { handleAdminRequest, parseJsonBody } from '../../_lib/responses';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(request);
    const appointment = await updateAppointment(id, {
      patientId: body.patientId as string | null | undefined,
      serviceId: body.serviceId as string,
      providerId: body.providerId as string,
      startAt: body.startAt as string,
      endAt: body.endAt as string,
      status: body.status as AppointmentStatus | undefined,
    });
    return Response.json({ appointment });
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { id } = await params;
    await deleteAppointment(id);
    return new Response(null, { status: 204 });
  });
}
