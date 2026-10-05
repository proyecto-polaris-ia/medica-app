import type { FollowUpDraftStatus } from '@/lib/admin/follow-up/types';
import {
  createWccClient,
  isSupabaseConfigured as hasSupabaseConfig,
} from '@/lib/wcc-client';

/**
 * Data layer del tab "Borradores" del WhatsApp Command Center (Fase 3).
 *
 * Lista los borradores de seguimiento con el nombre del paciente para
 * renderizarlos en el server component y aprobar/rechazar/enviar. Sigue el
 * patrón de `wcc-appointments.ts`: nunca lanza hacia la página, degrada a una
 * cola vacía y expone `isSupabaseConfigured` / `isConfiguredButUnavailable`.
 */

export type WccFollowUpDraftRow = {
  id: string;
  patientId: string;
  patientName: string;
  patientPhoneE164: string | null;
  body: string;
  templateName: string;
  status: FollowUpDraftStatus;
  errorMessage: string | null;
  providerMessageId: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WccFollowUpDraftsQueue = {
  isSupabaseConfigured: boolean;
  isConfiguredButUnavailable: boolean;
  drafts: WccFollowUpDraftRow[];
};

type Row = Record<string, unknown>;
type Result<T = Row> = {
  data?: T[] | null;
  error?: { message?: string } | null;
};
type Query = PromiseLike<Result> & {
  select: (...a: unknown[]) => Query;
  eq: (...a: unknown[]) => Query;
  in: (...a: unknown[]) => Query;
  order: (...a: unknown[]) => Query;
  range: (...a: unknown[]) => Query;
};
type Db = { from: (t: string) => Query };

const s = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

const unique = (ids: string[]): string[] => [...new Set(ids.filter(Boolean))];

async function db(): Promise<Db> {
  return (await createWccClient()) as unknown as Db;
}

async function rows<T = Row>(q: Query): Promise<Result<T>> {
  const r = (await q) as Result<T>;
  if (r.error) throw new Error(r.error.message);
  return r;
}

type PatientInfo = { name: string; phone: string | null };

async function patientsFor(
  d: Db,
  ids: string[]
): Promise<Map<string, PatientInfo>> {
  const u = unique(ids);
  if (u.length === 0) return new Map();
  const r = await rows(
    d
      .from('patients')
      .select('id, full_name, phone_e164')
      .in('id', u)
      .range(0, u.length - 1)
  );
  return new Map(
    (r.data ?? []).map((x) => [
      x.id as string,
      {
        name: s(x.full_name) ?? 'Paciente sin nombre',
        phone: (x.phone_e164 as string | null) ?? null,
      },
    ])
  );
}

function mapDraft(r: Row, patients: Map<string, PatientInfo>): WccFollowUpDraftRow {
  const patientId = r.patient_id as string;
  const patient = patients.get(patientId);
  return {
    id: r.id as string,
    patientId,
    patientName: patient?.name ?? 'Paciente sin nombre',
    patientPhoneE164: patient?.phone ?? null,
    body: s(r.body) ?? '',
    templateName: s(r.template_name) ?? 'seguimiento_paciente',
    status: r.status as FollowUpDraftStatus,
    errorMessage: (r.error_message as string | null) ?? null,
    providerMessageId: (r.provider_message_id as string | null) ?? null,
    approvedAt: (r.approved_at as string | null) ?? null,
    sentAt: (r.sent_at as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function getWccFollowUpDrafts(
  filters: { status?: FollowUpDraftStatus } = {}
): Promise<WccFollowUpDraftsQueue> {
  const empty = (
    overrides: Partial<WccFollowUpDraftsQueue> = {}
  ): WccFollowUpDraftsQueue => ({
    isSupabaseConfigured: false,
    isConfiguredButUnavailable: false,
    drafts: [],
    ...overrides,
  });

  if (!hasSupabaseConfig()) return empty();

  try {
    const d = await db();
    const base = d
      .from('follow_up_message_drafts')
      .select(
        'id, patient_id, body, template_name, status, error_message, provider_message_id, approved_at, sent_at, created_at, updated_at'
      );
    const filtered = filters.status
      ? base.eq('status', filters.status)
      : base;
    const result = await rows(filtered.order('created_at', { ascending: false }));

    const patients = await patientsFor(
      d,
      (result.data ?? []).map((r) => r.patient_id as string)
    );

    return empty({
      isSupabaseConfigured: true,
      drafts: (result.data ?? []).map((r) => mapDraft(r, patients)),
    });
  } catch {
    return empty({
      isSupabaseConfigured: true,
      isConfiguredButUnavailable: true,
    });
  }
}
