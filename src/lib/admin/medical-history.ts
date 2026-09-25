import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { MedicalHistory, MedicalHistoryInput } from './types';
import {
  parseStatus,
  parseStringArray,
  parseOptionalString,
  parseUuid,
} from './validate';

const SELECT_COLUMNS = [
  'patient_id',
  'allergies',
  'systemic_conditions',
  'medications',
  'pregnancy_status',
  'coagulation_disorders',
  'anticoagulants',
  'surgeries',
  'infectious_diseases',
  'smoking',
  'alcohol',
  'dental_history',
  'oral_habits',
  'clinical_notes',
  'created_at',
  'updated_at',
].join(', ');

function mapRow(row: Record<string, unknown>): MedicalHistory {
  return {
    patientId: row.patient_id as string,
    allergies: (row.allergies as string[] | null) ?? [],
    systemicConditions: (row.systemic_conditions as string[] | null) ?? [],
    medications: (row.medications as string[] | null) ?? [],
    pregnancyStatus: (row.pregnancy_status as MedicalHistory['pregnancyStatus']) ?? null,
    coagulationDisorders: (row.coagulation_disorders as string | null) ?? null,
    anticoagulants: (row.anticoagulants as string | null) ?? null,
    surgeries: (row.surgeries as string | null) ?? null,
    infectiousDiseases: (row.infectious_diseases as string | null) ?? null,
    smoking: (row.smoking as MedicalHistory['smoking']) ?? null,
    alcohol: (row.alcohol as MedicalHistory['alcohol']) ?? null,
    dentalHistory: (row.dental_history as string | null) ?? null,
    oralHabits: (row.oral_habits as string[] | null) ?? [],
    clinicalNotes: (row.clinical_notes as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function emptyHistory(patientId: string): MedicalHistory {
  const now = new Date().toISOString();
  return {
    patientId,
    allergies: [],
    systemicConditions: [],
    medications: [],
    pregnancyStatus: null,
    coagulationDisorders: null,
    anticoagulants: null,
    surgeries: null,
    infectiousDiseases: null,
    smoking: null,
    alcohol: null,
    dentalHistory: null,
    oralHabits: [],
    clinicalNotes: null,
    createdAt: now,
    updatedAt: now,
  };
}

function validateMedicalHistoryInput(
  input: MedicalHistoryInput
): Record<string, unknown> {
  return {
    allergies: parseStringArray(input.allergies),
    systemic_conditions: parseStringArray(input.systemicConditions),
    medications: parseStringArray(input.medications),
    pregnancy_status: parseStatus(
      input.pregnancyStatus,
      ['not_applicable', 'no', 'yes'],
      'pregnancyStatus'
    ),
    coagulation_disorders: parseOptionalString(input.coagulationDisorders),
    anticoagulants: parseOptionalString(input.anticoagulants),
    surgeries: parseOptionalString(input.surgeries),
    infectious_diseases: parseOptionalString(input.infectiousDiseases),
    smoking: parseStatus(
      input.smoking,
      ['never', 'former', 'current'],
      'smoking'
    ),
    alcohol: parseStatus(
      input.alcohol,
      ['never', 'occasional', 'frequent'],
      'alcohol'
    ),
    dental_history: parseOptionalString(input.dentalHistory),
    oral_habits: parseStringArray(input.oralHabits),
    clinical_notes: parseOptionalString(input.clinicalNotes),
  };
}

export async function getMedicalHistory(
  patientId: string
): Promise<MedicalHistory> {
  const parsedId = parseUuid(patientId, 'patientId');
  const { data, error } = await getSupabaseAdmin()
    .from('patient_medical_history')
    .select(SELECT_COLUMNS)
    .eq('patient_id', parsedId)
    .single();

  if (error?.code === 'PGRST116' || !data) {
    return emptyHistory(parsedId);
  }
  if (error) {
    throw new Error((error as { message: string }).message);
  }
  return mapRow(data as unknown as Record<string, unknown>);
}

export async function upsertMedicalHistory(
  patientId: string,
  input: MedicalHistoryInput
): Promise<MedicalHistory> {
  const parsedId = parseUuid(patientId, 'patientId');
  const payload = {
    patient_id: parsedId,
    ...validateMedicalHistoryInput(input),
  };
  const { data, error } = await getSupabaseAdmin()
    .from('patient_medical_history')
    .upsert(payload, { onConflict: 'patient_id' })
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(
      (error as { message?: string } | null)?.message ??
        'Failed to upsert medical history'
    );
  }
  return mapRow(data as unknown as Record<string, unknown>);
}
