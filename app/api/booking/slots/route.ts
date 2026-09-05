import { getFreeSlots } from '@/lib/booking/availability';
import { isBookingUiEnabled } from '../_lib/flag';
import { parseLocalDate, parseUuid, ValidationError } from '../_lib/validate';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  if (!isBookingUiEnabled()) {
    return new Response('Not found', { status: 404 });
  }

  const { searchParams } = new URL(request.url);

  try {
    const providerId = parseUuid(searchParams.get('providerId'), 'providerId');
    const serviceId = parseUuid(searchParams.get('serviceId'), 'serviceId');
    const localDate = parseLocalDate(searchParams.get('date'), 'date');

    const slots = await getFreeSlots({ providerId, serviceId, localDate });

    return Response.json({
      slots: slots.map((slot) => ({
        startAt: slot.start_at.toISOString(),
        endAt: slot.end_at.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return Response.json(
        { error: 'invalid_request', field: error.field },
        { status: 400 }
      );
    }

    return Response.json(
      { error: 'failed_to_load_slots' },
      { status: 500 }
    );
  }
}
