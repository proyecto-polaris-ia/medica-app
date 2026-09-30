'use client';

import { FormEvent, useMemo, useState } from 'react';
import { EmptyState } from '@/components/admin/EmptyState';
import { ErrorState } from '@/components/admin/ErrorState';
import { LoadingState } from '@/components/admin/LoadingState';
import type { PatientReceivableSummary, Payment, PaymentMethod, PlanBalance } from '@/lib/admin/types';

type PatientPaymentsTabProps = {
  patientId: string;
  payments: Payment[];
  summary: PatientReceivableSummary;
  loading: boolean;
  error: string | null;
  onPaymentsChanged: () => void;
};

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  other: 'Otro',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { dateStyle: 'medium' });
}

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function planLabel(plan: PlanBalance): string {
  return `${plan.name} · saldo ${formatCurrency(plan.balance)}`;
}

export function PatientPaymentsTab({
  patientId,
  payments,
  summary,
  loading,
  error,
  onPaymentsChanged,
}: PatientPaymentsTabProps) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paidAt, setPaidAt] = useState(todayInputValue());
  const [treatmentPlanId, setTreatmentPlanId] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [reversingPaymentId, setReversingPaymentId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [reversalError, setReversalError] = useState<string | null>(null);

  const planById = useMemo(() => {
    const map = new Map<string, PlanBalance>();
    for (const plan of summary.planBalances) map.set(plan.treatmentPlanId, plan);
    return map;
  }, [summary.planBalances]);

  const unallocatedPayments = payments.filter((payment) => !payment.treatmentPlanId && !payment.voidedAt);
  const sortedPayments = [...payments].sort(
    (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()
  );
  const hasCredit = summary.balance < 0 || summary.creditAmount > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch(`/api/admin/patients/${patientId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(amount),
          method,
          paidAt: new Date(`${paidAt}T12:00:00`).toISOString(),
          treatmentPlanId: treatmentPlanId || null,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
        }),
      });

      if (!res.ok) throw new Error('Error al registrar el pago');
      setAmount('');
      setMethod('cash');
      setPaidAt(todayInputValue());
      setTreatmentPlanId('');
      setReference('');
      setNotes('');
      onPaymentsChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReverse(paymentId: string) {
    setReversalError(null);
    try {
      const res = await fetch(`/api/admin/payments/${paymentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reverse', reason: voidReason.trim() }),
      });
      if (!res.ok) throw new Error('Error al reversar el pago');
      setReversingPaymentId(null);
      setVoidReason('');
      onPaymentsChanged();
    } catch (err) {
      setReversalError(err instanceof Error ? err.message : 'Error desconocido');
    }
  }

  if (loading) return <LoadingState message="Cargando pagos..." />;
  if (error) return <ErrorState message={error} onRetry={onPaymentsChanged} />;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Saldo global</h3>
            <p className="text-sm text-gray-500">Resumen financiero derivado de planes y pagos activos.</p>
          </div>
          <div className="text-left sm:text-right">
            <p className={`text-2xl font-bold ${hasCredit ? 'text-emerald-700' : 'text-gray-900'}`}>
              {formatCurrency(hasCredit ? summary.creditAmount : summary.balance)}
            </p>
            {hasCredit ? (
              <>
                <p className="text-sm font-medium text-emerald-700">Crédito operativo</p>
                <p className="text-xs text-emerald-700">Saldo negativo visible por sobrepago.</p>
              </>
            ) : (
              <p className="text-sm text-gray-500">Pendiente por cobrar</p>
            )}
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-md bg-gray-50 p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Monto elegible</dt>
            <dd className="text-sm font-semibold text-gray-900">{formatCurrency(summary.totalEligibleAmount)}</dd>
          </div>
          <div className="rounded-md bg-gray-50 p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pagado activo</dt>
            <dd className="text-sm font-semibold text-gray-900">{formatCurrency(summary.paidAmount)}</dd>
          </div>
          <div className="rounded-md bg-gray-50 p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Último pago</dt>
            <dd className="text-sm font-semibold text-gray-900">
              {summary.lastPaymentAt ? formatDate(summary.lastPaymentAt) : 'Sin pagos'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900">Registrar pago</h3>
        <form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-gray-700">
            Monto
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              type="number"
              min="0.01"
              step="0.01"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Método
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value as PaymentMethod)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {Object.entries(METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Fecha de pago
            <input
              value={paidAt}
              onChange={(event) => setPaidAt(event.target.value)}
              type="date"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Plan de tratamiento
            <select
              value={treatmentPlanId}
              onChange={(event) => setTreatmentPlanId(event.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Pago a cuenta</option>
              {summary.planBalances.map((plan) => (
                <option key={plan.treatmentPlanId} value={plan.treatmentPlanId}>{planLabel(plan)}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Referencia
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              type="text"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Notas
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              type="text"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
          {formError && <p className="text-sm text-red-700 sm:col-span-2">{formError}</p>}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Registrando...' : 'Registrar pago'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900">Saldos por plan</h3>
        {summary.planBalances.length === 0 ? (
          <EmptyState message="No hay planes con saldo financiero." />
        ) : (
          <div className="mt-4 space-y-3">
            {summary.planBalances.map((plan) => (
              <article key={plan.treatmentPlanId} className="rounded-md border border-gray-200 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="font-semibold text-gray-900">{plan.name}</h4>
                    <p className="text-sm text-gray-500">Pagado {formatCurrency(plan.paidAmount)} de {formatCurrency(plan.totalAmount)}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-semibold text-gray-900">{formatCurrency(plan.balance)}</p>
                    {plan.balance < 0 && <p className="text-sm text-emerald-700">Crédito del plan</p>}
                    {plan.isPastDue && <p className="text-sm font-medium text-red-700">Vencido: {plan.daysPastDue} días</p>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900">Pagos a cuenta</h3>
        {unallocatedPayments.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No hay pagos a cuenta activos.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-200">
            {unallocatedPayments.map((payment) => (
              <li key={payment.id} className="py-3 text-sm text-gray-700">
                <span className="font-medium text-gray-900">{formatCurrency(payment.amount)}</span> · {payment.notes || payment.reference || 'Pago a cuenta'} · {formatDate(payment.paidAt)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900">Historial de pagos</h3>
        {sortedPayments.length === 0 ? (
          <EmptyState message="No hay pagos registrados para este paciente." />
        ) : (
          <div className="mt-4 space-y-3">
            {sortedPayments.map((payment) => {
              const plan = payment.treatmentPlanId ? planById.get(payment.treatmentPlanId) : null;
              const isVoided = Boolean(payment.voidedAt);
              const label = payment.reference || payment.notes || payment.id;
              return (
                <article key={payment.id} className="rounded-md border border-gray-200 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isVoided ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                          {isVoided ? 'Reversado' : 'Activo'}
                        </span>
                        <span className="text-sm text-gray-500">{formatDate(payment.paidAt)}</span>
                      </div>
                      <p className="font-semibold text-gray-900">{formatCurrency(payment.amount)} · {METHOD_LABELS[payment.method]}</p>
                      <p className="text-sm text-gray-600">{plan ? `Plan: ${plan.name}` : 'Pago a cuenta'}</p>
                      {payment.reference && <p className="text-sm text-gray-600">Referencia: {payment.reference}</p>}
                      {payment.notes && <p className="text-sm text-gray-600">{payment.notes}</p>}
                      {payment.voidReason && (
                        <p className="text-sm text-red-700">
                          Motivo de reverso: <span>{payment.voidReason}</span>
                        </p>
                      )}
                    </div>
                    {!isVoided && (
                      <button
                        type="button"
                        onClick={() => {
                          setReversingPaymentId(payment.id);
                          setVoidReason('');
                          setReversalError(null);
                        }}
                        className="self-start text-sm font-medium text-red-600 hover:text-red-800"
                      >
                        Reversar pago {label}
                      </button>
                    )}
                  </div>

                  {reversingPaymentId === payment.id && (
                    <div className="mt-4 rounded-md bg-red-50 p-3">
                      <label className="block text-sm font-medium text-red-900">
                        Motivo del reverso
                        <input
                          value={voidReason}
                          onChange={(event) => setVoidReason(event.target.value)}
                          className="mt-1 block w-full rounded-md border border-red-200 px-3 py-2 text-sm shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                        />
                      </label>
                      {reversalError && <p className="mt-2 text-sm text-red-700">{reversalError}</p>}
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleReverse(payment.id)}
                          disabled={!voidReason.trim()}
                          className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          Confirmar reverso
                        </button>
                        <button
                          type="button"
                          onClick={() => setReversingPaymentId(null)}
                          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
