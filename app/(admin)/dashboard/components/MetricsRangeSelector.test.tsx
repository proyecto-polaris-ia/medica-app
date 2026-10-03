import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));

import { MetricsRangeSelector } from './MetricsRangeSelector';

describe('MetricsRangeSelector', () => {
  beforeEach(() => {
    push.mockReset();
  });

  it('empuja el preset seleccionado a la URL', async () => {
    const user = userEvent.setup();
    render(<MetricsRangeSelector preset="month" />);

    await user.click(screen.getByRole('button', { name: 'Esta semana' }));

    expect(push).toHaveBeenCalledWith('/dashboard?preset=week');
  });

  it('empuja el rango personalizado con from/to', async () => {
    const user = userEvent.setup();
    render(<MetricsRangeSelector preset="month" />);

    fireEvent.change(screen.getByLabelText('Desde'), {
      target: { value: '2026-10-05' },
    });
    fireEvent.change(screen.getByLabelText('Hasta'), {
      target: { value: '2026-10-07' },
    });
    await user.click(screen.getByRole('button', { name: 'Aplicar rango' }));

    expect(push).toHaveBeenCalledWith(
      '/dashboard?preset=custom&from=2026-10-05&to=2026-10-07'
    );
  });

  it('no navega cuando el rango personalizado está incompleto', async () => {
    const user = userEvent.setup();
    render(<MetricsRangeSelector preset="month" />);

    await user.click(screen.getByRole('button', { name: 'Aplicar rango' }));

    expect(push).not.toHaveBeenCalled();
  });
});
