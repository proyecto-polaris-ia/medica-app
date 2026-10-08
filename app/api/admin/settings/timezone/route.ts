import { requireUser } from '../../_lib/auth';
import { handleAdminRequest, parseJsonBody } from '../../_lib/responses';
import { ValidationError } from '@/lib/admin/validate';
import { isValidIanaTimeZone } from '@/lib/admin/timezone';
import { getUserTimezone, setUserTimezone } from '@/lib/admin/user-settings';

export const dynamic = 'force-dynamic';

/** Devuelve la preferencia de zona horaria del usuario autenticado. */
export async function GET(): Promise<Response> {
  return handleAdminRequest(async () => {
    const user = await requireUser();
    const timezone = await getUserTimezone(user.id);
    return Response.json({ timezone });
  });
}

/**
 * Actualiza la preferencia del usuario autenticado. El `user_id` sale de la
 * sesión; sólo se acepta una zona IANA válida (si no, 400).
 */
export async function PUT(request: Request): Promise<Response> {
  return handleAdminRequest(async () => {
    const user = await requireUser();
    const body = await parseJsonBody(request);
    const value = body.timezone;

    if (typeof value !== 'string' || !isValidIanaTimeZone(value)) {
      throw new ValidationError('timezone', 'Invalid timezone');
    }

    await setUserTimezone(user.id, value);
    return Response.json({ timezone: value });
  });
}
