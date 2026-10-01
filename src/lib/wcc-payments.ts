import { createWccClient, isSupabaseConfigured as hasSupabaseConfig } from '@/lib/wcc-client';

export const WCC_PAYMENTS_PAGE_SIZE = 20;

export type WccPaymentIntentRow = {
  id: string;
  patientId: string;
  patientName: string;
  patientPhoneE164: string | null;
  treatmentPlanId: string | null;
  whatsappContactId: string | null;
  source: 'whatsapp' | 'manual';
  amount: number | null;
  method: 'cash' | 'card' | 'transfer' | 'other' | null;
  status: 'pending' | 'confirmed' | 'fulfilled' | 'cancelled';
  commitmentText: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WccReminderRow = {
  id: string;
  patientId: string;
  patientName: string;
  patientPhoneE164: string | null;
  treatmentPlanId: string | null;
  contactId: string | null;
  reminderKey: string;
  templateName: string;
  status: 'scheduled' | 'sent' | 'skipped' | 'failed';
  dryRun: boolean;
  balanceAtSend: number | null;
  providerMessageId: string | null;
  sentAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WccPaymentsQueue = {
  isSupabaseConfigured: boolean;
  isConfiguredButUnavailable: boolean;
  intents: WccPaymentIntentRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export type WccRemindersQueue = {
  isSupabaseConfigured: boolean;
  isConfiguredButUnavailable: boolean;
  reminders: WccReminderRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

type Row = Record<string, unknown>;
type Result<T = Row> = { data?: T[] | null; error?: { message?: string } | null; count?: number | null };
type Query = PromiseLike<Result> & {
  select: (...a: unknown[]) => Query;
  eq: (...a: unknown[]) => Query;
  in: (...a: unknown[]) => Query;
  order: (...a: unknown[]) => Query;
  range: (...a: unknown[]) => Query;
  maybeSingle: () => Promise<Result<Row | null>>;
};
type Db = { from: (t: string) => Query };

const s = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

const pageOf = (p: unknown): number => {
  const x = Number(p ?? 1);
  return Number.isFinite(x) && x > 0 ? Math.floor(x) : 1;
};

async function db(): Promise<Db> {
  return (await createWccClient()) as unknown as Db;
}

async function rows<T = Row>(q: Query): Promise<Result<T>> {
  const r = (await q) as Result<T>;
  if (r.error) throw new Error(r.error.message);
  return r;
}

function emptyPayments(page = 1, overrides: Partial<WccPaymentsQueue> = {}): WccPaymentsQueue {
  return {
    isSupabaseConfigured: false,
    isConfiguredButUnavailable: false,
    intents: [],
    page,
    pageSize: WCC_PAYMENTS_PAGE_SIZE,
    totalCount: 0,
    totalPages: 0,
    ...overrides,
  };
}

function emptyReminders(page = 1, overrides: Partial<WccRemindersQueue> = {}): WccRemindersQueue {
  return {
    isSupabaseConfigured: false,
    isConfiguredButUnavailable: false,
    reminders: [],
    page,
    pageSize: WCC_PAYMENTS_PAGE_SIZE,
    totalCount: 0,
    totalPages: 0,
    ...overrides,
  };
}

async function patientsFor(
  d: Db,
  ids: string[]
): Promise<Map<string, { id: string; fullName: string; phoneE164: string | null }>> {
  const u = [...new Set(ids.filter(Boolean))];
  if (u.length === 0) return new Map();
  const r = await rows<Row>(
    d
      .from('patients')
      .select('id, full_name, phone_e164')
      .in('id', u)
      .range(0, u.length - 1)
  );
  return new Map(
    ((r.data ?? []) as Row[]).map((x) => [
      x.id as string,
      {
        id: x.id as string,
        fullName: s(x.full_name) ?? 'Paciente sin nombre',
        phoneE164: (x.phone_e164 as string | null) ?? null,
      },
    ])
  );
}

function mapIntent(
  r: Row,
  patients: Map<string, { id: string; fullName: string; phoneE164: string | null }>
): WccPaymentIntentRow {
  const patientId = r.patient_id as string;
  const patient = patients.get(patientId);
  return {
    id: r.id as string,
    patientId,
    patientName: patient?.fullName ?? 'Paciente sin nombre',
    patientPhoneE164: patient?.phoneE164 ?? null,
    treatmentPlanId: (r.treatment_plan_id as string | null) ?? null,
    whatsappContactId: (r.whatsapp_contact_id as string | null) ?? null,
    source: r.intent_source as 'whatsapp' | 'manual',
    amount: r.amount === null || r.amount === undefined ? null : Number(r.amount),
    method: (r.method as WccPaymentIntentRow['method']) ?? null,
    status: r.status as WccPaymentIntentRow['status'],
    commitmentText: (r.commitment_text as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function mapReminder(
  r: Row,
  patients: Map<string, { id: string; fullName: string; phoneE164: string | null }>
): WccReminderRow {
  const patientId = r.patient_id as string;
  const patient = patients.get(patientId);
  return {
    id: r.id as string,
    patientId,
    patientName: patient?.fullName ?? 'Paciente sin nombre',
    patientPhoneE164: patient?.phoneE164 ?? null,
    treatmentPlanId: (r.treatment_plan_id as string | null) ?? null,
    contactId: (r.contact_id as string | null) ?? null,
    reminderKey: r.reminder_key as string,
    templateName: s(r.template_name) ?? 'recordatorio_pago',
    status: r.status as WccReminderRow['status'],
    dryRun: r.dry_run === true,
    balanceAtSend:
      r.balance_at_send === null || r.balance_at_send === undefined
        ? null
        : Number(r.balance_at_send),
    providerMessageId: (r.provider_message_id as string | null) ?? null,
    sentAt: (r.sent_at as string | null) ?? null,
    error: (r.error as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function getWccPaymentsQueue(
  filters: { page?: number | string } = {}
): Promise<WccPaymentsQueue> {
  const page = pageOf(filters.page);
  if (!hasSupabaseConfig()) return emptyPayments(page);
  try {
    const d = await db();
    const from = (page - 1) * WCC_PAYMENTS_PAGE_SIZE;
    const r = await rows<Row>(
      d
        .from('payment_intents')
        .select(
          'id, patient_id, treatment_plan_id, whatsapp_contact_id, intent_source, amount, method, status, commitment_text, notes, created_at, updated_at',
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(from, from + WCC_PAYMENTS_PAGE_SIZE - 1)
    );
    const patientIds = ((r.data ?? []) as Row[])
      .map((x) => x.patient_id as string)
      .filter(Boolean);
    const patients = await patientsFor(d, patientIds);
    const total = r.count ?? r.data?.length ?? 0;
    return {
      isSupabaseConfigured: true,
      isConfiguredButUnavailable: false,
      intents: ((r.data ?? []) as Row[]).map((x) => mapIntent(x, patients)),
      page,
      pageSize: WCC_PAYMENTS_PAGE_SIZE,
      totalCount: total,
      totalPages: Math.max(1, Math.ceil(total / WCC_PAYMENTS_PAGE_SIZE)),
    };
  } catch {
    return emptyPayments(page, { isSupabaseConfigured: true, isConfiguredButUnavailable: true });
  }
}

export async function getWccRemindersQueue(
  filters: { page?: number | string } = {}
): Promise<WccRemindersQueue> {
  const page = pageOf(filters.page);
  if (!hasSupabaseConfig()) return emptyReminders(page);
  try {
    const d = await db();
    const from = (page - 1) * WCC_PAYMENTS_PAGE_SIZE;
    const r = await rows<Row>(
      d
        .from('payment_reminders')
        .select(
          'id, patient_id, treatment_plan_id, contact_id, reminder_key, template_name, status, dry_run, balance_at_send, provider_message_id, sent_at, error, created_at, updated_at',
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(from, from + WCC_PAYMENTS_PAGE_SIZE - 1)
    );
    const patientIds = ((r.data ?? []) as Row[])
      .map((x) => x.patient_id as string)
      .filter(Boolean);
    const patients = await patientsFor(d, patientIds);
    const total = r.count ?? r.data?.length ?? 0;
    return {
      isSupabaseConfigured: true,
      isConfiguredButUnavailable: false,
      reminders: ((r.data ?? []) as Row[]).map((x) => mapReminder(x, patients)),
      page,
      pageSize: WCC_PAYMENTS_PAGE_SIZE,
      totalCount: total,
      totalPages: Math.max(1, Math.ceil(total / WCC_PAYMENTS_PAGE_SIZE)),
    };
  } catch {
    return emptyReminders(page, { isSupabaseConfigured: true, isConfiguredButUnavailable: true });
  }
}