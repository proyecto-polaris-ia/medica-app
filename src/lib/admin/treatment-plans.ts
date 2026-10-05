import { getSupabaseAdmin } from '@/lib/supabase/server';
import type {
  TreatmentPlan,
  TreatmentPlanInput,
  TreatmentPlanItem,
  TreatmentPlanItemInput,
  TreatmentPlanItemStatus,
  TreatmentPlanItemUpdateInput,
  TreatmentPlanStatus,
  TreatmentPlanUpdateInput,
  TreatmentPlanWithItems,
} from './types';
import { ConflictError, NotFoundError } from './errors';
import {
  parseFdiTooth,
  parseMoney,
  parseNonEmptyString,
  parseNotes,
  parseQuantity,
  parseTreatmentPlanItemStatus,
  parseTreatmentPlanStatus,
  parseUuid,
  ValidationError,
} from './validate';

const PLAN_COLUMNS = [
  'id',
  'patient_id',
  'provider_id',
  'clinical_visit_id',
  'name',
  'status',
  'total_amount',
  'accepted_at',
  'notes',
  'created_at',
  'updated_at',
].join(', ');

const ITEM_COLUMNS = [
  'id',
  'treatment_plan_id',
  'description',
  'service_id',
  'tooth',
  'quantity',
  'unit_price',
  'status',
  'created_at',
  'updated_at',
].join(', ');

export const ALLOWED_TRANSITIONS: Record<
  TreatmentPlanStatus,
  TreatmentPlanStatus[]
> = {
  draft: ['presented', 'cancelled'],
  presented: ['accepted', 'draft', 'cancelled'],
  accepted: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function moneyToCents(amount: number): number {
  return Math.round(amount * 100);
}

export function sumLineTotals(
  items: { quantity: number; unitPrice: number }[]
): number {
  const cents = items.reduce(
    (acc, it) => acc + it.quantity * moneyToCents(it.unitPrice),
    0
  );
  return cents / 100;
}

function normalizeClinicalVisitId(
  value: unknown
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return parseUuid(value as string, 'clinicalVisitId');
}

function normalizeServiceId(
  value: unknown
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return parseUuid(value as string, 'serviceId');
}

function mapPlanRow(row: Record<string, unknown>): TreatmentPlan {
  return {
    id: row.id as string,
    patientId: row.patient_id as string,
    providerId: row.provider_id as string,
    clinicalVisitId: (row.clinical_visit_id as string | null) ?? null,
    name: row.name as string,
    status: row.status as TreatmentPlanStatus,
    totalAmount: Number(row.total_amount ?? 0),
    acceptedAt: (row.accepted_at as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapItemRow(row: Record<string, unknown>): TreatmentPlanItem {
  return {
    id: row.id as string,
    treatmentPlanId: row.treatment_plan_id as string,
    description: row.description as string,
    serviceId: (row.service_id as string | null) ?? null,
    tooth: (row.tooth as string | null) ?? null,
    quantity: Number(row.quantity ?? 1),
    unitPrice: Number(row.unit_price ?? 0),
    status: row.status as TreatmentPlanItemStatus,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function assertDraft(planId: string): Promise<void> {
  const parsedPlanId = parseUuid(planId, 'planId');
  const { data, error } = await getSupabaseAdmin()
    .from('treatment_plans')
    .select('status')
    .eq('id', parsedPlanId)
    .single();

  if (error || !data) {
    throw new NotFoundError('Treatment plan');
  }
  if (data.status !== 'draft') {
    throw new ConflictError(
      'Treatment plan is not in draft status'
    );
  }
}

export async function recomputeTotal(planId: string): Promise<void> {
  const parsedPlanId = parseUuid(planId, 'planId');
  const { data, error } = await getSupabaseAdmin()
    .from('treatment_plan_items')
    .select('quantity, unit_price')
    .eq('treatment_plan_id', parsedPlanId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const items = ((data ?? []) as unknown as Record<string, unknown>[]).map(
    (row) => ({
      quantity: Number(row.quantity ?? 0),
      unitPrice: Number(row.unit_price ?? 0),
    })
  );
  const total = sumLineTotals(items);

  const { error: updateError } = await getSupabaseAdmin()
    .from('treatment_plans')
    .update({ total_amount: total })
    .eq('id', parsedPlanId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

export async function listTreatmentPlans(
  patientId: string
): Promise<TreatmentPlan[]> {
  const parsedPatientId = parseUuid(patientId, 'patientId');
  const { data, error } = await getSupabaseAdmin()
    .from('treatment_plans')
    .select(PLAN_COLUMNS)
    .eq('patient_id', parsedPatientId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapPlanRow);
}

export async function getTreatmentPlan(
  planId: string
): Promise<TreatmentPlanWithItems> {
  const parsedPlanId = parseUuid(planId, 'planId');
  const { data: planData, error: planError } = await getSupabaseAdmin()
    .from('treatment_plans')
    .select(PLAN_COLUMNS)
    .eq('id', parsedPlanId)
    .single();

  if (planError || !planData) {
    throw new NotFoundError('Treatment plan');
  }

  const { data: itemsData, error: itemsError } = await getSupabaseAdmin()
    .from('treatment_plan_items')
    .select(ITEM_COLUMNS)
    .eq('treatment_plan_id', parsedPlanId)
    .order('created_at', { ascending: true });

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  return {
    ...mapPlanRow(planData as unknown as Record<string, unknown>),
    items: ((itemsData ?? []) as unknown as Record<string, unknown>[]).map(
      mapItemRow
    ),
  };
}

export async function createTreatmentPlan(
  patientId: string,
  input: TreatmentPlanInput
): Promise<TreatmentPlanWithItems> {
  const parsedPatientId = parseUuid(patientId, 'patientId');

  const planPayload = {
    patient_id: parsedPatientId,
    provider_id: parseUuid(input.providerId, 'providerId'),
    clinical_visit_id: normalizeClinicalVisitId(input.clinicalVisitId),
    name: parseNonEmptyString(input.name, 'name'),
    status: 'draft' as const,
    total_amount: 0,
    notes: input.notes === undefined ? null : parseNotes(input.notes, 'notes'),
  };

  // Issue #123: validar TODOS los ítems antes del primer INSERT. Un ítem
  // inválido debe abortar sin tocar la BD; si el mapeo corriera después del
  // insert (fuera del try/catch del cleanup), quedaría un plan huérfano en
  // draft con 0 ítems y total 0.
  const itemsPayload =
    input.items && input.items.length > 0
      ? input.items.map((it) => ({
          description: parseNonEmptyString(it.description, 'description'),
          service_id: normalizeServiceId(it.serviceId),
          tooth: parseFdiTooth(it.tooth, 'tooth'),
          quantity: it.quantity ?? 1,
          unit_price: parseMoney(it.unitPrice, 'unitPrice'),
          status: 'pending' as const,
        }))
      : [];

  const { data: planData, error: planError } = await getSupabaseAdmin()
    .from('treatment_plans')
    .insert(planPayload)
    .select(PLAN_COLUMNS)
    .single();

  if (planError || !planData) {
    throw new Error(
      (planError as { message?: string } | null)?.message ??
        'Failed to create treatment plan'
    );
  }

  const planId = (planData as unknown as Record<string, unknown>).id as string;

  if (itemsPayload.length > 0) {
    try {
      const { error: itemsError } = await getSupabaseAdmin()
        .from('treatment_plan_items')
        .insert(
          itemsPayload.map((it) => ({
            ...it,
            treatment_plan_id: planId,
          }))
        );

      if (itemsError) {
        throw new Error(itemsError.message);
      }
    } catch (err) {
      await getSupabaseAdmin().from('treatment_plans').delete().eq('id', planId);
      throw err;
    }
  }

  await recomputeTotal(planId);
  return getTreatmentPlan(planId);
}

export async function updateTreatmentPlan(
  planId: string,
  input: TreatmentPlanUpdateInput
): Promise<TreatmentPlan> {
  const parsedPlanId = parseUuid(planId, 'planId');
  const payload: Record<string, unknown> = {};

  if (input.providerId !== undefined) {
    payload.provider_id = parseUuid(input.providerId, 'providerId');
  }
  if (input.clinicalVisitId !== undefined) {
    payload.clinical_visit_id = normalizeClinicalVisitId(input.clinicalVisitId);
  }
  if (input.name !== undefined) {
    payload.name = parseNonEmptyString(input.name, 'name');
  }
  if (input.notes !== undefined) {
    payload.notes = parseNotes(input.notes, 'notes');
  }

  if (input.status !== undefined) {
    const newStatus = parseTreatmentPlanStatus(input.status, 'status');
    const { data: current, error } = await getSupabaseAdmin()
      .from('treatment_plans')
      .select('status, accepted_at')
      .eq('id', parsedPlanId)
      .single();

    if (error || !current) {
      throw new NotFoundError('Treatment plan');
    }

    const currentStatus = current.status as TreatmentPlanStatus;
    const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new ValidationError(
        'status',
        `Invalid status transition from ${currentStatus} to ${newStatus}`
      );
    }

    payload.status = newStatus;
    if (newStatus === 'accepted' && currentStatus !== 'accepted') {
      payload.accepted_at = new Date().toISOString();
    }
  }

  const { data, error } = await getSupabaseAdmin()
    .from('treatment_plans')
    .update(payload)
    .eq('id', parsedPlanId)
    .select(PLAN_COLUMNS)
    .single();

  if (error || !data) {
    throw new NotFoundError('Treatment plan');
  }

  return mapPlanRow(data as unknown as Record<string, unknown>);
}

export async function deleteTreatmentPlan(planId: string): Promise<void> {
  const parsedPlanId = parseUuid(planId, 'planId');
  await assertDraft(parsedPlanId);

  const { error } = await getSupabaseAdmin()
    .from('treatment_plans')
    .delete()
    .eq('id', parsedPlanId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function createTreatmentPlanItem(
  planId: string,
  input: TreatmentPlanItemInput
): Promise<TreatmentPlanItem> {
  const parsedPlanId = parseUuid(planId, 'planId');
  await assertDraft(parsedPlanId);

  const payload = {
    treatment_plan_id: parsedPlanId,
    description: parseNonEmptyString(input.description, 'description'),
    service_id: normalizeServiceId(input.serviceId),
    tooth: parseFdiTooth(input.tooth, 'tooth'),
    quantity: input.quantity ?? 1,
    unit_price: parseMoney(input.unitPrice, 'unitPrice'),
    status: 'pending' as const,
  };

  const { data, error } = await getSupabaseAdmin()
    .from('treatment_plan_items')
    .insert(payload)
    .select(ITEM_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(
      (error as { message?: string } | null)?.message ??
        'Failed to create treatment plan item'
    );
  }

  await recomputeTotal(parsedPlanId);
  return mapItemRow(data as unknown as Record<string, unknown>);
}

export async function updateTreatmentPlanItem(
  planId: string,
  itemId: string,
  input: TreatmentPlanItemUpdateInput
): Promise<TreatmentPlanItem> {
  const parsedPlanId = parseUuid(planId, 'planId');
  const parsedItemId = parseUuid(itemId, 'itemId');

  const hasNonStatusFields =
    input.description !== undefined ||
    input.serviceId !== undefined ||
    input.tooth !== undefined ||
    input.quantity !== undefined ||
    input.unitPrice !== undefined;

  if (hasNonStatusFields) {
    await assertDraft(parsedPlanId);
  }

  const payload: Record<string, unknown> = {};
  if (input.description !== undefined) {
    payload.description = parseNonEmptyString(input.description, 'description');
  }
  if (input.serviceId !== undefined) {
    payload.service_id = normalizeServiceId(input.serviceId);
  }
  if (input.tooth !== undefined) {
    payload.tooth = parseFdiTooth(input.tooth, 'tooth');
  }
  if (input.quantity !== undefined) {
    payload.quantity = parseQuantity(input.quantity, 'quantity');
  }
  if (input.unitPrice !== undefined) {
    payload.unit_price = parseMoney(input.unitPrice, 'unitPrice');
  }
  if (input.status !== undefined) {
    payload.status = parseTreatmentPlanItemStatus(input.status, 'status');
  }

  const { data, error } = await getSupabaseAdmin()
    .from('treatment_plan_items')
    .update(payload)
    .eq('id', parsedItemId)
    .eq('treatment_plan_id', parsedPlanId)
    .select(ITEM_COLUMNS)
    .single();

  if (error || !data) {
    throw new NotFoundError('Treatment plan item');
  }

  if (
    hasNonStatusFields &&
    (input.quantity !== undefined || input.unitPrice !== undefined)
  ) {
    await recomputeTotal(parsedPlanId);
  }

  return mapItemRow(data as unknown as Record<string, unknown>);
}

export async function deleteTreatmentPlanItem(
  planId: string,
  itemId: string
): Promise<void> {
  const parsedPlanId = parseUuid(planId, 'planId');
  const parsedItemId = parseUuid(itemId, 'itemId');
  await assertDraft(parsedPlanId);

  const { error } = await getSupabaseAdmin()
    .from('treatment_plan_items')
    .delete()
    .eq('id', parsedItemId);

  if (error) {
    throw new Error(error.message);
  }

  await recomputeTotal(parsedPlanId);
}
