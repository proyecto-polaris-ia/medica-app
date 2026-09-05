import { NotFoundError } from '../admin/errors';
import { getSupabaseAdmin } from '../supabase/server';

export async function resolvePatientById(
  id: string
): Promise<{ id: string; full_name: string }> {
  const supabase = getSupabaseAdmin();

  const { data: patient, error } = await supabase
    .from('patients')
    .select('id, full_name')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve patient: ${error.message}`);
  }
  if (!patient) {
    throw new NotFoundError('Patient');
  }

  return patient;
}

export async function resolvePatient({
  phone,
  fullName,
}: {
  phone: string;
  fullName?: string;
}): Promise<{ id: string; full_name: string }> {
  const supabase = getSupabaseAdmin();

  const { data: existing, error: selectError } = await supabase
    .from('patients')
    .select('id, full_name')
    .eq('phone_e164', phone)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to resolve patient: ${selectError.message}`);
  }
  if (existing) {
    return existing;
  }

  // Upsert on the unique phone_e164 to handle a concurrent insert race.
  const { data: created, error: upsertError } = await supabase
    .from('patients')
    .upsert(
      { phone_e164: phone, full_name: fullName ?? `Patient ${phone}` },
      { onConflict: 'phone_e164' }
    )
    .select('id, full_name')
    .single();

  if (upsertError || !created) {
    throw new Error(`Failed to create patient: ${upsertError?.message ?? 'no row'}`);
  }

  return created;
}
