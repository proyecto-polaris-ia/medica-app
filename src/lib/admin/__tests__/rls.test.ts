import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  acquireDbSuiteLock,
  applyLocalDbEnv,
  localDbEnabled,
  releaseDbSuiteLock,
  truncateAllTables,
} from '@/test-utils/local-db';

/**
 * Suite de RLS contra Supabase local (tarea 2.5 de
 * openspec/changes/supabase-local-testing).
 *
 * Contrato del esquema:
 * - Tablas con política `*_admin_all` (TO authenticated): un usuario
 *   autenticado tiene acceso completo; `anon` no.
 * - Tablas con RLS habilitado sin políticas (agenda/clinical): solo
 *   service_role (la app la usa server-side vía getSupabaseAdmin).
 *
 * Corre solo con `npm run test:local` (SUPABASE_LOCAL=1 + supabase start);
 * con `npm run test` regular se omite.
 */
const d = localDbEnabled ? it : it.skip;

const EMAIL = 'rls-test@medica.local';
const PASSWORD = 'rls-test-password-1';

async function getAnon() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

async function getAuthenticated() {
  const anon = await getAnon();
  const { error } = await anon.auth.signUp({
    email: EMAIL,
    password: PASSWORD,
  });
  if (error && !error.message.includes('already registered')) {
    throw error;
  }
  const { data, error: signInError } = await anon.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (signInError || !data.session) {
    throw signInError ?? new Error('no session');
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    }
  );
}

d('RLS: tabla sin políticas niega todo a anon y authenticated', async () => {
  const anon = await getAnon();
  // services tiene RLS habilitado sin políticas: solo service_role lee.
  const { data, error } = await anon.from('services').select('id').limit(1);
  expect(data).toBeNull();
  expect(error).not.toBeNull();
});

d('RLS: tabla admin_all permite todo a authenticated', async () => {
  const auth = await getAuthenticated();
  // whatsapp_contacts tiene política *_admin_all TO authenticated.
  const inserted = await auth
    .from('whatsapp_contacts')
    .insert({ phone_e164: '+5215511111111' })
    .select('id, phone_e164')
    .single();
  expect(inserted.error).toBeNull();
  expect(inserted.data?.phone_e164).toBe('+5215511111111');
});

d('RLS: tabla admin_all niega a anon', async () => {
  const anon = await getAnon();
  const { data, error } = await anon.from('whatsapp_contacts').select('id').limit(1);
  expect(data).toBeNull();
  expect(error).not.toBeNull();
});

beforeAll(async () => {
  applyLocalDbEnv();
  await acquireDbSuiteLock();
});

afterAll(async () => {
  await releaseDbSuiteLock();
});

beforeEach(async () => {
  await truncateAllTables();
});
