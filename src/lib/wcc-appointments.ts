import { CLINIC_TZ, clinicDayKey, clinicTimeLabel } from '@/lib/admin/timezone';
import {
  createWccClient,
  isSupabaseConfigured as hasSupabaseConfig,
} from '@/lib/wcc-client';

/**
 * Data layer del tab "Citas" del WhatsApp Command Center (issue #86, slice 3/3).
 *
 * Lista las citas sin confirmar (`requested` / `pending`) dentro de una ventana
 * operativa, con la identidad del paciente, el proveedor, el servicio y el
 * estado de sus recordatorios. Sigue el patrón de `wcc-payments.ts`: nunca
 * lanza hacia la página, degrada a una cola vacía y expone el contrato
 * `isSupabaseConfigured` / `isConfiguredButUnavailable`.
 */

export const WCC_APPOINTMENTS_WINDOW_HOURS = 72;

const HOUR_MS = 60 * 60 * 1000;

export type WccAppointmentReminderRow = {
  cadence: 'h24' | 'same_day';
  status: 'scheduled' | 'sent' | 'failed';
  sentAt: string | null;
  dryRun: boolean;
};

export type WccUnconfirmedAppointmentRow = {
  appointmentId: string;
  patientId: string | null;
  patientName: string;
  patientPhoneE164: string | null;
  providerName: string;
  serviceName: string;
  startAt: string;
  status: 'requested' | 'pending';
  hoursUntilStart: number;
  reminders: WccAppointmentReminderRow[];
};

export type WccAppointmentsQueue = {
  isSupabaseConfigured: boolean;
  isConfiguredButUnavailable: boolean;
  appointments: WccUnconfirmedAppointmentRow[];
  windowHours: number;
  generatedAt: string;
};

type Row = Record<string, unknown>;
type Result<T = Row> = {
  data?: T[] | null;
  error?: { message?: string } | null;
};
type Query = PromiseLike<Result> & {
  select: (...a: unknown[]) => Query;
  in: (...a: unknown[]) => Query;
  gte: (...a: unknown[]) => Query;
  lt: (...a: unknown[]) => Query;
  order: (...a: unknown[]) => Query;
  range: (...a: unknown[]) => Query;
};
type Db = { from: (t: string) => Query };

const s = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

const unique = (ids: string[]): string[] => [...new Set(ids.filter(Boolean))];

async function db(): Promise<Db> {
  return (await createWccClient()) as unknown as Db;
}

async function rows<T = Row>(q: Query): Promise<Result<T>> {
  const r = (await q) as Result<T>;
  if (r.error) throw new Error(r.error.message);
  return r;
}

/**
 * Ventana operativa en horas: valor explícito → `WCC_APPOINTMENTS_WINDOW_HOURS`
 * → 72 h por defecto. Cubre H-24 y el día mismo con margen operativo.
 */
export function resolveWccAppointmentsWindowHours(value?: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  const env = Number(process.env.WCC_APPOINTMENTS_WINDOW_HOURS);
  return Number.isFinite(env) && env > 0
    ? Math.floor(env)
    : WCC_APPOINTMENTS_WINDOW_HOURS;
}

/**
 * Fecha y hora de inicio en la zona del observador (default:
 * `America/Mexico_City`), nunca en la zona del servidor. Formato
 * `YYYY-MM-DD HH:mm`.
 */
export function formatWccAppointmentStart(
  startAt: string,
  timeZone: string = CLINIC_TZ
): string {
  return `${clinicDayKey(startAt, timeZone)} ${clinicTimeLabel(startAt, timeZone)}`;
}

type PatientInfo = { name: string; phone: string | null };

async function patientsFor(d: Db, ids: string[]): Promise<Map<string, PatientInfo>> {
  const u = unique(ids);
  if (u.length === 0) return new Map();
  const r = await rows(
    d
      .from('patients')
      .select('id, full_name, phone_e164')
      .in('id', u)
      .range(0, u.length - 1)
  );
  return new Map(
    (r.data ?? []).map((x) => [
      x.id as string,
      {
        name: s(x.full_name) ?? 'Paciente sin nombre',
        phone: (x.phone_e164 as string | null) ?? null,
      },
    ])
  );
}

async function providersFor(d: Db, ids: string[]): Promise<Map<string, string>> {
  const u = unique(ids);
  if (u.length === 0) return new Map();
  const r = await rows(
    d.from('providers').select('id, name').in('id', u).range(0, u.length - 1)
  );
  return new Map(
    (r.data ?? []).map((x) => [x.id as string, s(x.name) ?? 'Proveedor sin asignar'])
  );
}

async function servicesFor(d: Db, ids: string[]): Promise<Map<string, string>> {
  const u = unique(ids);
  if (u.length === 0) return new Map();
  const r = await rows(
    d.from('services').select('id, name').in('id', u).range(0, u.length - 1)
  );
  return new Map(
    (r.data ?? []).map((x) => [x.id as string, s(x.name) ?? 'Servicio desconocido'])
  );
}

async function remindersFor(
  d: Db,
  ids: string[]
): Promise<Map<string, WccAppointmentReminderRow[]>> {
  const u = unique(ids);
  if (u.length === 0) return new Map();
  const r = await rows(
    d
      .from('appointment_reminders')
      .select('appointment_id, cadence, status, dry_run, sent_at')
      .in('appointment_id', u)
      .order('created_at', { ascending: false })
  );
  const grouped = new Map<string, WccAppointmentReminderRow[]>();
  for (const x of r.data ?? []) {
    const appointmentId = x.appointment_id as string;
    if (!appointmentId) continue;
    const list = grouped.get(appointmentId) ?? [];
    list.push({
      cadence: x.cadence as WccAppointmentReminderRow['cadence'],
      status: x.status as WccAppointmentReminderRow['status'],
      sentAt: (x.sent_at as string | null) ?? null,
      dryRun: x.dry_run === true,
    });
    grouped.set(appointmentId, list);
  }
  return grouped;
}

function mapAppointment(
  row: Row,
  patients: Map<string, PatientInfo>,
  providers: Map<string, string>,
  services: Map<string, string>,
  reminders: Map<string, WccAppointmentReminderRow[]>,
  now: Date
): WccUnconfirmedAppointmentRow {
  const appointmentId = row.id as string;
  const startAt = row.start_at as string;
  const patientId = (row.patient_id as string | null) ?? null;
  const patient = patientId ? patients.get(patientId) : undefined;
  return {
    appointmentId,
    patientId,
    patientName: patient?.name ?? 'Paciente sin nombre',
    patientPhoneE164: patient?.phone ?? null,
    providerName: providers.get(row.provider_id as string) ?? 'Proveedor sin asignar',
    serviceName: services.get(row.service_id as string) ?? 'Servicio desconocido',
    startAt,
    status: row.status as WccUnconfirmedAppointmentRow['status'],
    hoursUntilStart: Math.max(
      0,
      Math.round((new Date(startAt).getTime() - now.getTime()) / HOUR_MS)
    ),
    reminders: reminders.get(appointmentId) ?? [],
  };
}

export async function getWccUnconfirmedAppointments(
  filters: { windowHours?: number } = {}
): Promise<WccAppointmentsQueue> {
  const windowHours = resolveWccAppointmentsWindowHours(filters.windowHours);
  const now = new Date();
  const empty = (
    overrides: Partial<WccAppointmentsQueue> = {}
  ): WccAppointmentsQueue => ({
    isSupabaseConfigured: false,
    isConfiguredButUnavailable: false,
    appointments: [],
    windowHours,
    generatedAt: now.toISOString(),
    ...overrides,
  });

  if (!hasSupabaseConfig()) return empty();

  try {
    const d = await db();
    const windowEnd = new Date(now.getTime() + windowHours * HOUR_MS);
    const result = await rows(
      d
        .from('appointments')
        .select('id, patient_id, service_id, provider_id, start_at, status')
        .in('status', ['requested', 'pending'])
        .gte('start_at', now.toISOString())
        .lt('start_at', windowEnd.toISOString())
        .order('start_at', { ascending: true })
    );

    // Filtro defensivo: la consulta ya filtra en la BD, pero ante un mock o un
    // cambio de contrato no se cuelan estados no elegibles ni citas fuera de la
    // ventana.
    const eligible = (result.data ?? []).filter((row) => {
      if (row.status !== 'requested' && row.status !== 'pending') return false;
      const start = new Date(row.start_at as string).getTime();
      return start >= now.getTime() && start < windowEnd.getTime();
    });

    const [patients, providers, services, reminders] = await Promise.all([
      patientsFor(d, eligible.map((r) => r.patient_id as string)),
      providersFor(d, eligible.map((r) => r.provider_id as string)),
      servicesFor(d, eligible.map((r) => r.service_id as string)),
      remindersFor(d, eligible.map((r) => r.id as string)),
    ]);

    const appointments = eligible
      .map((row) => mapAppointment(row, patients, providers, services, reminders, now))
      .sort(
        (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
      );

    return empty({ isSupabaseConfigured: true, appointments });
  } catch {
    return empty({
      isSupabaseConfigured: true,
      isConfiguredButUnavailable: true,
    });
  }
}
