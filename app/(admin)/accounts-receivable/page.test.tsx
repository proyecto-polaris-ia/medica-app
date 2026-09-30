import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AccountsReceivablePage from './page';
import type { AccountsReceivableRow } from '@/lib/admin/types';

const overdueRow: AccountsReceivableRow = {
  patientId: 'patient-overdue',
  patientName: 'María López',
  patientPhoneE164: '+5215512345678',
  totalEligibleAmount: 1500,
  paidAmount: 300,
  unallocatedPaidAmount: 0,
  balance: 1200,
  creditAmount: 0,
  lastPaymentAt: '2026-09-20T10:00:00.000Z',
  planBalances: [
    {
      treatmentPlanId: 'plan-overdue',
      name: 'Ortodoncia',
      status: 'accepted',
      totalAmount: 1500,
      paidAmount: 300,
      balance: 1200,
      baseDate: '2026-08-30T12:00:00.000Z',
      baseDateSource: 'accepted_at',
      daysPastDue: 31,
      isPastDue: true,
    },
  ],
  pastDuePlans: [
    {
      treatmentPlanId: 'plan-overdue',
      name: 'Ortodoncia',
      status: 'accepted',
      totalAmount: 1500,
      paidAmount: 300,
      balance: 1200,
      baseDate: '2026-08-30T12:00:00.000Z',
      baseDateSource: 'accepted_at',
      daysPastDue: 31,
      isPastDue: true,
    },
  ],
};

const zeroBalanceRow: AccountsReceivableRow = {
  ...overdueRow,
  patientId: 'patient-zero',
  patientName: 'Paciente Saldado',
  balance: 0,
  planBalances: [],
  pastDuePlans: [],
};

const creditRow: AccountsReceivableRow = {
  ...overdueRow,
  patientId: 'patient-credit',
  patientName: 'Paciente con Crédito',
  balance: -200,
  creditAmount: 200,
  planBalances: [],
  pastDuePlans: [],
};

function mockAccountsReceivable(rows: AccountsReceivableRow[]) {
  global.fetch = vi.fn(async (url: string | URL) => {
    expect(url.toString()).toBe('/api/admin/accounts-receivable?thresholdDays=30');
    return Response.json({ accountsReceivable: rows });
  }) as typeof fetch;
}

describe('/accounts-receivable page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists patients with positive balances and highlights overdue plans', async () => {
    mockAccountsReceivable([overdueRow]);

    render(<AccountsReceivablePage />);

    expect(await screen.findByRole('heading', { name: 'Cartera por cobrar' })).toBeInTheDocument();
    expect(screen.getByText('María López')).toBeInTheDocument();
    expect(screen.getAllByText('$1,200.00')).toHaveLength(2);
    expect(screen.getByText('Ortodoncia')).toBeInTheDocument();
    expect(screen.getByText(/31 días de atraso/)).toBeInTheDocument();
    expect(screen.getByText(/20 sep/)).toBeInTheDocument();
  });

  it('hides zero-balance and credit patients from pending receivables', async () => {
    mockAccountsReceivable([overdueRow, zeroBalanceRow, creditRow]);

    render(<AccountsReceivablePage />);

    expect(await screen.findByText('María López')).toBeInTheDocument();
    expect(screen.queryByText('Paciente Saldado')).not.toBeInTheDocument();
    expect(screen.queryByText('Paciente con Crédito')).not.toBeInTheDocument();
  });

  it('shows a clear empty state when there are no pending receivables', async () => {
    mockAccountsReceivable([]);

    render(<AccountsReceivablePage />);

    expect(await screen.findByText('No hay cartera pendiente.')).toBeInTheDocument();
    expect(screen.getByText('Los pacientes con saldo cero o crédito no aparecen como deuda pendiente.')).toBeInTheDocument();
  });

  it('shows a recoverable error state when the receivables request fails', async () => {
    global.fetch = vi.fn(async () => new Response('Server error', { status: 500 })) as typeof fetch;

    render(<AccountsReceivablePage />);

    expect(await screen.findByText('Error al cargar la cartera por cobrar')).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Intentar de nuevo' });
    expect(retry).toBeInTheDocument();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/admin/accounts-receivable?thresholdDays=30');
    });
  });
});
