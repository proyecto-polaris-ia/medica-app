import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { AgendaView } from '../AgendaView';
import { clinicDayKey, getCurrentClinicMonth } from '@/lib/admin/timezone';
import type { CalendarBlock } from '@/lib/admin/timezone';

// Junio de 2026 empieza en lunes y tiene 30 días: los días 3 y 10 llevan citas
// y el resto queda vacío ("Sin citas").
const BLOCKS_BY_DAY: Record<string, CalendarBlock[]> = {
  '2026-06-10': [
    {
      id: 'appt-b',
      label: 'Ortodoncia — Paciente B',
      patientId: 'patient-b',
      patientName: 'Paciente B',
      serviceName: 'Ortodoncia',
      startLabel: '10:00',
      endLabel: '11:00',
      color: '#ff7f0e',
      status: 'no_show',
      providerName: 'Dr. Beto',
      notes: 'Traer radiografías',
    },
    {
      id: 'appt-a',
      label: 'Limpieza — Paciente A',
      patientId: 'patient-a',
      patientName: 'Paciente A',
      serviceName: 'Limpieza',
      startLabel: '09:00',
      endLabel: '09:30',
      color: '#1f77b4',
      status: 'confirmed',
      providerName: 'Dra. Ana',
    },
  ],
  '2026-06-03': [
    {
      id: 'appt-c',
      label: 'Revisión — Sin paciente',
      patientId: null,
      patientName: 'Sin paciente',
      serviceName: 'Revisión',
      startLabel: '15:00',
      endLabel: '16:00',
      color: '#7f7f7f',
      status: 'cancelled',
    },
  ],
};

function renderAgenda(
  props: Partial<ComponentProps<typeof AgendaView>> = {}
) {
  const onSelectBlock = vi.fn();
  const onSelectPatient = vi.fn();
  render(
    <AgendaView
      year={2026}
      month={6}
      blocksByDay={BLOCKS_BY_DAY}
      onSelectBlock={onSelectBlock}
      onSelectPatient={onSelectPatient}
      {...props}
    />
  );
  return { onSelectBlock, onSelectPatient };
}

function daySection(dayKey: string): HTMLElement {
  const section = document.querySelector<HTMLElement>(
    `[data-testid="agenda-day"][data-day-key="${dayKey}"]`
  );
  if (!section) throw new Error(`No agenda section for ${dayKey}`);
  return section;
}

const scrollSpy = vi.fn();

describe('AgendaView', () => {
  it('lists every day of the visible month with its weekday and date', () => {
    renderAgenda();

    const sections = screen.getAllByTestId('agenda-day');
    expect(sections).toHaveLength(30);

    const headings = screen.getAllByRole('heading');
    expect(headings[0]).toHaveTextContent(/lunes.*1 de junio de 2026/);
    expect(headings[2]).toHaveTextContent(/3 de junio de 2026/);
    expect(headings[9]).toHaveTextContent(/miércoles.*10 de junio de 2026/);
  });

  it('does not show days outside the visible month', () => {
    renderAgenda();

    const dayKeys = screen
      .getAllByTestId('agenda-day')
      .map((section) => section.getAttribute('data-day-key'));

    expect(dayKeys[0]).toBe('2026-06-01');
    expect(dayKeys[dayKeys.length - 1]).toBe('2026-06-30');
    expect(dayKeys.every((key) => key?.startsWith('2026-06-'))).toBe(true);
  });

  it('sorts the appointments of a day by start time ascending', () => {
    renderAgenda();

    const rows = within(daySection('2026-06-10')).getAllByTestId(
      'agenda-appointment'
    );
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      '09:00 Limpieza — Paciente A',
      '10:00 Ortodoncia — Paciente B',
    ]);
  });

  it('shows start-end time, patient, service, provider and status per row', () => {
    renderAgenda();

    const row = screen.getByRole('button', {
      name: /09:00 Limpieza — Paciente A/,
    });
    expect(row).toHaveTextContent(/09:00.?09:30/);
    expect(row).toHaveTextContent('Limpieza');
    expect(row).toHaveTextContent('Dra. Ana');
    expect(row).toHaveTextContent('Confirmada');
    expect(
      within(row).getByRole('button', {
        name: 'Ver expediente de Paciente A',
      })
    ).toBeInTheDocument();
  });

  it('renders Spanish status labels for the statuses on screen', () => {
    renderAgenda();

    expect(
      screen.getByRole('button', { name: /09:00 Limpieza/ })
    ).toHaveTextContent('Confirmada');
    expect(
      screen.getByRole('button', { name: /10:00 Ortodoncia/ })
    ).toHaveTextContent('No asistió');
    expect(
      screen.getByRole('button', { name: /15:00 Revisión/ })
    ).toHaveTextContent('Cancelada');
  });

  it('shows the notes when present and omits them otherwise', () => {
    renderAgenda();

    expect(
      screen.getByRole('button', { name: /10:00 Ortodoncia/ })
    ).toHaveTextContent('Traer radiografías');
    expect(
      screen.getByRole('button', { name: /09:00 Limpieza/ })
    ).not.toHaveTextContent('Traer radiografías');
  });

  it('shows "Sin citas" on empty days and keeps the days with appointments', () => {
    renderAgenda();

    expect(within(daySection('2026-06-05')).getByText('Sin citas')).toBeInTheDocument();
    expect(
      within(daySection('2026-06-10')).queryByText('Sin citas')
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /09:00 Limpieza/ })
    ).toBeInTheDocument();
  });

  it('selects the block when a row is activated', async () => {
    const { onSelectBlock, onSelectPatient } = renderAgenda();

    await userEvent.click(
      screen.getByRole('button', { name: /09:00 Limpieza — Paciente A/ })
    );

    expect(onSelectBlock).toHaveBeenCalledWith('appt-a');
    expect(onSelectPatient).not.toHaveBeenCalled();
  });

  it('selects the block with the keyboard (Enter)', async () => {
    const { onSelectBlock } = renderAgenda();

    const row = screen.getByRole('button', {
      name: /09:00 Limpieza — Paciente A/,
    });
    row.focus();
    await userEvent.keyboard('{Enter}');

    expect(onSelectBlock).toHaveBeenCalledWith('appt-a');
  });

  it('selects the patient without selecting the block', async () => {
    const { onSelectBlock, onSelectPatient } = renderAgenda();

    await userEvent.click(
      screen.getByRole('button', { name: 'Ver expediente de Paciente A' })
    );

    expect(onSelectPatient).toHaveBeenCalledWith('patient-a');
    expect(onSelectBlock).not.toHaveBeenCalled();
  });

  it('renders a patient without an id as plain text', () => {
    renderAgenda();

    const row = screen.getByRole('button', { name: /15:00 Revisión/ });
    expect(
      within(row).queryByRole('button', { name: /Ver expediente/ })
    ).not.toBeInTheDocument();
    expect(row).toHaveTextContent('Sin paciente');
  });

  it('renders a vertical scroll container and responsive rows', () => {
    renderAgenda();

    const scroll = screen.getByTestId('agenda-scroll');
    expect(scroll.className).toContain('overflow-y-auto');
    expect(scroll.className).toContain('max-h-[70vh]');

    const row = screen.getAllByTestId('agenda-appointment')[0];
    expect(row.className).toContain('flex-col');
    expect(row.className).toContain('sm:flex-row');
  });
});

describe('AgendaView "Hoy" button', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = scrollSpy;
  });

  afterEach(() => {
    scrollSpy.mockClear();
  });

  it('scrolls to the current clinic day when it belongs to the visible month', async () => {
    const { year, month } = getCurrentClinicMonth();
    renderAgenda({ year, month });

    await userEvent.click(screen.getByRole('button', { name: 'Hoy' }));

    const todayKey = clinicDayKey(new Date().toISOString());
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledWith({
      block: 'start',
      behavior: 'smooth',
    });
    expect(scrollSpy.mock.instances[0]).toBe(daySection(todayKey));
  });

  it('does nothing and stays usable when the current day is outside the month', async () => {
    renderAgenda({ year: 2000, month: 1 });

    await userEvent.click(screen.getByRole('button', { name: 'Hoy' }));

    expect(scrollSpy).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('agenda-day')).toHaveLength(31);
  });
});
