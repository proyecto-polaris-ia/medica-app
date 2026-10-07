import { getSupabaseAdmin } from '@/lib/supabase/server';
import { ConflictError, NotFoundError } from '../errors';
import { validateFollowUpDraftText } from './draft';
import type { FollowUpDraft, FollowUpDraftStatus } from './types';

/**
 * Capa de datos de los borradores de seguimiento (server-only).
 *
 * `SELECT_COLUMNS` explícitos, `mapRow` snake→camel y `getSupabaseAdmin()`, en
 * línea con `follow-up.ts`. La generación es idempotente por `dedup_key`; el
 * ciclo de aprobación/rechazo se guarda con la transición válida desde `draft`.
 */

export const FOLLOW_UP_DRAFT_DEDUP_PREFIX = 'follow-up-draft';

export const DRAFT_SELECT_COLUMNS = [
  'id',
  'patient_id',
  'body',
  'template_name',
  'status',
  'dedup_key',
  'provider_message_id',
  'error_message',
  'approved_by',
  'approved_at',
  'edited_by',
  'edited_at',
  'sent_at',
  'created_by',
  'created_at',
  'updated_at',
].join(', ');

export const FOLLOW_UP_DRAFT_STATUSES: FollowUpDraftStatus[] = [
  'draft',
  'approved',
  'rejected',
  'sent',
  'sent_failed',
];

/** Clave de deduplicación: un borrador por paciente y ronda. */
export function buildDraftDedupKey(
  patientId: string,
  roundDate: string
): string {
  return `${FOLLOW_UP_DRAFT_DEDUP_PREFIX}:${patientId}:${roundDate}`;
}

export function mapFollowUpDraftRow(row: Record<string, unknown>): FollowUpDraft {
  return {
    id: row.id as string,
    patientId: row.patient_id as string,
    body: row.body as string,
    templateName: row.template_name as string,
    status: row.status as FollowUpDraftStatus,
    dedupKey: row.dedup_key as string,
    providerMessageId: (row.provider_message_id as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    approvedBy: (row.approved_by as string | null) ?? null,
    approvedAt: (row.approved_at as string | null) ?? null,
    editedBy: (row.edited_by as string | null) ?? null,
    editedAt: (row.edited_at as string | null) ?? null,
    sentAt: (row.sent_at as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getFollowUpDraftById(
  id: string
): Promise<FollowUpDraft | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('follow_up_message_drafts')
    .select(DRAFT_SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapFollowUpDraftRow(data as unknown as Record<string, unknown>) : null;
}

async function getFollowUpDraftByDedupKey(
  dedupKey: string
): Promise<FollowUpDraft | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('follow_up_message_drafts')
    .select(DRAFT_SELECT_COLUMNS)
    .eq('dedup_key', dedupKey)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapFollowUpDraftRow(data as unknown as Record<string, unknown>) : null;
}

/**
 * Borrador de un paciente en una ronda (búsqueda publica por `dedup_key`).
 *
 * Devuelve `null` cuando no existe: la ruta `POST` decide con ese `null` si
 * debe generar el texto o si ya hay un borrador que respetar.
 */
export async function findFollowUpDraftForRound(input: {
  patientId: string;
  roundDate: string;
}): Promise<FollowUpDraft | null> {
  return getFollowUpDraftByDedupKey(
    buildDraftDedupKey(input.patientId, input.roundDate)
  );
}

/**
 * Crea (o recupera) el borrador de un paciente en una ronda.
 *
 * `upsert` con `onConflict: 'dedup_key'` + `ignoreDuplicates: true` hace la
 * generación idempotente: una segunda llamada para el mismo paciente y ronda
 * devuelve el borrador existente sin duplicarlo.
 */
export async function createFollowUpDraft(input: {
  patientId: string;
  userId: string;
  body: string;
  templateName: string;
  roundDate: string;
}): Promise<{ draft: FollowUpDraft; created: boolean }> {
  const dedupKey = buildDraftDedupKey(input.patientId, input.roundDate);

  const { data, error } = await getSupabaseAdmin()
    .from('follow_up_message_drafts')
    .upsert(
      {
        patient_id: input.patientId,
        body: input.body,
        template_name: input.templateName,
        dedup_key: dedupKey,
        created_by: input.userId,
      },
      { onConflict: 'dedup_key', ignoreDuplicates: true }
    )
    .select(DRAFT_SELECT_COLUMNS);

  if (error) {
    throw new Error(error.message);
  }

  const inserted = (data ?? []) as unknown as Record<string, unknown>[];
  if (inserted.length > 0) {
    return { draft: mapFollowUpDraftRow(inserted[0]), created: true };
  }

  const existing = await getFollowUpDraftByDedupKey(dedupKey);
  if (!existing) {
    throw new Error('Failed to create follow-up draft');
  }

  return { draft: existing, created: false };
}

/**
 * Aprobar o rechazar un borrador. Solo es válido desde `draft`; cualquier otro
 * estado lanza `ConflictError` (409).
 */
export async function transitionFollowUpDraft(input: {
  id: string;
  status: 'approved' | 'rejected';
  userId: string;
  now?: Date;
}): Promise<FollowUpDraft> {
  const draft = await getFollowUpDraftById(input.id);
  if (!draft) {
    throw new NotFoundError('Follow-up draft');
  }

  if (draft.status !== 'draft') {
    throw new ConflictError(
      `Follow-up draft is already ${draft.status}; only draft can be approved or rejected.`
    );
  }

  const now = (input.now ?? new Date()).toISOString();
  const approving = input.status === 'approved';

  const { data, error } = await getSupabaseAdmin()
    .from('follow_up_message_drafts')
    .update({
      status: input.status,
      approved_by: approving ? input.userId : null,
      approved_at: approving ? now : null,
    })
    .eq('id', input.id)
    .select(DRAFT_SELECT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(
      (error as { message?: string } | null)?.message ??
        'Failed to update follow-up draft'
    );
  }

  return mapFollowUpDraftRow(data as unknown as Record<string, unknown>);
}

/**
 * Edición humana del texto de un borrador (único punto de escritura de texto).
 *
 * Solo es válida desde `draft`: cualquier otro estado lanza `ConflictError`
 * (409) sin escribir, para que un borrador ya decidido o enviado sea inmutable.
 * El texto pasa por `validateFollowUpDraftText` antes de persistir, de modo que
 * la tabla nunca guarda texto que viole los guardrails, y se registra la
 * auditoría `edited_by`/`edited_at` sin cambiar el estado. No envía nada.
 */
export async function updateFollowUpDraftBody(input: {
  id: string;
  body: string;
  userId: string;
  now?: Date;
}): Promise<FollowUpDraft> {
  const draft = await getFollowUpDraftById(input.id);
  if (!draft) {
    throw new NotFoundError('Follow-up draft');
  }

  if (draft.status !== 'draft') {
    throw new ConflictError(
      `Follow-up draft is already ${draft.status}; only draft can be edited.`
    );
  }

  const body = validateFollowUpDraftText(input.body);
  const now = (input.now ?? new Date()).toISOString();

  const { data, error } = await getSupabaseAdmin()
    .from('follow_up_message_drafts')
    .update({ body, edited_by: input.userId, edited_at: now })
    .eq('id', input.id)
    .select(DRAFT_SELECT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(
      (error as { message?: string } | null)?.message ??
        'Failed to update follow-up draft body'
    );
  }

  return mapFollowUpDraftRow(data as unknown as Record<string, unknown>);
}

/** Claim atómico `approved`→`sending`; null si otra petición ya lo ganó. */
export async function claimFollowUpDraftForSend(
  id: string
): Promise<FollowUpDraft | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('follow_up_message_drafts')
    .update({ status: 'sending' })
    .eq('id', id)
    .eq('status', 'approved')
    .select(DRAFT_SELECT_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapFollowUpDraftRow(data as unknown as Record<string, unknown>) : null;
}

/** Marca el borrador como `sent` con su `provider_message_id` y `sent_at`. */
export async function markFollowUpDraftSent(input: {
  id: string;
  providerMessageId?: string;
  now?: Date;
}): Promise<FollowUpDraft> {
  const now = (input.now ?? new Date()).toISOString();

  const { data, error } = await getSupabaseAdmin()
    .from('follow_up_message_drafts')
    .update({
      status: 'sent',
      provider_message_id: input.providerMessageId ?? null,
      error_message: null,
      sent_at: now,
    })
    .eq('id', input.id)
    .select(DRAFT_SELECT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(
      (error as { message?: string } | null)?.message ??
        'Failed to mark follow-up draft as sent'
    );
  }

  return mapFollowUpDraftRow(data as unknown as Record<string, unknown>);
}

/** Marca el borrador como `sent_failed` y deja visible el motivo del fallo. */
export async function markFollowUpDraftSentFailed(input: {
  id: string;
  errorMessage: string;
}): Promise<FollowUpDraft> {
  const { data, error } = await getSupabaseAdmin()
    .from('follow_up_message_drafts')
    .update({ status: 'sent_failed', error_message: input.errorMessage })
    .eq('id', input.id)
    .select(DRAFT_SELECT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(
      (error as { message?: string } | null)?.message ??
        'Failed to mark follow-up draft as failed'
    );
  }

  return mapFollowUpDraftRow(data as unknown as Record<string, unknown>);
}
