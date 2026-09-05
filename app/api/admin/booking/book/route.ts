import { bookAppointment } from '@/lib/booking/booking';
import {
  resolvePatient,
  resolvePatientById,
} from '@/lib/booking/patient-resolution';
import { ValidationError } from '@/lib/admin/validate';
import { requireUser } from '../../_lib/auth';
import { parseJsonBody, handleAdminRequest } from '../../_lib/responses';
import {
  parseIsoDate,
  parsePhoneE164,
  parseUuid,
} from '../../../booking/_lib/validate';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return handleAdminRequest(async () => {
    await requireUser();

    const body = await parseJsonBody(request);

    const serviceId = parseUuid(body.serviceId, 'serviceId');
    const providerId = parseUuid(body.providerId, 'providerId');
    const startAt = parseIsoDate(body.startAt, 'startAt');
    const endAt = parseIsoDate(body.endAt, 'endAt');

    let patient: { id: string; full_name: string };

    if (
      typeof body.patientId === 'string' &&
      body.patientId.length > 0
    ) {
      patient = await resolvePatientById(body.patientId);
    } else if (
      typeof body.phone === 'string' &&
      typeof body.fullName === 'string'
    ) {
      const phone = parsePhoneE164(body.phone, 'phone');
      patient = await resolvePatient({ phone, fullName: body.fullName });
    } else {
      throw new ValidationError(
        'patient',
        'Provide either patientId or phone and fullName'
      );
    }

    const result = await bookAppointment({
      patientId: patient.id,
      serviceId,
      providerId,
      startAt,
      endAt,
    });

    if ('type' in result) {
      return Response.json(
        {
          status: 'conflict',
          message: result.message,
        },
        { status: 409 }
      );
    }

    return Response.json(
      {
        status: 'booked',
        confirmation: {
          patientName: patient.full_name,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        },
      },
      { status: 201 }
    );
  });
}
