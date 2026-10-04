import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  acquireDbSuiteLock,
  applyLocalDbEnv,
  localDbEnabled,
  releaseDbSuiteLock,
  truncateAllTables,
} from '@/test-utils/local-db';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { createPatient } from '@/lib/admin/patients';
import { getWccContactsList } from './wcc-contacts';

/**
 * Suite contra Supabase local (ver openspec/changes/supabase-local-testing).
 * Corre solo con `npm run test:local` (SUPABASE_LOCAL=1 + supabase start);
 * con `npm run test` regular se omite.
 */
const d = localDbEnabled ? describe : describe.skip;

// Las suites de datos se serializan con un advisory lock (ver
// src/test-utils/local-db.ts) porque vitest corre los archivos en paralelo
// y todas truncan el esquema `public`.

d('getWccContactsList', () => {
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

  it('keeps WhatsApp contact phone mandatory while the linked patient phone can be null', async () => {
    // Paciente con contacto solo por email: `phone_e164` nulo es válido.
    const patient = await createPatient({
      fullName: 'María',
      phoneE164: null,
      email: 'maria@example.com',
    });

    // No existe función de dominio para `whatsapp_contacts`: se inserta directo
    // en la tabla. El trigger `set_whatsapp_contact_linked_patient` conserva el
    // vínculo manual cuando la fila ya trae `linked_patient_id`.
    const { data: contact, error } = await getSupabaseAdmin()
      .from('whatsapp_contacts')
      .insert({
        phone_e164: '+5215512345678',
        linked_patient_id: patient.id,
        opt_in_status: 'opted_in',
        first_seen_at: '2026-09-01T10:00:00Z',
        last_seen_at: '2026-09-02T10:00:00Z',
        created_at: '2026-09-01T10:00:00Z',
      })
      .select('id')
      .single();
    if (error || !contact) throw new Error(error?.message ?? 'contact insert failed');

    const result = await getWccContactsList();

    expect(result.isSupabaseConfigured).toBe(true);
    expect(result.isConfiguredButUnavailable).toBe(false);
    expect(result.contacts).toHaveLength(1);
    // Outcome observable en la BD: el contacto quedó vinculado al paciente.
    expect(result.contacts[0].id).toBe(contact.id);
    expect(result.contacts[0]).toMatchObject({
      phoneE164: '+5215512345678',
      linkedPatientId: patient.id,
      linkedPatient: { phoneE164: null, email: 'maria@example.com' },
    });
  });
});
