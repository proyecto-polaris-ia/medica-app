import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientPaymentsTab } from './PatientPaymentsTab';
import type { PatientReceivableSummary, Payment } from '@/lib/admin/types';

const PATIENT_ID = 'patient-1';

const summary: PatientReceivableSummary = {
  patientId: PATIENT_ID,
  totalEligibleAmount: 1800,
  paidAmount: 550,
  unallocatedPaidAmount: 200,
  balance: 1250,
  creditAmount: 0,
  lastPaymentAt: '2026-09-15T10:00:00Z',
  planBalances: [
    {
      treatmentPlanId: 'plan-1',
      name: 'Ortodoncia inicial',
      status: 'accepted',
      totalAmount: 1000,
      paidAmount: 300,
      balance: 700,
      baseDate: '2026-08-01T10:00:00Z',
      baseDateSource: 'accepted_at',
      daysPastDue: 45,
      isPastDue: true,
    },
    {
      treatmentPlanId: 'plan-2',
      name: 'Limpieza profunda',
      status: 'in_progress',
      totalAmount: 800,
      paidAmount: 50,
      balance: 750,
      baseDate: '2026-09-01T10:00:00Z',
      baseDateSource: 'created_at',
      daysPastDue: 14,
      isPastDue: false,
    },
  ],
};

const payments: Payment[] = [
  {
    id: 'payment-1',
    patientId: PATIENT_ID,
    treatmentPlanId: 'plan-1',
    amount: 300,
    method: 'cash',
    paidAt: '2026-09-15T10:00:00Z',
    reference: 'REC-001',
    notes: 'Primer abono',
    requiresInvoice: true,
    createdBy: 'user-1',
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    createdAt: '2026-09-15T10:00:00Z',
    updatedAt: '2026-09-15T10:00:00Z',
  },
  {
    id: 'payment-2',
    patientId: PATIENT_ID,
    treatmentPlanId: null,
    amount: 200,
    method: 'transfer',
    paidAt: '2026-09-14T10:00:00Z',
    reference: null,
    notes: 'Anticipo general',
    requiresInvoice: false,
    createdBy: 'user-1',
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    createdAt: '2026-09-14T10:00:00Z',
    updatedAt: '2026-09-14T10:00:00Z',
  },
  {
    id: 'payment-3',
    patientId: PATIENT_ID,
    treatmentPlanId: 'plan-2',
    amount: 50,
    method: 'card',
    paidAt: '2026-09-13T10:00:00Z',
    reference: null,
    notes: null,
    requiresInvoice: true,
    createdBy: 'user-1',
    voidedAt: '2026-09-16T10:00:00Z',
    voidedBy: 'user-2',
    voidReason: 'Captura duplicada',
    createdAt: '2026-09-13T10:00:00Z',
    updatedAt: '2026-09-16T10:00:00Z',
  },
];

function renderTab(overrides: Partial<React.ComponentProps<typeof PatientPaymentsTab>> = {}) {
  const onPaymentsChanged = vi.fn();
  render(
    <PatientPaymentsTab
      patientId={PATIENT_ID}
      payments={payments}
      summary={summary}
      loading={false}
      error={null}
      onPaymentsChanged={onPaymentsChanged}
      {...overrides}
    />
  );
  return { onPaymentsChanged };
}

function historySection(): HTMLElement {
  const heading = screen.getByText('Historial de pagos');
  return heading.closest('section') as HTMLElement;
}

describe('PatientPaymentsTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn(async () => Response.json({ payment: payments[0] })) as typeof fetch;
  });

  it('shows the global balance, per-plan balances and account payments', () => {
    renderTab();

    expect(screen.getByText('Saldo global')).toBeInTheDocument();
    expect(screen.getByText('$1,250.00')).toBeInTheDocument();
    expect(screen.getByText('Ortodoncia inicial')).toBeInTheDocument();
    expect(screen.getByText('Vencido: 45 días')).toBeInTheDocument();
    expect(screen.getByText('Pagos a cuenta')).toBeInTheDocument();
    expect(screen.getByText('Anticipo general')).toBeInTheDocument();
  });

  it('keeps reversed payments visible in the chronological history', () => {
    renderTab();

    expect(screen.getByText('Historial de pagos')).toBeInTheDocument();
    expect(screen.getByText('Reversado')).toBeInTheDocument();
    expect(screen.getByText('Captura duplicada')).toBeInTheDocument();
    expect(screen.getByText('Primer abono')).toBeInTheDocument();
  });

  it('shows credit when the global balance is negative', () => {
    renderTab({
      summary: { ...summary, balance: -200, creditAmount: 200, paidAmount: 2000 },
    });

    expect(screen.getByText('Crédito operativo')).toBeInTheDocument();
    expect(screen.getAllByText('$200.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Saldo negativo visible por sobrepago.')).toBeInTheDocument();
  });

  it('shows an empty state while keeping the manual payment flow available', () => {
    renderTab({ payments: [], summary: { ...summary, paidAmount: 0, unallocatedPaidAmount: 0, planBalances: [] } });

    expect(screen.getByText('No hay pagos registrados para este paciente.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar pago' })).toBeInTheDocument();
  });

  it('shows loading and recoverable error states', () => {
    const { rerender } = render(
      <PatientPaymentsTab
        patientId={PATIENT_ID}
        payments={[]}
        summary={summary}
        loading
        error={null}
        onPaymentsChanged={vi.fn()}
      />
    );

    expect(screen.getByText('Cargando pagos...')).toBeInTheDocument();

    const retry = vi.fn();
    rerender(
      <PatientPaymentsTab
        patientId={PATIENT_ID}
        payments={[]}
        summary={summary}
        loading={false}
        error="Error al cargar pagos"
        onPaymentsChanged={retry}
      />
    );

    expect(screen.getByText('Error al cargar pagos')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Intentar de nuevo' }).click();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('submits a manual payment and refreshes financial state', async () => {
    const user = userEvent.setup();
    const { onPaymentsChanged } = renderTab();

    await user.type(screen.getByLabelText('Monto'), '150.50');
    await user.selectOptions(screen.getByLabelText('Método'), 'card');
    await user.selectOptions(screen.getByLabelText('Plan de tratamiento'), 'plan-1');
    await user.type(screen.getByLabelText('Referencia'), 'TPV-123');
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/admin/patients/${PATIENT_ID}/payments`,
        expect.objectContaining({ method: 'POST' })
      );
    });
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string)).toMatchObject({
      amount: 150.5,
      method: 'card',
      treatmentPlanId: 'plan-1',
      reference: 'TPV-123',
    });
    expect(onPaymentsChanged).toHaveBeenCalledTimes(1);
  });

  it('reverses an active payment with a reason and refreshes financial state', async () => {
    const user = userEvent.setup();
    const { onPaymentsChanged } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Reversar pago REC-001' }));
    await user.type(screen.getByLabelText('Motivo del reverso'), 'Pago capturado por error');
    await user.click(screen.getByRole('button', { name: 'Confirmar reverso' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/payments/payment-1',
        expect.objectContaining({ method: 'PATCH' })
      );
    });
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({
      action: 'reverse',
      reason: 'Pago capturado por error',
    });
    expect(onPaymentsChanged).toHaveBeenCalledTimes(1);
  });

  it('shows the invoice checkbox unchecked by default with an accessible label', () => {
    renderTab();

    expect(screen.getByLabelText('Requiere factura')).not.toBeChecked();
  });

  it('submits requiresInvoice true and resets the checkbox after a successful payment', async () => {
    const user = userEvent.setup();
    renderTab();

    await user.type(screen.getByLabelText('Monto'), '150.50');
    await user.click(screen.getByLabelText('Requiere factura'));
    expect(screen.getByLabelText('Requiere factura')).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/admin/patients/${PATIENT_ID}/payments`,
        expect.objectContaining({ method: 'POST' })
      );
    });
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string)).toMatchObject({ requiresInvoice: true });

    await waitFor(() => {
      expect(screen.getByLabelText('Requiere factura')).not.toBeChecked();
    });
  });

  it('shows the invoice badge only for payments whose flag is true', () => {
    renderTab();

    // payment-1 (activo) y payment-3 (reversado) tienen la marca; payment-2 no.
    expect(within(historySection()).getAllByText('Requiere factura')).toHaveLength(2);
  });

  it('does not show the invoice badge when no payment requires an invoice', () => {
    renderTab({
      payments: payments.map((payment) => ({ ...payment, requiresInvoice: false })),
    });

    expect(within(historySection()).queryByText('Requiere factura')).not.toBeInTheDocument();
  });

  it('keeps the invoice badge alongside the reversed state', () => {
    renderTab();

    const reversedArticle = screen.getByText('Captura duplicada').closest('article') as HTMLElement;
    expect(reversedArticle).not.toBeNull();
    expect(within(reversedArticle).getByText('Reversado')).toBeInTheDocument();
    expect(within(reversedArticle).getByText('Requiere factura')).toBeInTheDocument();
  });
});
