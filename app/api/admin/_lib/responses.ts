import { UnauthorizedError } from '@/lib/supabase/auth';
import { ConflictError, NotFoundError } from '@/lib/admin/errors';
import { ValidationError } from '@/lib/admin/validate';

export async function handleAdminRequest(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    if (error instanceof ValidationError) {
      return Response.json(
        { error: 'invalid_request', field: error.field },
        { status: 400 }
      );
    }

    if (error instanceof NotFoundError) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }

    if (error instanceof ConflictError) {
      return Response.json(
        { code: error.code, message: error.message },
        { status: 409 }
      );
    }

    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function parseJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError('body', 'Invalid JSON body');
  }
}
