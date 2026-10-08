import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  acquireDbSuiteLock,
  applyLocalDbEnv,
  localDbEnabled,
  releaseDbSuiteLock,
  truncateAllTables,
} from '@/test-utils/local-db';
import { CLINIC_TZ } from '@/lib/admin/timezone';

/**
 * Suite de datos de la preferencia de zona horaria por usuario (tareas 1.2 y
 * 3.1 de openspec/changes/user-timezone-preferences).
 *
 * Corre contra Supabase local: `supabase start` + `supabase db reset`, luego
 * `npm run test:local`. Con `npm run test` regular se omite.
 *
 * `getUserTimezone`/`setUserTimezone` leen y escriben con la sesión del
 * usuario (`createSupabaseServerClient`), así que aquí se sustituye ese
 * cliente por uno real de `supabase-js` autenticado con el JWT del usuario de
 * turno. El resto — consulta, upsert y RLS de `user_settings` — se ejercita
 * de verdad.
 */
const session = vi.hoisted(() => ({ token: null as string | null }));

vi.mock('@/lib/supabase/auth', async () => {
  const { createClient: createSupabaseClient } = await import(
    '@supabase/supabase-js'
  );
  return {
    createSupabaseServerClient: async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !anonKey) {
        throw new Error('Faltan las variables de Supabase local para la prueba');
      }
      return createSupabaseClient(url, anonKey, {
        auth: { persistSession: false },
        global: session.token
          ? { headers: { Authorization: `Bearer ${session.token}` } }
          : undefined,
      });
    },
  };
});

import { getUserTimezone, setUserTimezone } from '@/lib/admin/user-settings';

const d = localDbEnabled ? it : it.skip;

const USER_A = { email: 'tz-a@medica.local', password: 'tz-test-password-a' };
const USER_B = { email: 'tz-b@medica.local', password: 'tz-test-password-b' };

type Session = { id: string; token: string };

function envUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL!;
}

function envAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
}

async function createSession(user: {
  email: string;
  password: string;
}): Promise<Session> {
  const client = createClient(envUrl(), envAnonKey(), {
    auth: { persistSession: false },
  });

  const { error: signUpError } = await client.auth.signUp(user);
  if (signUpError && !signUpError.message.includes('already registered')) {
    throw signUpError;
  }

  const { data, error } = await client.auth.signInWithPassword(user);
  if (error || !data.session || !data.user) {
    throw error ?? new Error('Sin sesión para la prueba');
  }

  return { id: data.user.id, token: data.session.access_token };
}

/** Inserta una fila saltándose la validación de aplicación (service_role). */
async function insertRowAsService(userId: string, timezone: string) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const service = createClient(envUrl(), serviceKey, {
    auth: { persistSession: false },
  });
  const { error } = await service
    .from('user_settings')
    .insert({ user_id: userId, timezone });
  if (error) {
    throw error;
  }
}

beforeAll(async () => {
  applyLocalDbEnv();
  await acquireDbSuiteLock();
});

afterAll(async () => {
  await releaseDbSuiteLock();
});

beforeEach(async () => {
  await truncateAllTables();
  session.token = null;
});

d('getUserTimezone devuelve el default de la clínica sin fila', async () => {
  const a = await createSession(USER_A);
  session.token = a.token;

  expect(await getUserTimezone(a.id)).toBe(CLINIC_TZ);
});

d('setUserTimezone hace upsert y getUserTimezone lo lee', async () => {
  const a = await createSession(USER_A);
  session.token = a.token;

  await setUserTimezone(a.id, 'America/New_York');
  expect(await getUserTimezone(a.id)).toBe('America/New_York');

  // El segundo guardado actualiza la misma fila.
  await setUserTimezone(a.id, 'Europe/Madrid');
  expect(await getUserTimezone(a.id)).toBe('Europe/Madrid');
});

d('getUserTimezone normaliza un valor inválido guardado', async () => {
  const a = await createSession(USER_A);
  session.token = a.token;

  // Valor con forma válida (longitud) pero zona IANA inexistente.
  await insertRowAsService(a.id, 'Not/AZone');

  expect(await getUserTimezone(a.id)).toBe(CLINIC_TZ);
});

d('setUserTimezone rechaza una zona inválida', async () => {
  const a = await createSession(USER_A);
  session.token = a.token;

  await expect(setUserTimezone(a.id, 'Not/AZone')).rejects.toThrow();
});

d('RLS aísla la preferencia: un usuario no ve ni escribe la de otro', async () => {
  const a = await createSession(USER_A);
  const b = await createSession(USER_B);

  // B guarda su preferencia.
  session.token = b.token;
  await setUserTimezone(b.id, 'America/Tijuana');
  expect(await getUserTimezone(b.id)).toBe('America/Tijuana');

  // A no puede leer la fila de B (RLS la filtra; cae al default).
  session.token = a.token;
  expect(await getUserTimezone(b.id)).toBe(CLINIC_TZ);

  // A tampoco puede escribir la fila de B.
  await expect(setUserTimezone(b.id, 'Europe/Madrid')).rejects.toThrow();

  // La preferencia de B sigue intacta.
  session.token = b.token;
  expect(await getUserTimezone(b.id)).toBe('America/Tijuana');
});
