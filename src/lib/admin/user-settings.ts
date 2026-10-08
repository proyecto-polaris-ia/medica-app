import { createSupabaseServerClient } from '@/lib/supabase/auth';
import { isValidIanaTimeZone, resolveTimeZone } from './timezone';

/**
 * Preferencia de zona horaria por usuario (server-only).
 *
 * A diferencia de los CRUD administrativos (que usan `getSupabaseAdmin()`),
 * aquí se usa `createSupabaseServerClient()` para que la RLS de
 * `user_settings` aplique con la sesión del usuario. El `user_id` siempre
 * viene de `requireUser()` en el llamador, nunca del cuerpo del request.
 */

/**
 * Lee la preferencia del usuario y normaliza valores inválidos al default de
 * la clínica. Si no existe fila (o la RLS la filtra), devuelve el default.
 */
export async function getUserTimezone(userId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('user_settings')
    .select('timezone')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return resolveTimeZone(data?.timezone ?? null);
}

/**
 * Persiste la preferencia del usuario (upsert por `user_id`). Valida la forma
 * IANA antes de escribir; lanza `Error` si el valor no es una zona válida.
 */
export async function setUserTimezone(
  userId: string,
  timezone: string
): Promise<void> {
  if (!isValidIanaTimeZone(timezone)) {
    throw new Error(`Invalid IANA time zone: ${timezone}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, timezone }, { onConflict: 'user_id' });

  if (error) {
    throw new Error(error.message);
  }
}
