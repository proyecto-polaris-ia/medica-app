import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  acquireDbSuiteLock,
  applyLocalDbEnv,
  localDbEnabled,
  releaseDbSuiteLock,
  truncateAllTables,
} from '@/test-utils/local-db';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  COLLECTIONS_SECURITY_REFUSAL,
  resolveCollectionsPatientPhone,
} from '../../../../agent/subagents/mora/identity';
import {
  DELEGATION_BINDING_TTL_SECONDS,
  deleteDelegationBinding,
  purgeExpiredDelegationBindings,
  resolveDelegationBinding,
  saveDelegationBinding,
} from '../delegation-bindings';

/**
 * Suite de datos contra Supabase local (ver openspec/changes/supabase-local-testing).
 * Corre solo con `npm run test:local` (SUPABASE_LOCAL=1 + supabase start);
 * con `npm run test` regular se omite.
 */
const d = localDbEnabled ? describe : describe.skip;

d('delegation bindings data layer', () => {
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

  it('round-trips a binding from save to resolve (and resolves the delegated identity)', async () => {
    const childSessionId = 'child-session-round-trip';
    await expect(
      saveDelegationBinding({
        childSessionId,
        trustedPatientPhone: '+5215512345678',
      }),
    ).resolves.toEqual({ ok: true });

    await expect(resolveDelegationBinding(childSessionId)).resolves.toEqual({
      ok: true,
      phone: '+5215512345678',
    });

    // The delegation identity resolver reads the same real binding row.
    await expect(
      resolveCollectionsPatientPhone(
        {
          session: {
            id: childSessionId,
            parent: { sessionId: 'root-session-1' },
            auth: { current: null, initiator: null },
          },
        },
        undefined,
        { attempts: 3, delayMs: 0 },
      ),
    ).resolves.toEqual({ phone: '+5215512345678' });
  });

  it('upserts idempotently, refreshing the phone for the same child session', async () => {
    const childSessionId = 'child-session-upsert';
    await saveDelegationBinding({
      childSessionId,
      trustedPatientPhone: '+5215511111111',
    });
    await saveDelegationBinding({
      childSessionId,
      trustedPatientPhone: '+5215522222222',
    });

    await expect(resolveDelegationBinding(childSessionId)).resolves.toEqual({
      ok: true,
      phone: '+5215522222222',
    });

    const { data } = await getSupabaseAdmin()
      .from('agent_delegation_bindings')
      .select('child_session_id')
      .eq('child_session_id', childSessionId);
    expect(data).toHaveLength(1);
  });

  it('returns a null phone for an unknown child session (and refuses the delegated path)', async () => {
    await expect(resolveDelegationBinding('unknown-child')).resolves.toEqual({
      ok: true,
      phone: null,
    });

    await expect(
      resolveCollectionsPatientPhone(
        {
          session: {
            id: 'unknown-child',
            parent: { sessionId: 'root-session-1' },
            auth: { current: null, initiator: null },
          },
        },
        undefined,
        { attempts: 2, delayMs: 0 },
      ),
    ).resolves.toEqual({ error: COLLECTIONS_SECURITY_REFUSAL });
  });

  it('purges expired bindings and keeps fresh ones', async () => {
    const expiredId = 'child-session-expired';
    const freshId = 'child-session-fresh';

    // Seed the fresh binding first: the save now purges opportunistically, so
    // inserting the expired row afterwards keeps it for the explicit purge.
    await saveDelegationBinding({
      childSessionId: freshId,
      trustedPatientPhone: '+5215533333333',
    });
    await getSupabaseAdmin()
      .from('agent_delegation_bindings')
      .insert({
        child_session_id: expiredId,
        trusted_patient_phone: '+5215500000000',
        created_at: new Date(
          Date.now() - (DELEGATION_BINDING_TTL_SECONDS + 60) * 1000,
        ).toISOString(),
      });

    await expect(purgeExpiredDelegationBindings()).resolves.toEqual({
      ok: true,
      deleted: 1,
    });
    await expect(resolveDelegationBinding(expiredId)).resolves.toEqual({
      ok: true,
      phone: null,
    });
    await expect(resolveDelegationBinding(freshId)).resolves.toEqual({
      ok: true,
      phone: '+5215533333333',
    });
  });

  it('deletes a single binding for cleanup reuse', async () => {
    const childSessionId = 'child-session-delete';
    await saveDelegationBinding({
      childSessionId,
      trustedPatientPhone: '+5215544444444',
    });

    await expect(deleteDelegationBinding(childSessionId)).resolves.toEqual({
      ok: true,
    });
    await expect(resolveDelegationBinding(childSessionId)).resolves.toEqual({
      ok: true,
      phone: null,
    });
  });
});
