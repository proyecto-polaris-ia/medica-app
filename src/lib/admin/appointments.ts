import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { Appointment, AppointmentInput, ProviderAppointment } from './types';
import {
  parseAppointmentStatus,
  parseIsoDate,
  parseNotes,
  parseUuid,
  ValidationError,
} from './validate';
import { ConflictError, NotFoundError } from './errors';

const SELECT_COLUMNS =
  'id, patient_id, service_id, provider_id, start_at, end_at, status, notes, created_at, updated_at';

function mapRow(row: Record<string, unknown>): Appointment {
  return {
    id: row.id as string,
    patientId: (row.patient_id as string | null) ?? null,
    serviceId: row.service_id as string,
    providerId: row.provider_id as string,
    startAt: row.start_at as string,
    endAt: row.end_at as string,
    status: row.status as Appointment['status'],
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listAppointments(): Promise<Appointment[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('appointments')
    .select(SELECT_COLUMNS)
    .order('start_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapRow);
}

const MAX_RANGE_DAYS = 62;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function validateDateRange(
  startAtIso: string,
  endAtIso: string,
  startField = 'start',
  endField = 'end'
): { startAt: Date; endAt: Date } {
  const startAt = parseIsoDate(startAtIso, startField);
  const endAt = parseIsoDate(endAtIso, endField);

  if (endAt <= startAt) {
    throw new ValidationError(endField, `${endField} must be after ${startField}`);
  }

  const spanDays = (endAt.getTime() - startAt.getTime()) / ONE_DAY_MS;
  if (spanDays > MAX_RANGE_DAYS) {
    throw new ValidationError(endField, 'Range cannot exceed 62 days');
  }

  return { startAt, endAt };
}

export async function listAppointmentsRange(
  startAtIso: string,
  endAtIso: string
): Promise<Appointment[]> {
  const { startAt, endAt } = validateDateRange(startAtIso, endAtIso);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('appointments')
    .select(SELECT_COLUMNS)
    .gte('start_at', startAt.toISOString())
    .lt('start_at', endAt.toISOString())
    .order('start_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapRow);
}

function validateAppointmentInput(input: AppointmentInput): {
  patient_id?: string | null;
  service_id: string;
  provider_id: string;
  start_at: string;
  end_at: string;
  status: Appointment['status'];
  notes: string | null;
} {
  const startAt = parseIsoDate(input.startAt, 'startAt');
  const endAt = parseIsoDate(input.endAt, 'endAt');
  if (endAt <= startAt) {
    throw new ValidationError('endAt', 'endAt must be after startAt');
  }

  return {
    patient_id: input.patientId === undefined ? null : input.patientId,
    service_id: parseUuid(input.serviceId, 'serviceId'),
    provider_id: parseUuid(input.providerId, 'providerId'),
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    status: parseAppointmentStatus(
      input.status ?? 'requested',
      'status'
    ),
    notes: parseNotes(input.notes, 'notes'),
  };
}

function isPostgresError(
  error: unknown
): error is { code: string; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: string }).code === 'string'
  );
}

export async function createAppointment(
  input: AppointmentInput
): Promise<Appointment> {
  const payload = validateAppointmentInput(input);
  const supabase = getSupabaseAdmin();

  try {
    const { data, error } = await supabase
      .from('appointments')
      .insert(payload)
      .select(SELECT_COLUMNS)
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'Failed to create appointment');
    }

    return mapRow(data);
  } catch (error) {
    if (isPostgresError(error) && error.code === '23P01') {
      throw new ConflictError(
        'The selected time slot overlaps with an existing appointment for this provider.'
      );
    }
    throw error;
  }
}

export async function updateAppointment(
  id: string,
  input: AppointmentInput
): Promise<Appointment> {
  const parsedId = parseUuid(id, 'id');
  const payload = validateAppointmentInput(input);
  const supabase = getSupabaseAdmin();

  try {
    const { data, error } = await supabase
      .from('appointments')
      .update(payload)
      .eq('id', parsedId)
      .select(SELECT_COLUMNS)
      .single();

    if (error) {
      throw new Error(error.message);
    }
    if (!data) {
      throw new NotFoundError('Appointment');
    }

    return mapRow(data);
  } catch (error) {
    if (isPostgresError(error) && error.code === '23P01') {
      throw new ConflictError(
        'The selected time slot overlaps with an existing appointment for this provider.'
      );
    }
    throw error;
  }
}

export async function deleteAppointment(id: string): Promise<void> {
  const parsedId = parseUuid(id, 'id');
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('id', parsedId);

  if (error) {
    throw new Error(error.message);
  }
}

const PROVIDER_APPOINTMENT_SELECT = '*, patients(*), services(*)';

function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value === undefined || value === null) return [];
  return [value as T];
}

function extractPatientName(patientEmbed: unknown): string {
  const rows = toArray<{ full_name?: string; fullName?: string }>(patientEmbed);
  const row = rows[0];
  if (!row) return 'Sin paciente';
  return row.full_name ?? row.fullName ?? 'Sin paciente';
}

function extractServiceName(serviceEmbed: unknown): string {
  const rows = toArray<{ name?: string }>(serviceEmbed);
  const row = rows[0];
  if (!row?.name) return 'Servicio desconocido';
  return row.name;
}

function mapProviderAppointmentRow(row: Record<string, unknown>): ProviderAppointment {
  return {
    id: row.id as string,
    patientId: (row.patient_id as string | null) ?? null,
    patientName: extractPatientName(row.patients),
    serviceName: extractServiceName(row.services),
    startAt: row.start_at as string,
    endAt: row.end_at as string,
    status: row.status as Appointment['status'],
  };
}

export async function listUpcomingByProvider(
  providerId: string,
  now: Date,
  limit = 10
): Promise<ProviderAppointment[]> {
  const parsedId = parseUuid(providerId, 'providerId');
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('appointments')
    .select(PROVIDER_APPOINTMENT_SELECT)
    .eq('provider_id', parsedId)
    .gt('start_at', now.toISOString())
    .order('start_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapProviderAppointmentRow);
}

export async function listByProviderRange(
  providerId: string,
  startInclusive: Date,
  endExclusive: Date
): Promise<ProviderAppointment[]> {
  const parsedId = parseUuid(providerId, 'providerId');
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('appointments')
    .select(PROVIDER_APPOINTMENT_SELECT)
    .eq('provider_id', parsedId)
    .gte('start_at', startInclusive.toISOString())
    .lt('start_at', endExclusive.toISOString())
    .order('start_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapProviderAppointmentRow);
}
