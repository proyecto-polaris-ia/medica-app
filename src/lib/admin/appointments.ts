import { getSupabaseAdmin } from '@/lib/supabase/server';
import { buildTransitionStamp } from './metrics/transitions';
import {
  APPOINTMENT_SORT_COLUMNS,
  APPOINTMENT_SORT_DIRECTIONS,
  type Appointment,
  type AppointmentInput,
  type AppointmentReminderSummary,
  type AppointmentSortColumn,
  type AppointmentSortDirection,
  type ProviderAppointment,
} from './types';
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
    reminders: [],
  };
}

const REMINDER_SELECT =
  'appointment_id, cadence, status, dry_run, sent_at, created_at';

/**
 * Agrupa los recordatorios de las citas por `appointment_id` con una sola
 * consulta batch (`.in(...)`), evitando un N+1 en el panel.
 */
async function remindersFor(
  ids: string[]
): Promise<Map<string, AppointmentReminderSummary[]>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('appointment_reminders')
    .select(REMINDER_SELECT)
    .in('appointment_id', unique)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const grouped = new Map<string, AppointmentReminderSummary[]>();
  for (const row of data ?? []) {
    const appointmentId = row.appointment_id as string;
    if (!appointmentId) continue;
    const list = grouped.get(appointmentId) ?? [];
    list.push({
      cadence: row.cadence as AppointmentReminderSummary['cadence'],
      status: row.status as AppointmentReminderSummary['status'],
      sentAt: (row.sent_at as string | null) ?? null,
      dryRun: row.dry_run === true,
      createdAt: row.created_at as string,
    });
    grouped.set(appointmentId, list);
  }
  return grouped;
}

async function withReminders(
  appointments: Appointment[]
): Promise<Appointment[]> {
  if (appointments.length === 0) return appointments;
  const grouped = await remindersFor(appointments.map((a) => a.id));
  return appointments.map((appointment) => ({
    ...appointment,
    reminders: grouped.get(appointment.id) ?? [],
  }));
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

  return withReminders((data ?? []).map(mapRow));
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

  return withReminders((data ?? []).map(mapRow));
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** Expresión de orden PostgREST por cada columna del whitelist. */
const SORT_ORDER_EXPRESSION: Record<AppointmentSortColumn, string> = {
  start_at: 'start_at',
  end_at: 'end_at',
  status: 'status',
  created_at: 'created_at',
  patient: 'patients(full_name)',
  service: 'services(name)',
  provider: 'providers(name)',
};

/**
 * Embeds exigidos por PostgREST para ordenar por nombre: la relación debe
 * aparecer en el `select`. Verificado contra Supabase local (PostgREST 16.4):
 * `.order('patients(full_name)')` compone con `.range(...)` y `count: 'exact'`.
 */
const SORT_EMBED: Partial<Record<AppointmentSortColumn, string>> = {
  patient: 'patients(full_name)',
  service: 'services(name)',
  provider: 'providers(name)',
};

export type ListAppointmentsPagedParams = {
  page?: number;
  pageSize?: number;
  serviceId?: string;
  patientId?: string;
  providerId?: string;
  startAtIso?: string;
  endAtIso?: string;
  sort?: AppointmentSortColumn;
  sortDir?: AppointmentSortDirection;
};

export type ListAppointmentsPagedResult = {
  appointments: Appointment[];
  total: number;
};

function parsePageParam(page: number | undefined): number {
  if (page === undefined) return DEFAULT_PAGE;
  if (!Number.isInteger(page) || page < 1) {
    throw new ValidationError('page', 'Invalid page');
  }
  return page;
}

function parsePageSizeParam(pageSize: number | undefined): number {
  if (pageSize === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new ValidationError('pageSize', 'Invalid pageSize');
  }
  return pageSize;
}

function parseSortParam(
  sort: AppointmentSortColumn | undefined
): AppointmentSortColumn {
  if (sort === undefined) return 'start_at';
  if (!(APPOINTMENT_SORT_COLUMNS as readonly string[]).includes(sort)) {
    throw new ValidationError('sort', 'Invalid sort');
  }
  return sort;
}

function parseSortDirParam(
  sortDir: AppointmentSortDirection | undefined
): AppointmentSortDirection {
  if (sortDir === undefined) return 'desc';
  if (!(APPOINTMENT_SORT_DIRECTIONS as readonly string[]).includes(sortDir)) {
    throw new ValidationError('sortDir', 'Invalid sortDir');
  }
  return sortDir;
}

/**
 * Página del listado de citas con filtros, orden por whitelist y `total` exacto
 * del conjunto filtrado. La paginación se aplica después de los filtros.
 */
export async function listAppointmentsPaged(
  params: ListAppointmentsPagedParams
): Promise<ListAppointmentsPagedResult> {
  const page = parsePageParam(params.page);
  const pageSize = parsePageSizeParam(params.pageSize);
  const sort = parseSortParam(params.sort);
  const sortDir = parseSortDirParam(params.sortDir);

  let startAt: Date | undefined;
  let endAt: Date | undefined;
  if (params.startAtIso !== undefined || params.endAtIso !== undefined) {
    if (params.startAtIso === undefined || params.endAtIso === undefined) {
      throw new ValidationError('start', 'start and end must be provided together');
    }
    ({ startAt, endAt } = validateDateRange(params.startAtIso, params.endAtIso));
  }

  const embed = SORT_EMBED[sort];
  const select = embed ? `${SELECT_COLUMNS}, ${embed}` : SELECT_COLUMNS;

  const supabase = getSupabaseAdmin();
  // `count: 'exact'` cuenta el conjunto filtrado antes del `range`.
  const buildQuery = () => {
    let query = supabase.from('appointments').select(select, { count: 'exact' });

    if (params.serviceId) query = query.eq('service_id', params.serviceId);
    if (params.patientId) query = query.eq('patient_id', params.patientId);
    if (params.providerId) query = query.eq('provider_id', params.providerId);
    if (startAt && endAt) {
      query = query
        .gte('start_at', startAt.toISOString())
        .lt('start_at', endAt.toISOString());
    }

    return query
      .order(SORT_ORDER_EXPRESSION[sort], { ascending: sortDir === 'asc' })
      // Desempate estable para que la paginación no repita filas cuando la
      // columna ordenada tiene valores iguales.
      .order('id', { ascending: true });
  };

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let { data, count, error } = await buildQuery().range(from, to);

  // Una página más allá del total no debe romper la respuesta: PostgREST
  // responde 416 (`PGRST103`) sin exponer el total, así que se repite la
  // consulta con un rango válido solo para recuperar el `count` exacto.
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
    appointments: await withReminders(
      // El `select` es dinámico (embeds del orden por nombre), así que
      // supabase-js no infiere la fila; se normaliza al mapper del dominio.
      ((data ?? []) as unknown as Record<string, unknown>[]).map(mapRow)
    ),
    total: count ?? 0,
  };
}

/** PostgREST responde 416 cuando el `offset` solicitado excede el total. */
function isRangeNotSatisfiable(error: { code?: string; message: string }): boolean {
  return error.code === 'PGRST103' || /range not satisfiable/i.test(error.message);
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
      // Estampado de transición del status inicial en el mismo INSERT.
      .insert({ ...payload, ...buildTransitionStamp(payload.status, new Date()) })
      .select(SELECT_COLUMNS)
      .single();

    if (error) {
      // Rethrow del error original de PostgREST: conserva `code` para que el
      // catch de abajo traduzca 23P01 (solapamiento) a ConflictError.
      throw error;
    }
    if (!data) {
      throw new Error('Failed to create appointment');
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
    // Lectura (no escritura) del status actual: solo se estampa el instante si
    // el estado cambia, para no reescribir el histórico en un guardado sin
    // transición. El UPDATE de abajo sigue siendo una sola sentencia atómica.
    const { data: currentRow, error: currentError } = await supabase
      .from('appointments')
      .select('status')
      .eq('id', parsedId)
      .maybeSingle();
    if (currentError) {
      throw new Error(currentError.message);
    }
    const statusChanged = currentRow?.status !== payload.status;
    const stamp = statusChanged
      ? buildTransitionStamp(payload.status, new Date())
      : {};

    const { data, error } = await supabase
      .from('appointments')
      .update({ ...payload, ...stamp })
      .eq('id', parsedId)
      .select(SELECT_COLUMNS)
      // maybeSingle: con 0 filas devuelve data=null sin error, para poder
      // señalar NotFoundError (un .single() fallaría con PGRST116 antes del
      // manejo de no encontrado).
      .maybeSingle();

    if (error) {
      // Rethrow del error original de PostgREST: conserva `code` para que el
      // catch de abajo traduzca 23P01 (solapamiento) a ConflictError.
      throw error;
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
