import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { Patient, PatientInput } from './types';
import { parseNonEmptyString, parseUuid } from './validate';
import { ConflictError } from './errors';
import { normalizePatientContact } from '@/lib/booking/patient-contact';

const SELECT_COLUMNS = 'id, full_name, phone_e164, email, notes, created_at, updated_at';
function mapRow(row: Record<string, unknown>): Patient {
  return { id: row.id as string, fullName: row.full_name as string, phoneE164: (row.phone_e164 as string | null) ?? null, email: (row.email as string | null) ?? null, notes: (row.notes as string | null) ?? null, createdAt: row.created_at as string, updatedAt: row.updated_at as string };
}
function validatePatientInput(input: PatientInput) {
  const contact = normalizePatientContact({ phone: input.phoneE164, email: input.email });
  return { full_name: parseNonEmptyString(input.fullName, 'fullName'), phone_e164: contact.phone ?? null, email: contact.email ?? null, notes: input.notes };
}
function throwPatientError(error: { code?: string; message?: string } | null | undefined, fallback: string): never {
  if (error?.code === '23505') throw new ConflictError('Contact already registered', 'contact_conflict');
  throw new Error(error?.message ?? fallback);
}
export async function listPatients(): Promise<Patient[]> { const { data, error } = await getSupabaseAdmin().from('patients').select(SELECT_COLUMNS).order('created_at', { ascending: false }); if (error) throw new Error(error.message); return (data ?? []).map(mapRow); }
export async function searchPatients(q: string): Promise<Patient[]> { const trimmed=q.trim(); if(!trimmed)return []; const {data,error}=await getSupabaseAdmin().from('patients').select(SELECT_COLUMNS).or(`full_name.ilike.%${trimmed}%,phone_e164.ilike.%${trimmed}%,email.ilike.%${trimmed}%`).order('created_at',{ascending:false}); if(error)throw new Error(error.message); return (data??[]).map(mapRow); }
export async function createPatient(input: PatientInput): Promise<Patient> { const {data,error}=await getSupabaseAdmin().from('patients').insert(validatePatientInput(input)).select(SELECT_COLUMNS).single(); if(error||!data) throwPatientError(error,'Failed to create patient'); return mapRow(data); }
export async function updatePatient(id:string,input:PatientInput):Promise<Patient>{const payload=validatePatientInput(input);const parsedId=parseUuid(id,'id');const {data,error}=await getSupabaseAdmin().from('patients').update(payload).eq('id',parsedId).select(SELECT_COLUMNS).single();if(error||!data)throwPatientError(error,'Patient not found');return mapRow(data)}
export async function deletePatient(id:string):Promise<void>{const {error}=await getSupabaseAdmin().from('patients').delete().eq('id',parseUuid(id,'id'));if(error)throw new Error(error.message)}
