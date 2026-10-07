import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/auth', () => ({ requireUser: vi.fn() }));
vi.mock('@/lib/admin/nora/apply', () => ({
  applyAcceptedSuggestion: vi.fn(),
  rejectSuggestion: vi.fn(),
}));

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/supabase/auth';
import {
  applyAcceptedSuggestion,
  rejectSuggestion,
} from '@/lib/admin/nora/apply';
import {
  acceptSuggestionAction,
  rejectSuggestionAction,
} from '../nora-actions';

const USER = { id: 'user-1' };

describe('nora-actions (confirmación humana)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireUser).mockResolvedValue(USER as never);
  });

  it('aceptar exige un administrador autenticado y usa su id como decided_by', async () => {
    vi.mocked(applyAcceptedSuggestion).mockResolvedValue({
      ok: true,
      appointmentId: 'appt-1',
    });

    const result = await acceptSuggestionAction('suggestion-1');

    expect(requireUser).toHaveBeenCalledTimes(1);
    expect(applyAcceptedSuggestion).toHaveBeenCalledWith({
      suggestionId: 'suggestion-1',
      decidedBy: 'user-1',
      occurredAt: expect.any(Date),
    });
    expect(result).toEqual({ ok: true, appointmentId: 'appt-1' });
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard');
  });

  it('sin usuario autenticado la acción lanza y no muta nada', async () => {
    vi.mocked(requireUser).mockRejectedValue(new Error('Unauthorized'));

    await expect(acceptSuggestionAction('suggestion-1')).rejects.toThrow(
      'Unauthorized'
    );

    expect(applyAcceptedSuggestion).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('propaga el resultado de la aplicación (expirada/conflicto) sin romper', async () => {
    vi.mocked(applyAcceptedSuggestion).mockResolvedValue({
      ok: false,
      reason: 'conflict',
    });

    const result = await acceptSuggestionAction('suggestion-1');

    expect(result).toEqual({ ok: false, reason: 'conflict' });
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard');
  });

  it('una sugerencia ya decidida no se re-decide', async () => {
    vi.mocked(applyAcceptedSuggestion).mockResolvedValue({
      ok: false,
      reason: 'already_decided',
    });

    const result = await acceptSuggestionAction('suggestion-1');

    expect(result).toEqual({ ok: false, reason: 'already_decided' });
  });

  it('rechazar exige usuario, registra la decisión y NO aplica ningún reacomodo', async () => {
    vi.mocked(rejectSuggestion).mockResolvedValue({ ok: true });

    const result = await rejectSuggestionAction('suggestion-1');

    expect(requireUser).toHaveBeenCalledTimes(1);
    expect(rejectSuggestion).toHaveBeenCalledWith({
      suggestionId: 'suggestion-1',
      decidedBy: 'user-1',
      decidedAt: expect.any(Date),
    });
    // Rechazar nunca invoca la ruta de aplicación.
    expect(applyAcceptedSuggestion).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard');
  });

  it('rechazar sin usuario autenticado lanza y no muta nada', async () => {
    vi.mocked(requireUser).mockRejectedValue(new Error('Unauthorized'));

    await expect(rejectSuggestionAction('suggestion-1')).rejects.toThrow(
      'Unauthorized'
    );

    expect(rejectSuggestion).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
