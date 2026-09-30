'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { EmptyState } from '@/components/admin/EmptyState';
import { ErrorState } from '@/components/admin/ErrorState';
import { LoadingState } from '@/components/admin/LoadingState';
import type { AccountsReceivableRow, PlanBalance } from '@/lib/admin/types';

const THRESHOLD_DAYS = 30;
const RECEIVABLES_ENDPOINT = `/api/admin/accounts-receivable?thresholdDays=${THRESHOLD_DAYS}`;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(value);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function overdueLabel(plan: PlanBalance): string {
  return `${plan.daysPastDue} ${plan.daysPastDue === 1 ? 'día' : 'días'} de atraso`;
}

function PlanList({ plans }: { plans: PlanBalance[] }) {
  if (plans.length === 0) {
    return <p className="text-sm text-gray-500">Sin planes vencidos.</p>;
  }

  return (
    <ul className="space-y-2" aria-label="Planes vencidos">
      {plans.map((plan) => (
        <li
          key={plan.treatmentPlanId}
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2"
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-950">{plan.name}</p>
              <p className="text-xs text-amber-800">
                {overdueLabel(plan)} · fecha base {formatDate(plan.baseDate)}
              </p>
            </div>
            <p className="text-sm font-semibold text-amber-950">
              Saldo {formatCurrency(plan.balance)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ReceivableCard({ row }: { row: AccountsReceivableRow }) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">{row.patientName}</h2>
          <p className="text-sm text-gray-600">
            {row.patientPhoneE164 ?? 'Teléfono sin registrar'}
          </p>
          <p className="mt-2 text-sm text-gray-600">
            Último pago: {row.lastPaymentAt ? formatDate(row.lastPaymentAt) : 'Sin pagos'}
          </p>
        </div>
        <div className="rounded-md bg-blue-50 px-4 py-3 lg:text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Saldo pendiente
          </p>
          <p className="text-2xl font-bold text-blue-950">{formatCurrency(row.balance)}</p>
          <p className="text-xs text-blue-700">
            Pagado activo {formatCurrency(row.paidAmount)}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Planes vencidos</h3>
        <PlanList plans={row.pastDuePlans} />
      </div>
    </article>
  );
}

export default function AccountsReceivablePage() {
  const [rows, setRows] = useState<AccountsReceivableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadReceivables() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(RECEIVABLES_ENDPOINT);
      if (!res.ok) throw new Error('Error al cargar la cartera por cobrar');
      const data = await res.json();
      setRows(data.accountsReceivable ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReceivables();
  }, []);

  const pendingRows = useMemo(
    () => rows.filter((row) => row.balance > 0),
    [rows]
  );
  const totalPending = pendingRows.reduce((sum, row) => sum + row.balance, 0);
  const overduePlansCount = pendingRows.reduce(
    (sum, row) => sum + row.pastDuePlans.length,
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">Cartera por cobrar</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Pacientes con saldo pendiente derivado de planes de tratamiento y pagos activos.
          </p>
        </div>
        <Link
          href="/patients"
          className="inline-flex rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Ver pacientes
        </Link>
      </div>

      {loading ? (
        <LoadingState message="Cargando cartera por cobrar..." />
      ) : error ? (
        <ErrorState message={error} onRetry={loadReceivables} />
      ) : pendingRows.length === 0 ? (
        <div className="space-y-3">
          <EmptyState message="No hay cartera pendiente." />
          <p className="text-center text-sm text-gray-500">
            Los pacientes con saldo cero o crédito no aparecen como deuda pendiente.
          </p>
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumen de cartera">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pacientes</p>
              <p className="mt-1 text-2xl font-bold text-gray-950">{pendingRows.length}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Saldo total</p>
              <p className="mt-1 text-2xl font-bold text-gray-950">{formatCurrency(totalPending)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Planes vencidos</p>
              <p className="mt-1 text-2xl font-bold text-amber-700">{overduePlansCount}</p>
            </div>
          </section>

          <section className="space-y-4" aria-label="Pacientes con cartera pendiente">
            {pendingRows.map((row) => (
              <ReceivableCard key={row.patientId} row={row} />
            ))}
          </section>
        </>
      )}
    </div>
  );
}
