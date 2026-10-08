import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DayAppointmentsModal } from '../DayAppointmentsModal';
import type { CalendarBlock } from '@/lib/admin/timezone';

const DAY_KEY = '2026-10-05';

// Fixture desordenada a propósito: el modal debe ordenar por hora de inicio.
const blocks: CalendarBlock[] = [
  {
    id: 'appt-5',
    label: 'Blanqueamiento — Elena Paz',
    patientId: 'patient-5',
    patientName: 'Elena Paz',
    serviceName: 'Blanqueamiento',
    startLabel: '15:00',
    color: '#8c564b',
    status: 'attended',
    providerName: 'Dra. Ana',
    notes: 'Pago pendiente',
  },
  {
    id: 'appt-1',
    label: 'Limpieza — Ana López',
    patientId: 'patient-1',
    patientName: 'Ana López',
    serviceName: 'Limpieza',
    startLabel: '09:00',
    color: '#1f77b4',
    status: 'confirmed',
    providerName: 'Dra. Ana',
    notes: 'Primera visita',
  },
  {
    id: 'appt-4',
    label: 'Ortodoncia — Diana Gil',
    patientId: 'patient-4',
    patientName: 'Diana Gil',
    serviceName: 'Ortodoncia',
    startLabel: '13:00',
    color: '#9467bd',
    status: 'no_show',
    providerName: 'Dr. Luis',
  },
  {
    id: 'appt-2',
    label: 'Consulta — Beto Ruiz',
    patientId: 'patient-2',
    patientName: 'Beto Ruiz',
    serviceName: 'Consulta',
    startLabel: '10:30',
    color: '#2ca02c',
    status: 'pending',
    providerName: 'Dr. Luis',
    notes: null,
  },
  {
    id: 'appt-6',
    label: 'Revisión — Sin paciente',
    patientId: null,
    patientName: 'Sin paciente',
    serviceName: 'Revisión',
    startLabel: '16:30',
    color: '#7f7f7f',
    status: 'rescheduled',
    providerName: 'Dr. Luis',
  },
  {
    id: 'appt-3',
    label: 'Endodoncia — Carla Díaz',
    patientId: 'patient-3',
    patientName: 'Carla Díaz',
    serviceName: 'Endodoncia',
    startLabel: '11:00',
    color: '#d62728',
    status: 'cancelled',
    providerName: 'Dra. Ana',
  },
];

function renderModal() {
  const onClose = vi.fn();
  const onSelectBlock = vi.fn();
  const onSelectPatient = vi.fn();
  render(
    <DayAppointmentsModal
      dayKey={DAY_KEY}
      blocks={blocks}
      onClose={onClose}
      onSelectBlock={onSelectBlock}
      onSelectPatient={onSelectPatient}
    />
  );
  return { onClose, onSelectBlock, onSelectPatient };
}

function visibleTimes(): string[] {
  return screen
    .getAllByRole('button')
    .map((element) => element.getAttribute('aria-label') ?? '')
    .map((label) => label.slice(0, 5))
    .filter((time) => /^\d{2}:\d{2}$/.test(time));
}

describe('DayAppointmentsModal', () => {
  it('renders an accessible dialog labelled by the day title', () => {
    renderModal();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName(/5 de octubre de 2026/);
    expect(within(dialog).getByRole('heading')).toHaveTextContent(/octubre de 2026/);
  });

  it('shows the date in es-MX built from the dayKey', () => {
    renderModal();

    const heading = screen.getByRole('heading');
    expect(heading).toHaveTextContent(/lunes/);
    expect(heading).toHaveTextContent(/5/);
    expect(heading).toHaveTextContent(/octubre/);
    expect(heading).toHaveTextContent(/2026/);
  });

  it('lists every block of the day sorted by start time ascending', () => {
    renderModal();

    expect(visibleTimes()).toEqual([
      '09:00',
      '10:30',
      '11:00',
      '13:00',
      '15:00',
      '16:30',
    ]);
  });

  it('shows time, patient, service, provider, status and notes per row', () => {
    renderModal();

    const row = screen.getByRole('button', { name: /09:00/ });
    expect(row).toHaveTextContent('09:00');
    expect(row).toHaveTextContent('Limpieza');
    expect(row).toHaveTextContent('Dra. Ana');
    expect(row).toHaveTextContent('Confirmada');
    expect(row).toHaveTextContent('Primera visita');
    expect(
      within(row).getByRole('button', { name: 'Ver expediente de Ana López' })
    ).toBeInTheDocument();
  });

  it('renders Spanish status labels for every status', () => {
    renderModal();

    expect(screen.getByRole('button', { name: /10:30/ })).toHaveTextContent(
      'Sin confirmar'
    );
    expect(screen.getByRole('button', { name: /11:00/ })).toHaveTextContent(
      'Cancelada'
    );
    expect(screen.getByRole('button', { name: /13:00/ })).toHaveTextContent(
      'No asistió'
    );
    expect(screen.getByRole('button', { name: /15:00/ })).toHaveTextContent(
      'Atendida'
    );
    expect(screen.getByRole('button', { name: /16:30/ })).toHaveTextContent(
      'Reagendada'
    );
  });

  it('omits notes when the appointment has none', () => {
    renderModal();

    const row = screen.getByRole('button', { name: /10:30/ });
    expect(row).not.toHaveTextContent('Primera visita');
    expect(row).not.toHaveTextContent('Pago pendiente');
  });

  it('selects the patient and closes when the patient name is activated', async () => {
    const { onClose, onSelectBlock, onSelectPatient } = renderModal();

    await userEvent.click(
      screen.getByRole('button', { name: 'Ver expediente de Ana López' })
    );

    expect(onSelectPatient).toHaveBeenCalledWith('patient-1');
    expect(onClose).toHaveBeenCalled();
    expect(onSelectBlock).not.toHaveBeenCalled();
  });

  it('selects the block and closes when a row is activated', async () => {
    const { onClose, onSelectBlock } = renderModal();

    const row = screen.getByRole('button', { name: /13:00/ });
    await userEvent.click(within(row).getByText('13:00'));

    expect(onSelectBlock).toHaveBeenCalledWith('appt-4');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const { onClose } = renderModal();

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  it('closes on backdrop click but not on panel click', async () => {
    const { onClose } = renderModal();
    const dialog = screen.getByRole('dialog');
    const backdrop = dialog.parentElement as HTMLElement;

    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    await userEvent.click(screen.getByRole('heading'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes with the ✕ button', async () => {
    const { onClose } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('moves focus to the close button and traps Tab inside the dialog', async () => {
    renderModal();

    const dialog = screen.getByRole('dialog');
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();

    const focusables = dialog.querySelectorAll(
      'button, [tabindex]:not([tabindex="-1"])'
    );
    for (let i = 0; i < focusables.length + 1; i++) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });
});
