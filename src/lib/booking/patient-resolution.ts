import { ConflictError, NotFoundError } from '../admin/errors';
import { getSupabaseAdmin } from '../supabase/server';
import { normalizePatientContact } from './patient-contact';

export type ResolvedPatient = { id: string; full_name: string };
export class PatientIdentityConflictError extends ConflictError {
  constructor() { super('The provided contacts belong to different patients', 'patient_identity_conflict'); this.name = 'PatientIdentityConflictError'; }
}

type ContactInput = { phone?: string; email?: string; fullName?: string };
async function findPatient(field: 'phone_e164' | 'email', value: string): Promise<ResolvedPatient | null> {
  const { data, error } = await getSupabaseAdmin().from('patients').select('id, full_name').eq(field, value).maybeSingle();
  if (error) throw new Error(`Failed to resolve patient: ${error.message}`);
  return data;
}
export async function resolvePatientById(id: string): Promise<ResolvedPatient> {
  const { data, error } = await getSupabaseAdmin().from('patients').select('id, full_name').eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to resolve patient: ${error.message}`);
  if (!data) throw new NotFoundError('Patient');
  return data;
}
async function enrichMissingContact(patient: ResolvedPatient, field: 'phone_e164' | 'email', value: string): Promise<void> {
  const client = getSupabaseAdmin();
  const { data, error } = await client.from('patients').update({ [field]: value }).eq('id', patient.id).is(field, null).select('id').maybeSingle();
  if (data) return;
  if (error && error.code !== '23505') throw new Error(`Failed to update patient contact: ${error.message}`);
  const owner = await findPatient(field, value);
  if (owner?.id === patient.id) return;
  throw new PatientIdentityConflictError();
}
export async function resolvePatient(input: ContactInput): Promise<ResolvedPatient> {
  const { phone, email } = normalizePatientContact(input);
  const [phonePatient, emailPatient] = await Promise.all([
    phone ? findPatient('phone_e164', phone) : Promise.resolve(null),
    email ? findPatient('email', email) : Promise.resolve(null),
  ]);
  if (phonePatient && emailPatient && phonePatient.id !== emailPatient.id) throw new PatientIdentityConflictError();
  const existing = phonePatient ?? emailPatient;
  if (existing) {
    if (phone && !phonePatient) await enrichMissingContact(existing, 'phone_e164', phone);
    if (email && !emailPatient) await enrichMissingContact(existing, 'email', email);
    return existing;
  }
  const payload = { full_name: input.fullName?.trim() || `Patient ${phone ?? email}`, phone_e164: phone ?? null, email: email ?? null };
  const { data, error } = await getSupabaseAdmin().from('patients').insert(payload).select('id, full_name').single();
  if (data) return data;
  if (error?.code === '23505') {
    const [phoneOwner, emailOwner] = await Promise.all([
      phone ? findPatient('phone_e164', phone) : Promise.resolve(null),
      email ? findPatient('email', email) : Promise.resolve(null),
    ]);
    if (phoneOwner && emailOwner && phoneOwner.id !== emailOwner.id) throw new PatientIdentityConflictError();
    const retried = phoneOwner ?? emailOwner;
    if (retried) {
      if (phone && !phoneOwner) await enrichMissingContact(retried, 'phone_e164', phone);
      if (email && !emailOwner) await enrichMissingContact(retried, 'email', email);
      return retried;
    }
  }
  throw new Error(`Failed to create patient: ${error?.message ?? 'no row'}`);
}
