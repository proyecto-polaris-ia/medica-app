import { getSupabaseAdmin } from '@/lib/supabase/server';
import { clinicDayKey } from '@/lib/admin/timezone';
import type { TreatmentPlanStatus } from '../types';
import { parseNotes, parseUuid, ValidationError } from '../validate';
import {
  buildFollowUpList,
  type FollowUpAppointment,
  type FollowUpAppointmentStatus,
  type FollowUpPlan,
} from './rules';
import type {
  FollowUpCase,
  FollowUpContact,
  FollowUpContactStatus,
} from './types';

/**
 * Capa de datos del módulo de seguimiento.
 *
 * Patrón de `treatment-plans.ts`: `SELECT_COLUMNS` explícitos (nunca
 * `select('*')`), `mapRow` snake→camel y `getSupabaseAdmin()` server-only.
 * La lectura es masiva y se agrupa en memoria (sin N+1).
 */

const APPOINTMENT_COLUMNS = 'id, patient_id, start_at, status';
const PLAN_COLUMNS = 'id, patient_id, name, status, created_at, updated_at';
const VISIT_COLUMNS = 'patient_id, created_at';
const PATIENT_COLUMNS = 'id, full_name, phone_e164';
const CONTACT_COLUMNS = [
  'id',
  'patient_id',
  'round_date',
  'status',
  'contacted_at',
  'dismissed_at',
  'note',
  'created_by',
  'created_at',
  'updated_at',
].join(', ');

export const SELECT_COLUMNS = {
  appointment: APPOINTMENT_COLUMNS,
  plan: PLAN_COLUMNS,
  visit: VISIT_COLUMNS,
  patient: PATIENT_COLUMNS,
  contact: CONTACT_COLUMNS,
};

const ELIGIBLE_PLAN_STATUSES: TreatmentPlanStatus[] = [
  'in_progress',
  'presented',
];

const FOLLOW_UP_CONTACT_STATUSES: FollowUpContactStatus[] = [
  'contacted',
  'dismissed',
];

type AppointmentRow = {
  id: string;
  patient_id: string;
  start_at: string;
  status: FollowUpAppointmentStatus;
};

type PlanRow = {
  id: string;
  patient_id: string;
  name: string;
  status: TreatmentPlanStatus;
  created_at: string;
  updated_at: string;
};

type VisitRow = {
  patient_id: string;
  created_at: string;
};

type PatientRow = {
  id: string;
  full_name: string;
  phone_e164: string | null;
};

type ListOptions = {
  now?: Date;
};

type MarkContactInput = {
  patientId: string;
  status: FollowUpContactStatus;
  note?: string | null;
  userId: string;
  now?: Date;
};

function mapAppointmentRow(row: AppointmentRow): FollowUpAppointment {
  return {
    id: row.id,
    patientId: row.patient_id,
    startAt: row.start_at,
    status: row.status,
  };
}

function mapPlanRow(row: PlanRow): FollowUpPlan {
  return {
    id: row.id,
    patientId: row.patient_id,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapContactRow(row: Record<string, unknown>): FollowUpContact {
  return {
    id: row.id as string,
    patientId: row.patient_id as string,
    roundDate: row.round_date as string,
    status: row.status as FollowUpContactStatus,
    contactedAt: (row.contacted_at as string | null) ?? null,
    dismissedAt: (row.dismissed_at as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function parseContactStatus(value: unknown): FollowUpContactStatus {
  if (
    typeof value === 'string' &&
    FOLLOW_UP_CONTACT_STATUSES.includes(value as FollowUpContactStatus)
  ) {
    return value as FollowUpContactStatus;
  }
  throw new ValidationError('status', 'Invalid status');
}

function buildLastVisitMap(rows: VisitRow[]): Map<string, string> {
  const lastVisitByPatient = new Map<string, string>();
  for (const row of rows) {
    const current = lastVisitByPatient.get(row.patient_id);
    if (!current || row.created_at > current) {
      lastVisitByPatient.set(row.patient_id, row.created_at);
    }
  }
  return lastVisitByPatient;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

async function fetchPatients(
  patientIds: string[]
): Promise<Map<string, PatientRow>> {
  if (patientIds.length === 0) {
    return new Map();
  }

  const { data, error } = await getSupabaseAdmin()
    .from('patients')
    .select(PATIENT_COLUMNS)
    .in('id', patientIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as unknown as PatientRow[]).map((patient) => [
      patient.id,
      patient,
    ])
  );
}

/**
 * Clave de la ronda: el día calendario en `America/Mexico_City` como
 * `YYYY-MM-DD`. Reutiliza el helper canónico de `@/lib/admin/timezone`.
 */
export function currentRoundDate(now: Date): string {
  return clinicDayKey(now.toISOString());
}

/**
 * Lista los casos de seguimiento de la ronda actual.
 *
 * Ejecuta un número constante de lecturas masivas (citas, planes, visitas,
 * contactos de la ronda y pacientes), nunca una consulta por paciente, y
 * excluye a los pacientes contactados o descartados en la ronda actual.
 */
export async function listDailyFollowUpCases(
  options: ListOptions = {}
): Promise<FollowUpCase[]> {
  const now = options.now ?? new Date();
  const roundDate = currentRoundDate(now);
  const supabase = getSupabaseAdmin();

  const { data: appointmentData, error: appointmentError } = await supabase
    .from('appointments')
    .select(APPOINTMENT_COLUMNS);
  if (appointmentError) {
    throw new Error(appointmentError.message);
  }

  const { data: planData, error: planError } = await supabase
    .from('treatment_plans')
    .select(PLAN_COLUMNS)
    .in('status', ELIGIBLE_PLAN_STATUSES);
  if (planError) {
    throw new Error(planError.message);
  }

  const planRows = (planData ?? []) as unknown as PlanRow[];
  const inProgressPatientIds = unique(
    planRows
      .filter((plan) => plan.status === 'in_progress')
      .map((plan) => plan.patient_id)
  );

  let visitRows: VisitRow[] = [];
  if (inProgressPatientIds.length > 0) {
    const { data: visitData, error: visitError } = await supabase
      .from('clinical_visits')
      .select(VISIT_COLUMNS)
      .in('patient_id', inProgressPatientIds);
    if (visitError) {
      throw new Error(visitError.message);
    }
    visitRows = (visitData ?? []) as unknown as VisitRow[];
  }

  const contacts = await loadFollowUpContactsForRound(roundDate);

  const candidates = buildFollowUpList({
    now,
    appointments: ((appointmentData ?? []) as unknown as AppointmentRow[]).map(
      mapAppointmentRow
    ),
    plans: planRows.map(mapPlanRow),
    lastVisitByPatient: buildLastVisitMap(visitRows),
  });

  const excludedPatientIds = new Set(
    contacts
      .filter((contact) => contact.roundDate === roundDate)
      .map((contact) => contact.patientId)
  );
  const visibleCases = candidates.filter(
    (candidate) => !excludedPatientIds.has(candidate.patientId)
  );

  const patients = await fetchPatients(
    visibleCases.map((candidate) => candidate.patientId)
  );

  return visibleCases.map((candidate) => {
    const patient = patients.get(candidate.patientId);
    return {
      ...candidate,
      patientName: patient?.full_name ?? 'Paciente sin nombre',
      patientPhoneE164: patient?.phone_e164 ?? null,
      roundDate,
    };
  });
}

/** Contactos registrados para una ronda (`round_date`) concreta. */
export async function loadFollowUpContactsForRound(
  roundDate: string
): Promise<FollowUpContact[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('follow_up_contacts')
    .select(CONTACT_COLUMNS)
    .eq('round_date', roundDate);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as Record<string, unknown>[]).map(
    mapContactRow
  );
}

/**
 * Marca un caso como contactado o descartado en la ronda actual.
 *
 * `upsert` sobre `(patient_id, round_date)` lo hace idempotente dentro de la
 * ronda; `contacted_at`/`dismissed_at` se persisten con el `now` inyectado.
 */
export async function markFollowUpContact(
  input: MarkContactInput
): Promise<FollowUpContact> {
  const patientId = parseUuid(input.patientId, 'patientId');
  const status = parseContactStatus(input.status);
  const userId = parseUuid(input.userId, 'userId');
  const now = input.now ?? new Date();
  const roundDate = currentRoundDate(now);

  const payload = {
    patient_id: patientId,
    round_date: roundDate,
    status,
    contacted_at: status === 'contacted' ? now.toISOString() : null,
    dismissed_at: status === 'dismissed' ? now.toISOString() : null,
    note: parseNotes(input.note, 'note'),
    created_by: userId,
  };

  const { data, error } = await getSupabaseAdmin()
    .from('follow_up_contacts')
    .upsert(payload, { onConflict: 'patient_id,round_date' })
    .select(CONTACT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(
      (error as { message?: string } | null)?.message ??
        'Failed to mark follow-up contact'
    );
  }

  return mapContactRow(data as unknown as Record<string, unknown>);
}
