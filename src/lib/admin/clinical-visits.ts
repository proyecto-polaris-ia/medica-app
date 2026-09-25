import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { ClinicalVisit, ClinicalVisitInput } from './types';
import { NotFoundError } from './errors';
import {
  parseNonEmptyString,
  parseOptionalString,
  parseUuid,
} from './validate';

const SELECT_COLUMNS = [
  'id',
  'patient_id',
  'appointment_id',
  'provider_id',
  'subjective',
  'objective',
  'assessment',
  'plan',
  'treatment',
  'notes',
  'created_at',
  'updated_at',
].join(', ');

function mapRow(row: Record<string, unknown>): ClinicalVisit {
  return {
    id: row.id as string,
    patientId: row.patient_id as string,
    appointmentId: (row.appointment_id as string | null) ?? null,
    providerId: (row.provider_id as string | null) ?? null,
    subjective: row.subjective as string,
    objective: (row.objective as string | null) ?? null,
    assessment: (row.assessment as string | null) ?? null,
    plan: (row.plan as string | null) ?? null,
    treatment: (row.treatment as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function normalizeOptionalSoapField(
  value: unknown,
  partial: boolean
): string | null | undefined {
  if (value === undefined) {
    return partial ? undefined : null;
  }
  return parseOptionalString(value);
}

function validateClinicalVisitInput(
  input: ClinicalVisitInput,
  partial = false
): Record<string, unknown> {
  return {
    subjective:
      input.subjective === undefined
        ? undefined
        : parseNonEmptyString(input.subjective, 'subjective'),
    objective: normalizeOptionalSoapField(input.objective, partial),
    assessment: normalizeOptionalSoapField(input.assessment, partial),
    plan: normalizeOptionalSoapField(input.plan, partial),
    treatment: normalizeOptionalSoapField(input.treatment, partial),
    notes: normalizeOptionalSoapField(input.notes, partial),
  };
}

function normalizeNullableUuid(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return parseUuid(value as string, 'appointmentId');
}

export async function listClinicalVisits(
  patientId: string
): Promise<ClinicalVisit[]> {
  const parsedId = parseUuid(patientId, 'patientId');
  const { data, error } = await getSupabaseAdmin()
    .from('clinical_visits')
    .select(SELECT_COLUMNS)
    .eq('patient_id', parsedId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error((error as { message: string }).message);
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapRow);
}

export async function getClinicalVisit(
  patientId: string,
  visitId: string
): Promise<ClinicalVisit> {
  const parsedPatientId = parseUuid(patientId, 'patientId');
  const parsedVisitId = parseUuid(visitId, 'visitId');
  const { data, error } = await getSupabaseAdmin()
    .from('clinical_visits')
    .select(SELECT_COLUMNS)
    .eq('id', parsedVisitId)
    .eq('patient_id', parsedPatientId)
    .single();

  if (error || !data) {
    throw new NotFoundError('Clinical visit');
  }
  return mapRow(data as unknown as Record<string, unknown>);
}

export async function createClinicalVisit(
  patientId: string,
  input: ClinicalVisitInput
): Promise<ClinicalVisit> {
  const parsedPatientId = parseUuid(patientId, 'patientId');
  const payload = {
    patient_id: parsedPatientId,
    appointment_id: normalizeNullableUuid(input.appointmentId),
    provider_id: normalizeNullableUuid(input.providerId),
    ...validateClinicalVisitInput(input),
  };
  const { data, error } = await getSupabaseAdmin()
    .from('clinical_visits')
    .insert(payload)
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(
      (error as { message?: string } | null)?.message ??
        'Failed to create clinical visit'
    );
  }
  return mapRow(data as unknown as Record<string, unknown>);
}

export async function updateClinicalVisit(
  patientId: string,
  visitId: string,
  input: ClinicalVisitInput
): Promise<ClinicalVisit> {
  const parsedPatientId = parseUuid(patientId, 'patientId');
  const parsedVisitId = parseUuid(visitId, 'visitId');
  const payload = {
    appointment_id:
      input.appointmentId === undefined
        ? undefined
        : normalizeNullableUuid(input.appointmentId),
    provider_id:
      input.providerId === undefined
        ? undefined
        : normalizeNullableUuid(input.providerId),
    ...validateClinicalVisitInput(input, true),
  };
  const { data, error } = await getSupabaseAdmin()
    .from('clinical_visits')
    .update(payload)
    .eq('id', parsedVisitId)
    .eq('patient_id', parsedPatientId)
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    throw new NotFoundError('Clinical visit');
  }
  return mapRow(data as unknown as Record<string, unknown>);
}

export async function deleteClinicalVisit(
  patientId: string,
  visitId: string
): Promise<void> {
  const parsedPatientId = parseUuid(patientId, 'patientId');
  const parsedVisitId = parseUuid(visitId, 'visitId');
  const { error } = await getSupabaseAdmin()
    .from('clinical_visits')
    .delete()
    .eq('id', parsedVisitId)
    .eq('patient_id', parsedPatientId);

  if (error) {
    throw new Error(error.message);
  }
}
