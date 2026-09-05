import { listServices } from '@/lib/booking/catalog';
import { isBookingUiEnabled } from '../_lib/flag';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request): Promise<Response> {
  if (!isBookingUiEnabled()) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const services = await listServices();
    return Response.json({ services });
  } catch {
    return Response.json(
      { error: 'failed_to_load_services' },
      { status: 500 }
    );
  }
}
