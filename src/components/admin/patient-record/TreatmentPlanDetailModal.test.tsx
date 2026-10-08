import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TreatmentPlanDetailModal } from './TreatmentPlanDetailModal';
import type { TreatmentPlanWithItems } from '@/lib/admin/types';

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PROVIDER_ID = '660e8400-e29b-41d4-a716-446655440000';
const PLAN_ID = '770e8400-e29b-41d4-a716-446655440000';
const SERVICE_ID = '990e8400-e29b-41d4-a716-446655440000';

const DRAFT_PLAN: TreatmentPlanWithItems = {
  id: PLAN_ID,
  patientId: PATIENT_ID,
  providerId: PROVIDER_ID,
  clinicalVisitId: null,
  name: 'Plan inicial',
  status: 'draft',
  totalAmount: 1500,
  acceptedAt: null,
  notes: null,
  createdAt: '2026-09-10T10:00:00Z',
  updatedAt: '2026-09-10T10:00:00Z',
  items: [
    {
      id: 'item-1',
      treatmentPlanId: PLAN_ID,
      description: 'Limpieza',
      serviceId: SERVICE_ID,
      tooth: '16',
      quantity: 1,
      unitPrice: 1500,
      status: 'pending',
      createdAt: '2026-09-10T10:00:00Z',
      updatedAt: '2026-09-10T10:00:00Z',
    },
  ],
};

// Snapshot guardado ($1,500.00) distinto de la suma de ítems ($1,400.00).
const ACCEPTED_PLAN: TreatmentPlanWithItems = {
  ...DRAFT_PLAN,
  status: 'accepted',
  totalAmount: 1500,
  acceptedAt: '2026-09-15T10:00:00Z',
  notes: 'Paciente aceptó el plan',
  items: [
    { ...DRAFT_PLAN.items[0], id: 'item-1', description: 'Limpieza', tooth: '16', quantity: 2, unitPrice: 600, status: 'done' },
    { ...DRAFT_PLAN.items[0], id: 'item-2', description: 'Resina', tooth: null, quantity: 2, unitPrice: 100, status: 'pending' },
  ],
};

function buildFetchMock({ treatmentPlan = DRAFT_PLAN }: { treatmentPlan?: TreatmentPlanWithItems } = {}) {
  return vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
    const urlString = url.toString();
    if (urlString === `/api/admin/patients/${PATIENT_ID}/treatment-plans/${PLAN_ID}` && !init?.method) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ treatmentPlan }) });
    }
    return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
  });
}

type ModalProps = ComponentProps<typeof TreatmentPlanDetailModal>;

function renderModal({ onClose = vi.fn(), ...props }: Partial<ModalProps> = {}) {
  return render(
    <TreatmentPlanDetailModal
      patientId={PATIENT_ID}
      planId={PLAN_ID}
      providerName="Dra. Ana"
      onClose={onClose}
      {...props}
    />
  );
}

describe('TreatmentPlanDetailModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = buildFetchMock();
  });

  it('shows a loading state while the plan request is in flight', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

    renderModal();

    expect(screen.getByText('Cargando plan de tratamiento...')).toBeInTheDocument();
  });

  it('renders plan name, status, provider, creation date, acceptance date and notes', async () => {
    global.fetch = buildFetchMock({ treatmentPlan: ACCEPTED_PLAN });

    renderModal();

    expect(await screen.findByText('Limpieza')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Plan inicial' })).toBeInTheDocument();
    expect(screen.getByText('Aceptado')).toBeInTheDocument();
    expect(screen.getByText('Dra. Ana')).toBeInTheDocument();
    expect(screen.getByText('10 sep 2026')).toBeInTheDocument();
    expect(screen.getByText('15 sep 2026')).toBeInTheDocument();
    expect(screen.getByText('Paciente aceptó el plan')).toBeInTheDocument();
  });

  it('does not render acceptance date or notes when they are null', async () => {
    renderModal();

    expect(await screen.findByText('Limpieza')).toBeInTheDocument();
    expect(screen.queryByText('Fecha de aceptación')).not.toBeInTheDocument();
    expect(screen.queryByText('Notas')).not.toBeInTheDocument();
  });

  it('lists items with description, FDI tooth, quantity, unit price, line cost and item status', async () => {
    global.fetch = buildFetchMock({ treatmentPlan: ACCEPTED_PLAN });

    renderModal();

    const table = await screen.findByRole('table');

    const limpiezaRow = within(table).getByText('Limpieza').closest('tr') as HTMLElement;
    expect(within(limpiezaRow).getByText('16')).toBeInTheDocument();
    expect(within(limpiezaRow).getByText('2')).toBeInTheDocument();
    expect(within(limpiezaRow).getByText('$600.00')).toBeInTheDocument();
    expect(within(limpiezaRow).getByText('$1,200.00')).toBeInTheDocument();
    expect(within(limpiezaRow).getByText('Realizado')).toBeInTheDocument();

    const resinaRow = within(table).getByText('Resina').closest('tr') as HTMLElement;
    expect(within(resinaRow).getByText('—')).toBeInTheDocument();
    expect(within(resinaRow).getByText('2')).toBeInTheDocument();
    expect(within(resinaRow).getByText('$100.00')).toBeInTheDocument();
    expect(within(resinaRow).getByText('$200.00')).toBeInTheDocument();
    expect(within(resinaRow).getByText('Pendiente')).toBeInTheDocument();
  });

  it('shows the items subtotal and the stored total as distinct values, without discount or tax lines', async () => {
    global.fetch = buildFetchMock({ treatmentPlan: ACCEPTED_PLAN });

    renderModal();

    expect(await screen.findByText('Limpieza')).toBeInTheDocument();

    const subtotalBlock = screen.getByText('Subtotal').parentElement as HTMLElement;
    const totalBlock = screen.getByText('Total').parentElement as HTMLElement;

    expect(within(subtotalBlock).getByText('$1,400.00')).toBeInTheDocument();
    expect(within(totalBlock).getByText('$1,500.00')).toBeInTheDocument();

    expect(screen.queryByText(/descuento/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/impuesto/i)).not.toBeInTheDocument();
  });

  it('offers editing for a draft plan and reports the plan id', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();

    renderModal({ onEdit });

    await screen.findByText('Limpieza');
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    expect(onEdit).toHaveBeenCalledWith(PLAN_ID);
  });

  it('is read-only for non-draft plans', async () => {
    global.fetch = buildFetchMock({ treatmentPlan: ACCEPTED_PLAN });

    renderModal({ onEdit: vi.fn() });

    expect(await screen.findByText('Limpieza')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /presentar|aceptar|iniciar|completar|volver/i })
    ).not.toBeInTheDocument();
  });

  it('closes with the X button', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderModal({ onClose });

    await screen.findByText('Limpieza');
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when clicking the overlay but not when clicking inside the panel', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderModal({ onClose });

    await screen.findByText('Limpieza');

    const dialog = screen.getByRole('dialog');
    await user.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    await user.click(dialog.parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderModal({ onClose });

    await screen.findByText('Limpieza');
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows an error with retry and close when the fetch fails', async () => {
    const failingFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });
    global.fetch = failingFetch as unknown as typeof fetch;

    const onClose = vi.fn();
    const user = userEvent.setup();

    renderModal({ onClose });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/error/i);

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(failingFetch).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('exposes dialog semantics, focus on open and a labelled close button', async () => {
    renderModal();

    await screen.findByText('Limpieza');

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const titleId = dialog.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    expect(document.getElementById(titleId as string)).toHaveTextContent('Plan inicial');

    const closeButton = screen.getByRole('button', { name: 'Cerrar' });
    expect(closeButton).toHaveAttribute('aria-label', 'Cerrar');
    expect(closeButton).toHaveFocus();
  });
});
