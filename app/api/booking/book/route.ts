import { bookAppointment } from '@/lib/booking/booking';
import { findNextAvailable } from '@/lib/booking/next-available';
import { resolvePatient } from '@/lib/booking/patient-resolution';
import {
  TurnstileUnavailableError,
  verifyTurnstile,
} from '@/lib/booking/turnstile';
import { isBookingUiEnabled } from '../_lib/flag';
import {
  parseIsoDate,
  parseNotes,
  parsePhoneE164,
  parseUuid,
  ValidationError,
} from '../_lib/validate';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isBookingUiEnabled()) {
    return new Response('Not found', { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'invalid_request', field: 'body' },
      { status: 400 }
    );
  }

  try {
    if ('patientId' in body) {
      throw new ValidationError('patientId', 'patientId is not allowed');
    }

    const captchaToken =
      typeof body.captchaToken === 'string' ? body.captchaToken : undefined;
    if (!captchaToken) {
      throw new ValidationError('captchaToken', 'captchaToken is required');
    }

    const verified = await verifyTurnstile(captchaToken);
    if (!verified) {
      throw new ValidationError('captchaToken', 'Invalid captchaToken');
    }

    const serviceId = parseUuid(body.serviceId, 'serviceId');
    const providerId = parseUuid(body.providerId, 'providerId');
    const startAt = parseIsoDate(body.startAt, 'startAt');
    const endAt = parseIsoDate(body.endAt, 'endAt');
    const phone = parsePhoneE164(body.phone, 'phone');
    const fullName =
      typeof body.fullName === 'string' ? body.fullName : undefined;
    const notes = parseNotes(body.notes, 'notes');

    const patient = await resolvePatient({ phone, fullName });

    const result = await bookAppointment({
      patientId: patient.id,
      serviceId,
      providerId,
      startAt,
      endAt,
      notes,
    });

    if ('type' in result) {
      const nextSlot = await findNextAvailable({
        providerId,
        serviceId,
        after: startAt,
      });

      return Response.json(
        {
          status: 'conflict',
          message: result.message,
          nextAvailable: nextSlot
            ? {
                startAt: nextSlot.start_at.toISOString(),
                endAt: nextSlot.end_at.toISOString(),
              }
            : null,
        },
        { status: 409 }
      );
    }

    return Response.json(
      {
        status: 'booked',
        confirmation: {
          serviceName: '',
          providerName: '',
          patientName: fullName ?? patient.full_name,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return Response.json(
        { error: 'invalid_request', field: error.field },
        { status: 400 }
      );
    }

    if (error instanceof TurnstileUnavailableError) {
      return Response.json(
        { error: 'turnstile_unavailable' },
        { status: 503 }
      );
    }

    return Response.json(
      { error: 'booking_failed' },
      { status: 500 }
    );
  }
}
