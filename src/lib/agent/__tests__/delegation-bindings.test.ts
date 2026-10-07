import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

import {
  DELEGATION_BINDING_TTL_SECONDS,
  deleteDelegationBinding,
  purgeExpiredDelegationBindings,
  resolveDelegationBinding,
  saveDelegationBinding,
} from '../delegation-bindings';

const TABLE = 'agent_delegation_bindings';
const CHILD_SESSION_ID = 'child-session-abc-123';
const TRUSTED_PHONE = '+5215512345678';

const admin = getSupabaseAdmin as ReturnType<typeof vi.fn>;

function mockUpsert(result: { data?: unknown; error: unknown }) {
  const upsert = vi.fn().mockResolvedValue(result);
  const from = vi.fn(() => ({ upsert }));
  admin.mockReturnValue({ from });
  return { from, upsert };
}

function mockResolve(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn(() => ({ select }));
  admin.mockReturnValue({ from });
  return { from, select, eq, maybeSingle };
}

function mockDelete(result: { error: unknown }) {
  const eq = vi.fn().mockResolvedValue(result);
  const del = vi.fn().mockReturnValue({ eq });
  const from = vi.fn(() => ({ delete: del }));
  admin.mockReturnValue({ from });
  return { from, delete: del, eq };
}

function mockPurge(result: { data: unknown; error: unknown }) {
  const select = vi.fn().mockResolvedValue(result);
  const lt = vi.fn().mockReturnValue({ select });
  const del = vi.fn().mockReturnValue({ lt });
  const from = vi.fn(() => ({ delete: del }));
  admin.mockReturnValue({ from });
  return { from, delete: del, lt, select };
}

describe('delegation-bindings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes a one-hour TTL constant', () => {
    expect(DELEGATION_BINDING_TTL_SECONDS).toBe(3600);
  });

  describe('saveDelegationBinding', () => {
    it('upserts a snake_case binding idempotently on child_session_id', async () => {
      const { from, upsert } = mockUpsert({ data: null, error: null });

      const result = await saveDelegationBinding({
        childSessionId: CHILD_SESSION_ID,
        trustedPatientPhone: TRUSTED_PHONE,
      });

      expect(result).toEqual({ ok: true });
      expect(from).toHaveBeenCalledWith(TABLE);
      expect(upsert).toHaveBeenCalledTimes(1);
      const [payload, options] = upsert.mock.calls[0] as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      expect(payload).toMatchObject({
        child_session_id: CHILD_SESSION_ID,
        trusted_patient_phone: TRUSTED_PHONE,
      });
      expect(typeof payload.created_at).toBe('string');
      expect(options).toEqual({ onConflict: 'child_session_id' });
    });

    it('returns ok:false on a database error instead of throwing', async () => {
      mockUpsert({ data: null, error: { message: 'boom' } });

      await expect(
        saveDelegationBinding({
          childSessionId: CHILD_SESSION_ID,
          trustedPatientPhone: TRUSTED_PHONE,
        }),
      ).resolves.toEqual({ ok: false });
    });

    it('opportunistically purges expired bindings after a successful save', async () => {
      const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
      const select = vi.fn().mockResolvedValue({ data: ['child-1'], error: null });
      const lt = vi.fn().mockReturnValue({ select });
      const del = vi.fn().mockReturnValue({ lt });
      let call = 0;
      const from = vi.fn(() => {
        call += 1;
        return call === 1 ? { upsert } : { delete: del };
      });
      admin.mockReturnValue({ from });

      const result = await saveDelegationBinding({
        childSessionId: CHILD_SESSION_ID,
        trustedPatientPhone: TRUSTED_PHONE,
      });

      expect(result).toEqual({ ok: true });
      expect(del).toHaveBeenCalledTimes(1);
      const [, cutoff] = lt.mock.calls[0] as [string, string];
      expect(new Date(cutoff).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('does not fail the save when the opportunistic purge errors', async () => {
      const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
      const del = vi.fn().mockReturnValue({
        lt: vi.fn().mockReturnValue({
          select: vi.fn().mockRejectedValue(new Error('purge boom')),
        }),
      });
      let call = 0;
      const from = vi.fn(() => {
        call += 1;
        return call === 1 ? { upsert } : { delete: del };
      });
      admin.mockReturnValue({ from });

      await expect(
        saveDelegationBinding({
          childSessionId: CHILD_SESSION_ID,
          trustedPatientPhone: TRUSTED_PHONE,
        }),
      ).resolves.toEqual({ ok: true });
    });
  });

  describe('resolveDelegationBinding', () => {
    it('returns the stored phone for a known child session', async () => {
      const { from, select, eq } = mockResolve({
        data: { trusted_patient_phone: TRUSTED_PHONE },
        error: null,
      });

      const result = await resolveDelegationBinding(CHILD_SESSION_ID);

      expect(result).toEqual({ ok: true, phone: TRUSTED_PHONE });
      expect(from).toHaveBeenCalledWith(TABLE);
      expect(select).toHaveBeenCalledWith('trusted_patient_phone');
      expect(eq).toHaveBeenCalledWith('child_session_id', CHILD_SESSION_ID);
    });

    it('returns a null phone when there is no binding (not-found)', async () => {
      mockResolve({ data: null, error: null });

      await expect(resolveDelegationBinding(CHILD_SESSION_ID)).resolves.toEqual({
        ok: true,
        phone: null,
      });
    });

    it('returns ok:false on a database error so callers can refuse safely', async () => {
      mockResolve({ data: null, error: { message: 'db down' } });

      await expect(resolveDelegationBinding(CHILD_SESSION_ID)).resolves.toEqual({
        ok: false,
      });
    });

    it('never throws when the admin client itself throws', async () => {
      admin.mockReturnValue({
        from: () => {
          throw new Error('missing config');
        },
      });

      await expect(resolveDelegationBinding(CHILD_SESSION_ID)).resolves.toEqual({
        ok: false,
      });
    });
  });

  describe('deleteDelegationBinding', () => {
    it('deletes the row for the child session', async () => {
      const { from, eq } = mockDelete({ error: null });

      await expect(deleteDelegationBinding(CHILD_SESSION_ID)).resolves.toEqual({
        ok: true,
      });
      expect(from).toHaveBeenCalledWith(TABLE);
      expect(eq).toHaveBeenCalledWith('child_session_id', CHILD_SESSION_ID);
    });

    it('returns ok:false on error', async () => {
      mockDelete({ error: { message: 'nope' } });

      await expect(deleteDelegationBinding(CHILD_SESSION_ID)).resolves.toEqual({
        ok: false,
      });
    });
  });

  describe('purgeExpiredDelegationBindings', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('deletes rows older than the TTL cutoff and reports the count', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-06T08:00:00.000Z'));
      const { lt, select } = mockPurge({
        data: [{ child_session_id: 'old-1' }, { child_session_id: 'old-2' }],
        error: null,
      });

      const result = await purgeExpiredDelegationBindings();

      expect(result).toEqual({ ok: true, deleted: 2 });
      expect(lt).toHaveBeenCalledWith(
        'created_at',
        new Date('2026-10-06T07:00:00.000Z').toISOString(),
      );
      expect(select).toHaveBeenCalledWith('child_session_id');
    });

    it('accepts a custom max age in seconds and returns ok:false on error', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-06T08:00:00.000Z'));
      const { lt } = mockPurge({ data: null, error: { message: 'boom' } });

      const result = await purgeExpiredDelegationBindings(60);

      expect(result).toEqual({ ok: false, deleted: 0 });
      expect(lt).toHaveBeenCalledWith(
        'created_at',
        new Date('2026-10-06T07:59:00.000Z').toISOString(),
      );
    });
  });
});
