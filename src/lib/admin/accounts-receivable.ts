import { getSupabaseAdmin } from '@/lib/supabase/server';
import type {
  AccountsReceivableRow,
  PatientReceivableSummary,
  PlanBalance,
  TreatmentPlanStatus,
} from './types';
import { parseThresholdDays, parseUuid } from './validate';

const ELIGIBLE_PLAN_STATUSES: TreatmentPlanStatus[] = [
  'accepted',
  'in_progress',
  'completed',
];

const PLAN_COLUMNS = [
  'id',
  'patient_id',
  'name',
  'status',
  'total_amount',
  'accepted_at',
  'created_at',
].join(', ');

const PAYMENT_COLUMNS = [
  'id',
  'patient_id',
  'treatment_plan_id',
  'amount',
  'paid_at',
  'voided_at',
].join(', ');

const PATIENT_COLUMNS = 'id, full_name, phone_e164';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type PlanRow = {
  id: string;
  patient_id: string;
  name: string;
  status: TreatmentPlanStatus;
  total_amount: number | string;
  accepted_at: string | null;
  created_at: string;
};

type PaymentRow = {
  id: string;
  patient_id: string;
  treatment_plan_id: string | null;
  amount: number | string;
  paid_at: string;
  voided_at: string | null;
};

type PatientRow = {
  id: string;
  full_name: string;
  phone_e164: string | null;
};

type SummaryOptions = {
  thresholdDays?: number;
  now?: Date;
};

function moneyToCents(amount: number | string): number {
  return Math.round(Number(amount ?? 0) * 100);
}

function centsToMoney(cents: number): number {
  return Math.round(cents) / 100;
}

function daysBetween(startIso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(startIso).getTime()) / MS_PER_DAY);
}

function latestPaymentAt(payments: PaymentRow[]): string | null {
  return payments.reduce<string | null>((latest, payment) => {
    if (!latest || payment.paid_at > latest) {
      return payment.paid_at;
    }
    return latest;
  }, null);
}

function buildSummary(
  patientId: string,
  plans: PlanRow[],
  payments: PaymentRow[],
  options: Required<SummaryOptions>
): PatientReceivableSummary {
  const totalEligibleCents = plans.reduce(
    (sum, plan) => sum + moneyToCents(plan.total_amount),
    0
  );
  const paidCents = payments.reduce(
    (sum, payment) => sum + moneyToCents(payment.amount),
    0
  );
  const unallocatedPaidCents = payments
    .filter((payment) => !payment.treatment_plan_id)
    .reduce((sum, payment) => sum + moneyToCents(payment.amount), 0);
  const paidByPlan = new Map<string, number>();

  for (const payment of payments) {
    if (!payment.treatment_plan_id) continue;
    paidByPlan.set(
      payment.treatment_plan_id,
      (paidByPlan.get(payment.treatment_plan_id) ?? 0) + moneyToCents(payment.amount)
    );
  }

  const planBalances: PlanBalance[] = plans.map((plan) => {
    const totalCents = moneyToCents(plan.total_amount);
    const planPaidCents = paidByPlan.get(plan.id) ?? 0;
    const balanceCents = totalCents - planPaidCents;
    const baseDate = plan.accepted_at ?? plan.created_at;
    const daysPastDue = daysBetween(baseDate, options.now);

    return {
      treatmentPlanId: plan.id,
      name: plan.name,
      status: plan.status,
      totalAmount: centsToMoney(totalCents),
      paidAmount: centsToMoney(planPaidCents),
      balance: centsToMoney(balanceCents),
      baseDate,
      baseDateSource: plan.accepted_at ? 'accepted_at' : 'created_at',
      daysPastDue,
      isPastDue: balanceCents > 0 && daysPastDue > options.thresholdDays,
    };
  });

  const balanceCents = totalEligibleCents - paidCents;

  return {
    patientId,
    totalEligibleAmount: centsToMoney(totalEligibleCents),
    paidAmount: centsToMoney(paidCents),
    unallocatedPaidAmount: centsToMoney(unallocatedPaidCents),
    balance: centsToMoney(balanceCents),
    creditAmount: balanceCents < 0 ? centsToMoney(Math.abs(balanceCents)) : 0,
    planBalances,
    lastPaymentAt: latestPaymentAt(payments),
  };
}

function resolveOptions(options: SummaryOptions = {}): Required<SummaryOptions> {
  return {
    thresholdDays: parseThresholdDays(options.thresholdDays),
    now: options.now ?? new Date(),
  };
}

async function fetchPlansForPatient(patientId: string): Promise<PlanRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('treatment_plans')
    .select(PLAN_COLUMNS)
    .eq('patient_id', patientId)
    .in('status', ELIGIBLE_PLAN_STATUSES)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as PlanRow[];
}

async function fetchPaymentsForPatient(patientId: string): Promise<PaymentRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('payments')
    .select(PAYMENT_COLUMNS)
    .eq('patient_id', patientId)
    .is('voided_at', null)
    .order('paid_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as PaymentRow[]).filter(
    (payment) => payment.voided_at === null
  );
}

export async function getPatientReceivableSummary(
  patientId: string,
  options: SummaryOptions = {}
): Promise<PatientReceivableSummary> {
  const parsedPatientId = parseUuid(patientId, 'patientId');
  const resolvedOptions = resolveOptions(options);
  const [plans, payments] = await Promise.all([
    fetchPlansForPatient(parsedPatientId),
    fetchPaymentsForPatient(parsedPatientId),
  ]);

  return buildSummary(parsedPatientId, plans, payments, resolvedOptions);
}

async function fetchEligiblePlans(): Promise<PlanRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('treatment_plans')
    .select(PLAN_COLUMNS)
    .in('status', ELIGIBLE_PLAN_STATUSES)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as PlanRow[];
}

async function fetchActivePayments(): Promise<PaymentRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('payments')
    .select(PAYMENT_COLUMNS)
    .is('voided_at', null)
    .order('paid_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as PaymentRow[]).filter(
    (payment) => payment.voided_at === null
  );
}

async function fetchPatients(patientIds: string[]): Promise<Map<string, PatientRow>> {
  if (patientIds.length === 0) {
    return new Map();
  }

  const { data, error } = await getSupabaseAdmin()
    .from('patients')
    .select(PATIENT_COLUMNS)
    .in('id', patientIds)
    .order('full_name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as unknown as PatientRow[]).map((patient) => [patient.id, patient])
  );
}

function groupByPatient<T extends { patient_id: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    grouped.set(row.patient_id, [...(grouped.get(row.patient_id) ?? []), row]);
  }
  return grouped;
}

export async function listAccountsReceivable(
  options: SummaryOptions = {}
): Promise<AccountsReceivableRow[]> {
  const resolvedOptions = resolveOptions(options);
  const [plans, payments] = await Promise.all([
    fetchEligiblePlans(),
    fetchActivePayments(),
  ]);
  const patientIds = Array.from(
    new Set([...plans.map((plan) => plan.patient_id), ...payments.map((payment) => payment.patient_id)])
  );
  const patients = await fetchPatients(patientIds);
  const plansByPatient = groupByPatient(plans);
  const paymentsByPatient = groupByPatient(payments);

  return patientIds
    .map((patientId) => {
      const summary = buildSummary(
        patientId,
        plansByPatient.get(patientId) ?? [],
        paymentsByPatient.get(patientId) ?? [],
        resolvedOptions
      );
      const patient = patients.get(patientId);
      return {
        ...summary,
        patientName: patient?.full_name ?? 'Paciente sin nombre',
        patientPhoneE164: patient?.phone_e164 ?? null,
        pastDuePlans: summary.planBalances.filter((plan) => plan.isPastDue),
      };
    })
    .filter((row) => row.balance > 0)
    .sort((a, b) => b.balance - a.balance);
}
