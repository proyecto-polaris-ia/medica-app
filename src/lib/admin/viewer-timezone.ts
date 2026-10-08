import { cache } from 'react';
import { requireUser } from '@/lib/supabase/auth';
import { getUserTimezone } from './user-settings';

/**
 * Zona horaria del observador para el request en curso (server-only).
 *
 * `cache` de React deduplica la lectura dentro del mismo request: el layout,
 * las páginas y los componentes servidor que la llamen comparten un solo
 * acceso a la preferencia. Lanza `UnauthorizedError` si no hay sesión
 * (propagado desde `requireUser()`).
 */
export const getViewerTimezone = cache(async (): Promise<string> => {
  const user = await requireUser();
  return getUserTimezone(user.id);
});
