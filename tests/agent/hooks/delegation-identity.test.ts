// @vitest-environment node
/**
 * Unit tests for the root delegation-identity hook.
 *
 * Contract (design §4.1–4.4):
 *   - subscribe to `subagent.called`;
 *   - only bind when the delegated subagent is `mora` and the event carries a
 *     child session id;
 *   - read the trusted phone from the root session auth attributes (current or
 *     initiator), the same convention as `agents/eva/agent/trusted-contact-context.ts`;
 *   - swallow-and-log on any failure (delegation continues; tools refuse).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const saveDelegationBinding = vi.fn();

vi.mock('@/lib/agent/delegation-bindings', () => ({
  saveDelegationBinding,
  DELEGATION_BINDING_TTL_SECONDS: 3600,
}));

const hookModule = await import('../../../agents/eva/agent/hooks/delegation-identity');
const { extractMoraChildSessionId, readTrustedPatientPhone } = hookModule;
const hook = hookModule.default;

type Handler = (event: unknown, ctx: unknown) => void | Promise<void>;

const handler = (
  hook.events as Record<string, Handler | undefined>
)['subagent.called'] as Handler;

const CHILD_SESSION_ID = 'child-session-mora-1';
const TRUSTED_PHONE = '+5215512345678';

function rootCtx(attributes: Record<string, string> | null = {
  trustedContactSource: 'whatsapp',
  trustedPatientPhone: TRUSTED_PHONE,
}) {
  return {
    session: {
      id: 'root-session-1',
      auth: {
        current: attributes ? { attributes } : null,
        initiator: null,
      },
    },
  };
}

describe('extractMoraChildSessionId', () => {
  it('returns the child session id for a mora delegation by name', () => {
    expect(
      extractMoraChildSessionId({
        data: { name: 'mora', childSessionId: CHILD_SESSION_ID },
      }),
    ).toBe(CHILD_SESSION_ID);
  });

  it('accepts the lowered tool name as the subagent identity', () => {
    expect(
      extractMoraChildSessionId({
        data: { toolName: 'mora', childSessionId: CHILD_SESSION_ID },
      }),
    ).toBe(CHILD_SESSION_ID);
  });

  it('ignores delegations to other subagents', () => {
    expect(
      extractMoraChildSessionId({
        data: { name: 'clara', childSessionId: CHILD_SESSION_ID },
      }),
    ).toBeUndefined();
  });

  it('returns undefined when the event has no child session id or is malformed', () => {
    expect(extractMoraChildSessionId({ data: { name: 'mora' } })).toBeUndefined();
    expect(extractMoraChildSessionId({ data: { name: 'mora', childSessionId: '  ' } })).toBeUndefined();
    expect(extractMoraChildSessionId({})).toBeUndefined();
    expect(extractMoraChildSessionId(null)).toBeUndefined();
    expect(extractMoraChildSessionId(undefined)).toBeUndefined();
    expect(extractMoraChildSessionId({ data: null })).toBeUndefined();
  });
});

describe('readTrustedPatientPhone', () => {
  it('reads the trusted phone from the current auth attributes', () => {
    expect(readTrustedPatientPhone(rootCtx())).toBe(TRUSTED_PHONE);
  });

  it('reads the trusted phone from the initiator auth attributes', () => {
    const ctx = {
      session: {
        auth: {
          current: null,
          initiator: {
            attributes: {
              trustedContactSource: 'whatsapp',
              trustedPatientPhone: TRUSTED_PHONE,
            },
          },
        },
      },
    };

    expect(readTrustedPatientPhone(ctx)).toBe(TRUSTED_PHONE);
  });

  it('returns undefined without whatsapp-trusted attributes', () => {
    expect(readTrustedPatientPhone(rootCtx(null))).toBeUndefined();
    expect(
      readTrustedPatientPhone(rootCtx({ trustedPatientPhone: TRUSTED_PHONE })),
    ).toBeUndefined();
  });
});

describe('delegation-identity hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveDelegationBinding.mockResolvedValue({ ok: true });
  });

  it('persists the binding for a mora delegation from an authenticated root session', async () => {
    await handler(
      { data: { name: 'mora', childSessionId: CHILD_SESSION_ID } },
      rootCtx(),
    );

    expect(saveDelegationBinding).toHaveBeenCalledTimes(1);
    expect(saveDelegationBinding).toHaveBeenCalledWith({
      childSessionId: CHILD_SESSION_ID,
      trustedPatientPhone: TRUSTED_PHONE,
    });
  });

  it('does nothing for non-mora delegations', async () => {
    await handler(
      { data: { name: 'eva', childSessionId: CHILD_SESSION_ID } },
      rootCtx(),
    );

    expect(saveDelegationBinding).not.toHaveBeenCalled();
  });

  it('does nothing when the root session carries no trusted phone', async () => {
    await handler(
      { data: { name: 'mora', childSessionId: CHILD_SESSION_ID } },
      rootCtx(null),
    );

    expect(saveDelegationBinding).not.toHaveBeenCalled();
  });

  it('swallows and logs when the persistence rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    saveDelegationBinding.mockRejectedValue(new Error('db down'));

    await expect(
      handler(
        { data: { name: 'mora', childSessionId: CHILD_SESSION_ID } },
        rootCtx(),
      ),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('swallows and logs when persistence reports a failure result', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    saveDelegationBinding.mockResolvedValue({ ok: false });

    await expect(
      handler(
        { data: { name: 'mora', childSessionId: CHILD_SESSION_ID } },
        rootCtx(),
      ),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
