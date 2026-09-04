import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MonthCalendar } from '../MonthCalendar';
import { CalendarNav } from '../CalendarNav';
import { ProviderLegend } from '../ProviderLegend';
import type { CalendarBlock } from '@/lib/admin/timezone';

describe('MonthCalendar', () => {
  const blocksByDay: Record<string, CalendarBlock[]> = {
    '2026-06-10': [
      {
        id: 'appt-1',
        label: 'Limpieza — Paciente A',
        startLabel: '09:00',
        color: '#1f77b4',
        status: 'confirmed',
      },
    ],
  };

  it('renders 42 day cells and 7 weekday headers', () => {
    render(
      <MonthCalendar
        year={2026}
        month={6}
        blocksByDay={blocksByDay}
        onSelectBlock={vi.fn()}
      />
    );

    expect(screen.getAllByTestId(/calendar-day/)).toHaveLength(42);
    expect(screen.getAllByTestId('weekday-label')).toHaveLength(7);
  });

  it('flags padding cells outside the current month', () => {
    render(
      <MonthCalendar
        year={2026}
        month={6}
        blocksByDay={{}}
        onSelectBlock={vi.fn()}
      />
    );

    const paddingCells = screen.getAllByTestId('calendar-day-padding');
    expect(paddingCells.length).toBeGreaterThan(0);
    paddingCells.forEach((cell) => {
      expect(cell).toHaveTextContent('');
    });
  });

  it('renders a chip with the provider color on the correct day', () => {
    render(
      <MonthCalendar
        year={2026}
        month={6}
        blocksByDay={blocksByDay}
        onSelectBlock={vi.fn()}
      />
    );

    const chip = screen.getByRole('button', { name: /09:00 Limpieza/ });
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveStyle({ backgroundColor: '#1f77b4' });
  });

  it('calls onSelectBlock when a chip is clicked', async () => {
    const onSelectBlock = vi.fn();
    render(
      <MonthCalendar
        year={2026}
        month={6}
        blocksByDay={blocksByDay}
        onSelectBlock={onSelectBlock}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /09:00 Limpieza/ }));
    expect(onSelectBlock).toHaveBeenCalledWith('appt-1');
  });

  it('uses the fallback color for a provider without a color', () => {
    render(
      <MonthCalendar
        year={2026}
        month={6}
        blocksByDay={{
          '2026-06-11': [
            {
              id: 'appt-2',
              label: 'Consulta — Paciente B',
              startLabel: '10:00',
              color: '#64748b',
              status: 'confirmed',
            },
          ],
        }}
        onSelectBlock={vi.fn()}
      />
    );

    const chip = screen.getByRole('button', { name: /10:00 Consulta/ });
    expect(chip).toHaveStyle({ backgroundColor: '#64748b' });
  });

  it('dims cancelled and no_show chips', () => {
    render(
      <MonthCalendar
        year={2026}
        month={6}
        blocksByDay={{
          '2026-06-12': [
            {
              id: 'appt-3',
              label: 'Cancelada',
              startLabel: '11:00',
              color: '#1f77b4',
              status: 'cancelled',
            },
          ],
        }}
        onSelectBlock={vi.fn()}
      />
    );

    const chip = screen.getByRole('button', { name: /11:00 Cancelada/ });
    expect(chip.className).toContain('opacity');
  });
});

describe('CalendarNav', () => {
  it('navigates to previous and next month', async () => {
    const onChange = vi.fn();
    render(<CalendarNav year={2026} month={6} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: /Mes anterior/ }));
    expect(onChange).toHaveBeenCalledWith(2026, 5);

    await userEvent.click(screen.getByRole('button', { name: /Mes siguiente/ }));
    expect(onChange).toHaveBeenCalledWith(2026, 7);
  });

  it('wraps year when navigating past December or before January', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CalendarNav year={2026} month={12} onChange={onChange} />
    );

    await userEvent.click(screen.getByRole('button', { name: /Mes siguiente/ }));
    expect(onChange).toHaveBeenCalledWith(2027, 1);

    rerender(<CalendarNav year={2026} month={1} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /Mes anterior/ }));
    expect(onChange).toHaveBeenCalledWith(2025, 12);
  });

  it('changes year via the year selector', async () => {
    const onChange = vi.fn();
    render(<CalendarNav year={2026} month={6} onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText(/Año/), '2027');
    expect(onChange).toHaveBeenCalledWith(2027, 6);
  });
});

describe('ProviderLegend', () => {
  it('renders each provider with its color swatch', () => {
    render(
      <ProviderLegend
        providers={[
          { id: 'p1', name: 'Dra. Ana', color: '#1f77b4' },
          { id: 'p2', name: 'Dr. Luis', color: null },
        ]}
      />
    );

    expect(screen.getByText('Dra. Ana')).toBeInTheDocument();
    expect(screen.getByText('Dr. Luis')).toBeInTheDocument();

    const swatches = screen.getAllByTestId('legend-swatch');
    expect(swatches[0]).toHaveStyle({ backgroundColor: '#1f77b4' });
    expect(swatches[1]).toHaveStyle({ backgroundColor: '#64748b' });
  });
});
