import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { Patient, PatientInput } from './types';
import {
  parseDate,
  parseNonEmptyString,
  parseOptionalString,
  parsePhoneE164,
  parseSex,
  parseUuid,
} from './validate';
import { ConflictError } from './errors';
import { normalizePatientContact } from '@/lib/booking/patient-contact';

const SELECT_COLUMNS = 'id, full_name, phone_e164, email, notes, birth_date, sex, address, occupation, referral_source, secondary_phone, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, created_at, updated_at';
function mapRow(row: Record<string, unknown>): Patient {
  return {
    id: row.id as string,
    fullName: row.full_name as string,
    phoneE164: (row.phone_e164 as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    birthDate: (row.birth_date as string | null) ?? null,
    sex: (row.sex as Patient['sex']) ?? null,
    address: (row.address as string | null) ?? null,
    occupation: (row.occupation as string | null) ?? null,
    referralSource: (row.referral_source as string | null) ?? null,
    secondaryPhone: (row.secondary_phone as string | null) ?? null,
    emergencyContactName: (row.emergency_contact_name as string | null) ?? null,
    emergencyContactPhone: (row.emergency_contact_phone as string | null) ?? null,
    emergencyContactRelationship: (row.emergency_contact_relationship as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
function parseOptionalPhone(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return parsePhoneE164(trimmed, 'secondaryPhone');
}
function validatePatientInput(input: PatientInput) {
  const contact = normalizePatientContact({ phone: input.phoneE164, email: input.email });
  return {
    full_name: parseNonEmptyString(input.fullName, 'fullName'),
    phone_e164: contact.phone ?? null,
    email: contact.email ?? null,
    notes: input.notes,
    birth_date: parseDate(input.birthDate, 'birthDate'),
    sex: parseSex(input.sex),
    address: parseOptionalString(input.address),
    occupation: parseOptionalString(input.occupation),
    referral_source: parseOptionalString(input.referralSource),
    secondary_phone: parseOptionalPhone(input.secondaryPhone),
    emergency_contact_name: parseOptionalString(input.emergencyContactName),
    emergency_contact_phone: parseOptionalPhone(input.emergencyContactPhone),
    emergency_contact_relationship: parseOptionalString(input.emergencyContactRelationship),
  };
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
