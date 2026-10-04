/**
 * Onboarding Context — capa de I/O del disparador (design.md D5).
 *
 * Lee, de forma **read-only**, los hechos persistidos que deciden si el
 * onboarding arranca: paciente por teléfono, existencia de historia clínica y
 * cita futura elegible. No crea pacientes ni escribe nada.
 */

import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { MedicalHistorySource, Sex } from '@/lib/admin/types';

export type OnboardingStartContext = {
  patientId: string;
  patientName: string;
  phone: string;
  sex: Sex | null;
  historyExists: boolean;
  source: MedicalHistorySource | null;
  email: string | null;
  missingEmail: boolean;
  hasFutureScheduledAppointment: boolean;
};

function readPatient(row: Record<string, unknown>): {
  id: string;
  fullName: string;
  email: string | null;
  sex: Sex | null;
} {
  return {
    id: row.id as string,
    fullName: (row.full_name as string | null) ?? '',
    email: (row.email as string | null) ?? null,
    sex: (row.sex as Sex | null) ?? null,
  };
}

export async function hasFutureScheduledAppointment(
  patientId: string,
  now: Date
): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from('appointments')
    .select('id')
    .eq('patient_id', patientId)
    .gt('start_at', now.toISOString())
    .in('status', ['confirmed', 'pending'])
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check future appointments: ${error.message}`);
  }
  return data != null;
}

export async function loadOnboardingStartContext(input: {
  phone: string;
  now?: Date;
}): Promise<OnboardingStartContext | null> {
  const now = input.now ?? new Date();
  const client = getSupabaseAdmin();

  const { data: patientRow, error: patientError } = await client
    .from('patients')
    .select('id, full_name, email, sex')
    .eq('phone_e164', input.phone)
    .maybeSingle();

  if (patientError) {
    throw new Error(`Failed to load patient for onboarding: ${patientError.message}`);
  }
  if (!patientRow) return null;

  const patient = readPatient(patientRow as unknown as Record<string, unknown>);

  const { data: historyRow, error: historyError } = await client
    .from('patient_medical_history')
    .select('patient_id, source')
    .eq('patient_id', patient.id)
    .maybeSingle();

  if (historyError) {
    throw new Error(
      `Failed to load medical history for onboarding: ${historyError.message}`
    );
  }

  const hasFuture = await hasFutureScheduledAppointment(patient.id, now);
  const history = (historyRow as unknown as Record<string, unknown> | null) ?? null;

  return {
    patientId: patient.id,
    patientName: patient.fullName,
    phone: input.phone,
    sex: patient.sex,
    historyExists: history != null,
    source: (history?.source as MedicalHistorySource | undefined) ?? null,
    email: patient.email,
    missingEmail: patient.email === null,
    hasFutureScheduledAppointment: hasFuture,
  };
}
