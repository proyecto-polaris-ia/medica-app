import { getSupabaseAdmin } from '@/lib/supabase/server';
import { NotFoundError } from './errors';
import type {
  AppointmentStatus,
  Patient,
  PatientAppointmentsPage,
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

/**
 * Filtro PostgREST de estados inactivos para "citas futuras". Se deriva de la
 * misma lista que clasificaba el record en memoria: una sola fuente de verdad.
 */
const INACTIVE_FUTURE_STATUS_FILTER = `(${[...INACTIVE_FUTURE_STATUSES].join(',')})`;

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

/** PostgREST responde 416 cuando el `offset` solicitado excede el total. */
function isRangeNotSatisfiable(error: { code?: string; message: string }): boolean {
  return error.code === 'PGRST103' || /range not satisfiable/i.test(error.message);
}

/**
 * Verifica que el paciente exista antes de paginar sus citas. Un id válido
 * que no existe se traduce a `NotFoundError`.
 */
async function assertPatientExists(parsedId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('patients')
    .select('id')
    .eq('id', parsedId)
    .single();

  if (error || !data) {
    throw new NotFoundError('Patient');
  }
}

export async function getPatientRecord(patientId: string): Promise<PatientRecord> {
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

  // Las citas del expediente se consumen exclusivamente de los endpoints
  // paginados (`listPatientUpcomingAppointmentsPage` /
  // `listPatientAttendedAppointmentsPage`): el record queda acotado.
  return { patient: mapPatient(patientRow) };
}

/**
 * Página de citas futuras activas del paciente: `start_at` ascendente,
 * excluyendo estados inactivos y citas en el pasado. `total` cuenta el
 * conjunto filtrado completo, independientemente de la página. `now` es la
 * hora del servidor (parámetro para pruebas deterministas).
 */
export async function listPatientUpcomingAppointmentsPage(
  patientId: string,
  page: number,
  pageSize: number,
  now = new Date()
): Promise<PatientAppointmentsPage> {
  const parsedId = parseUuid(patientId, 'id');
  const supabase = getSupabaseAdmin();
  await assertPatientExists(parsedId);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const buildQuery = () =>
    supabase
      .from('appointments')
      .select(APPOINTMENT_SELECT, { count: 'exact' })
      .eq('patient_id', parsedId)
      .gte('start_at', now.toISOString())
      .not('status', 'in', INACTIVE_FUTURE_STATUS_FILTER)
      .order('start_at', { ascending: true })
      // Desempate estable para que la paginación no repita filas.
      .order('id', { ascending: true });

  let { data, count, error } = await buildQuery().range(from, to);

  // Una página más allá del total no debe romper la respuesta: PostgREST
  // responde 416 sin exponer el total, así que se repite la consulta con un
  // rango válido solo para recuperar el `count` exacto.
  let outOfRangePage = false;
  if (error && isRangeNotSatisfiable(error)) {
    outOfRangePage = true;
    ({ data, count, error } = await buildQuery().range(0, 0));
  }

  if (error) {
    throw new Error(error.message);
  }

  if (outOfRangePage) {
    return { appointments: [], total: count ?? 0 };
  }

  return {
    appointments: ((data ?? []) as unknown as Record<string, unknown>[]).map(
      mapAppointment
    ),
    total: count ?? 0,
  };
}

/**
 * Página del historial de citas asistidas del paciente: estado `attended` y
 * `start_at` descendente (la más reciente primero).
 */
export async function listPatientAttendedAppointmentsPage(
  patientId: string,
  page: number,
  pageSize: number
): Promise<PatientAppointmentsPage> {
  const parsedId = parseUuid(patientId, 'id');
  const supabase = getSupabaseAdmin();
  await assertPatientExists(parsedId);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const buildQuery = () =>
    supabase
      .from('appointments')
      .select(APPOINTMENT_SELECT, { count: 'exact' })
      .eq('patient_id', parsedId)
      .eq('status', 'attended')
      .order('start_at', { ascending: false })
      .order('id', { ascending: true });

  let { data, count, error } = await buildQuery().range(from, to);

  let outOfRangePage = false;
  if (error && isRangeNotSatisfiable(error)) {
    outOfRangePage = true;
    ({ data, count, error } = await buildQuery().range(0, 0));
  }

  if (error) {
    throw new Error(error.message);
  }

  if (outOfRangePage) {
    return { appointments: [], total: count ?? 0 };
  }

  return {
    appointments: ((data ?? []) as unknown as Record<string, unknown>[]).map(
      mapAppointment
    ),
    total: count ?? 0,
  };
}
