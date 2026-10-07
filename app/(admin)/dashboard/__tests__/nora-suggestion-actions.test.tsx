import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../nora-actions', () => ({
  acceptSuggestionAction: vi.fn(),
  rejectSuggestionAction: vi.fn(),
}));

import {
  acceptSuggestionAction,
  rejectSuggestionAction,
} from '../nora-actions';
import { NoraSuggestionActions } from '../components/NoraSuggestionActions';

describe('NoraSuggestionActions (confirmación humana en el panel)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('muestra los botones Aceptar y Rechazar para una propuesta', () => {
    render(<NoraSuggestionActions suggestionId="s1" />);

    expect(screen.getByRole('button', { name: 'Aceptar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument();
  });

  it('aceptar invoca la server action y muestra el resultado aplicado', async () => {
    vi.mocked(acceptSuggestionAction).mockResolvedValue({
      ok: true,
      appointmentId: 'appt-1',
    });
    const user = userEvent.setup();
    render(<NoraSuggestionActions suggestionId="s1" />);

    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    expect(acceptSuggestionAction).toHaveBeenCalledWith('s1');
    expect(
      await screen.findByText(/Reacomodo aplicado/)
    ).toBeInTheDocument();
  });

  it('un conflicto se muestra como estado, la cita sigue igual y la fila permanece', async () => {
    vi.mocked(acceptSuggestionAction).mockResolvedValue({
      ok: false,
      reason: 'conflict',
    });
    const user = userEvent.setup();
    render(<NoraSuggestionActions suggestionId="s1" />);

    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    expect(
      await screen.findByText(/El horario ya está ocupado/)
    ).toBeInTheDocument();
    // La fila sigue visible (los controles no desaparecen).
    expect(screen.getByRole('button', { name: 'Aceptar' })).toBeInTheDocument();
  });

  it('una cita movida se muestra como expirada sin aplicar', async () => {
    vi.mocked(acceptSuggestionAction).mockResolvedValue({
      ok: false,
      reason: 'expired',
    });
    const user = userEvent.setup();
    render(<NoraSuggestionActions suggestionId="s1" />);

    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    expect(await screen.findByText(/la sugerencia expiró/)).toBeInTheDocument();
  });

  it('TRIANGULATE: doble click en Aceptar solo decide una vez', async () => {
    let resolveAccept!: (value: { ok: true; appointmentId: string }) => void;
    vi.mocked(acceptSuggestionAction).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAccept = resolve;
        })
    );
    const user = userEvent.setup();
    render(<NoraSuggestionActions suggestionId="s1" />);

    const accept = screen.getByRole('button', { name: 'Aceptar' });
    await user.dblClick(accept);

    expect(acceptSuggestionAction).toHaveBeenCalledTimes(1);
    resolveAccept({ ok: true, appointmentId: 'appt-1' });
    await waitFor(() =>
      expect(screen.getByText(/Reacomodo aplicado/)).toBeInTheDocument()
    );
    expect(acceptSuggestionAction).toHaveBeenCalledTimes(1);
  });

  it('rechazar invoca la action de rechazo y nunca la de aplicación', async () => {
    vi.mocked(rejectSuggestionAction).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<NoraSuggestionActions suggestionId="s1" />);

    await user.click(screen.getByRole('button', { name: 'Rechazar' }));

    expect(rejectSuggestionAction).toHaveBeenCalledWith('s1');
    expect(acceptSuggestionAction).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Sugerencia rechazada/)
    ).toBeInTheDocument();
  });

  it('un fallo de la acción se muestra como error sin romper la fila', async () => {
    vi.mocked(acceptSuggestionAction).mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    render(<NoraSuggestionActions suggestionId="s1" />);

    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    expect(
      await screen.findByText(/No se pudo procesar la decisión/)
    ).toBeInTheDocument();
  });
});
