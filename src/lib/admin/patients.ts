import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { Patient, PatientInput } from './types';
import {
  parseNonEmptyString,
  parsePhoneE164,
  parseUuid,
  ValidationError,
} from './validate';

const SELECT_COLUMNS =
  'id, full_name, phone_e164, notes, created_at, updated_at';

function mapRow(row: Record<string, unknown>): Patient {
  return {
    id: row.id as string,
    fullName: row.full_name as string,
    phoneE164: row.phone_e164 as string,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listPatients(): Promise<Patient[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('patients')
    .select(SELECT_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapRow);
}

export async function searchPatients(q: string): Promise<Patient[]> {
  const trimmed = q.trim();
  if (!trimmed) {
    return [];
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('patients')
    .select(SELECT_COLUMNS)
    .or(`full_name.ilike.%${trimmed}%,phone_e164.ilike.%${trimmed}%`)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapRow);
}

function validatePatientInput(input: PatientInput): {
  full_name: string;
  phone_e164: string;
  notes?: string | null;
} {
  return {
    full_name: parseNonEmptyString(input.fullName, 'fullName'),
    phone_e164: parsePhoneE164(input.phoneE164, 'phoneE164'),
    notes: input.notes,
  };
}

export async function createPatient(input: PatientInput): Promise<Patient> {
  const payload = validatePatientInput(input);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('patients')
    .insert(payload)
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create patient');
  }

  return mapRow(data);
}

export async function updatePatient(
  id: string,
  input: PatientInput
): Promise<Patient> {
  const parsedId = parseUuid(id, 'id');
  const payload = validatePatientInput(input);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('patients')
    .update(payload)
    .eq('id', parsedId)
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error('Patient not found');
  }

  return mapRow(data);
}

export async function deletePatient(id: string): Promise<void> {
  const parsedId = parseUuid(id, 'id');
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('patients').delete().eq('id', parsedId);

  if (error) {
    throw new Error(error.message);
  }
}
