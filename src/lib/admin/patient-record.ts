import { getSupabaseAdmin } from '@/lib/supabase/server';
import { NotFoundError } from './errors';
import type {
  AppointmentStatus,
  Patient,
  PatientRecord,
  PatientRecordAppointment,
} from './types';
import { parseUuid } from './validate';

const PATIENT_SELECT = 'id, full_name, phone_e164, email, notes, created_at, updated_at';
const APPOINTMENT_SELECT =
  'id, patient_id, service_id, provider_id, start_at, end_at, status, notes, created_at, updated_at, services(name), providers(name)';

const INACTIVE_FUTURE_STATUSES = new Set<AppointmentStatus>([
  'cancelled',
  'rescheduled',
  'no_show',
  'attended',
]);

function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value === undefined || value === null) return [];
  return [value as T];
}

function mapPatient(row: Record<string, unknown>): Patient {
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

function embeddedName(value: unknown, fallback: string): string {
  const row = toArray<{ name?: string; full_name?: string; fullName?: string }>(value)[0];
  return row?.name ?? row?.full_name ?? row?.fullName ?? fallback;
}

function mapAppointment(row: Record<string, unknown>): PatientRecordAppointment {
  return {
    id: row.id as string,
    patientId: (row.patient_id as string | null) ?? null,
    serviceId: row.service_id as string,
    providerId: row.provider_id as string,
    startAt: row.start_at as string,
    endAt: row.end_at as string,
    status: row.status as AppointmentStatus,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    serviceName: embeddedName(row.services, 'Servicio desconocido'),
    providerName: embeddedName(row.providers, 'Proveedor desconocido'),
  };
}

function isFutureActive(appointment: PatientRecordAppointment, now: Date): boolean {
  return (
    new Date(appointment.startAt).getTime() >= now.getTime() &&
    !INACTIVE_FUTURE_STATUSES.has(appointment.status)
  );
}

export function buildPatientRecord(
  patient: Patient,
  appointments: PatientRecordAppointment[],
  now = new Date()
): PatientRecord {
  return {
    patient,
    upcomingAppointments: appointments
      .filter((appointment) => isFutureActive(appointment, now))
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
    attendedAppointments: appointments
      .filter((appointment) => appointment.status === 'attended')
      .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime()),
  };
}

export async function getPatientRecord(
  patientId: string,
  now = new Date()
): Promise<PatientRecord> {
  const parsedId = parseUuid(patientId, 'id');
  const supabase = getSupabaseAdmin();

  const { data: patientRow, error: patientError } = await supabase
    .from('patients')
    .select(PATIENT_SELECT)
    .eq('id', parsedId)
    .single();

  if (patientError || !patientRow) {
    throw new NotFoundError('Patient');
  }

  const { data: appointmentRows, error: appointmentError } = await supabase
    .from('appointments')
    .select(APPOINTMENT_SELECT)
    .eq('patient_id', parsedId)
    .order('start_at', { ascending: true });

  if (appointmentError) {
    throw new Error(appointmentError.message);
  }

  return buildPatientRecord(
    mapPatient(patientRow),
    (appointmentRows ?? []).map(mapAppointment),
    now
  );
}
