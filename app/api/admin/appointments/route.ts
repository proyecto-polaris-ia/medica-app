import { requireUser } from '../_lib/auth';
import {
  createAppointment,
  listAppointments,
  listAppointmentsRange,
} from '@/lib/admin/appointments';
import type { AppointmentStatus } from '@/lib/admin/types';
import { parseJsonBody, handleAdminRequest } from '../_lib/responses';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    const appointments =
      start && end
        ? await listAppointmentsRange(start, end)
        : await listAppointments();

    return Response.json({ appointments });
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();
    const body = await parseJsonBody(request);
    const appointment = await createAppointment({
      patientId: body.patientId as string | null | undefined,
      serviceId: body.serviceId as string,
      providerId: body.providerId as string,
      startAt: body.startAt as string,
      endAt: body.endAt as string,
      status: body.status as AppointmentStatus | undefined,
      notes: body.notes as string | null | undefined,
    });
    return Response.json({ appointment }, { status: 201 });
  });
}
