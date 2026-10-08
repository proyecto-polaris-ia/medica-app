// @vitest-environment node
/**
 * Unit tests for Mora's collections identity resolver.
 *
 * Priority contract (design §4):
 *   1. `ctx.session.auth` trusted WhatsApp phone (root/direct context).
 *   2. parent lineage → `child_session_id` binding created at delegation time.
 *   3. refusal with the security message.
 *
 * The resolver MUST never throw into the tool path: DB failures degrade to the
 * refusal, never to a disclosure.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveDelegationBinding = vi.fn();

vi.mock('@/lib/agent/delegation-bindings', () => ({
  resolveDelegationBinding,
  DELEGATION_BINDING_TTL_SECONDS: 3600,
}));

const {
  COLLECTIONS_SECURITY_REFUSAL,
  resolveCollectionsPatientPhone,
} = await import('../../../../agents/eva/agent/subagents/mora/identity');

const TRUSTED_PHONE = '+5215512345678';
const BOUND_PHONE = '+5215598765432';
const CHILD_SESSION_ID = 'child-session-mora-1';

function trustedCtx() {
  return {
    session: {
      id: 'root-session-1',
      auth: {
        current: {
          attributes: {
            trustedContactSource: 'whatsapp',
            trustedPatientPhone: TRUSTED_PHONE,
          },
        },
        initiator: null,
      },
    },
  };
}

function delegatedCtx() {
  return {
    session: {
      id: CHILD_SESSION_ID,
      parent: {
        sessionId: 'root-session-1',
        callId: 'call-1',
        rootSessionId: 'root-session-1',
        turn: { id: 'turn-1', sequence: 1 },
      },
      auth: { current: null, initiator: null },
    },
  };
}

function bareCtx() {
  return {
    session: {
      id: CHILD_SESSION_ID,
      auth: { current: null, initiator: null },
    },
  };
}

describe('resolveCollectionsPatientPhone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers the trusted phone on the session auth and never touches bindings', async () => {
    const result = await resolveCollectionsPatientPhone(trustedCtx());

    expect(result).toEqual({ phone: TRUSTED_PHONE });
    expect(resolveDelegationBinding).not.toHaveBeenCalled();
  });

  it('resolves a delegated child session through the child_session_id binding', async () => {
    resolveDelegationBinding.mockResolvedValue({ ok: true, phone: BOUND_PHONE });

    const result = await resolveCollectionsPatientPhone(delegatedCtx(), undefined, {
      attempts: 3,
      delayMs: 0,
    });

    expect(result).toEqual({ phone: BOUND_PHONE });
    expect(resolveDelegationBinding).toHaveBeenCalledTimes(1);
    expect(resolveDelegationBinding).toHaveBeenCalledWith(CHILD_SESSION_ID);
  });

  it('refuses when there is no auth phone and no parent session', async () => {
    const result = await resolveCollectionsPatientPhone(bareCtx());

    expect(result).toEqual({ error: COLLECTIONS_SECURITY_REFUSAL });
    expect(resolveDelegationBinding).not.toHaveBeenCalled();
  });

  it('retries the binding lookup before refusing (hook-insert race)', async () => {
    resolveDelegationBinding.mockResolvedValue({ ok: true, phone: null });

    const result = await resolveCollectionsPatientPhone(delegatedCtx(), undefined, {
      attempts: 3,
      delayMs: 0,
    });

    expect(result).toEqual({ error: COLLECTIONS_SECURITY_REFUSAL });
    expect(resolveDelegationBinding).toHaveBeenCalledTimes(3);
  });

  it('succeeds on a later retry when the binding lands late', async () => {
    resolveDelegationBinding
      .mockResolvedValueOnce({ ok: true, phone: null })
      .mockResolvedValueOnce({ ok: true, phone: BOUND_PHONE });

    const result = await resolveCollectionsPatientPhone(delegatedCtx(), undefined, {
      attempts: 3,
      delayMs: 0,
    });

    expect(result).toEqual({ phone: BOUND_PHONE });
    expect(resolveDelegationBinding).toHaveBeenCalledTimes(2);
  });

  it('fails closed on a binding DB error without retrying', async () => {
    resolveDelegationBinding.mockResolvedValue({ ok: false });

    const result = await resolveCollectionsPatientPhone(delegatedCtx(), undefined, {
      attempts: 3,
      delayMs: 0,
    });

    expect(result).toEqual({ error: COLLECTIONS_SECURITY_REFUSAL });
    expect(resolveDelegationBinding).toHaveBeenCalledTimes(1);
  });

  it('never throws when the binding lookup rejects', async () => {
    resolveDelegationBinding.mockRejectedValue(new Error('db exploded'));

    await expect(
      resolveCollectionsPatientPhone(delegatedCtx(), undefined, {
        attempts: 3,
        delayMs: 0,
      }),
    ).resolves.toEqual({ error: COLLECTIONS_SECURITY_REFUSAL });
  });

  it('uses the caller-supplied refusal message', async () => {
    const result = await resolveCollectionsPatientPhone(
      bareCtx(),
      'Mensaje de seguridad propio de la tool.',
    );

    expect(result).toEqual({ error: 'Mensaje de seguridad propio de la tool.' });
  });
});
