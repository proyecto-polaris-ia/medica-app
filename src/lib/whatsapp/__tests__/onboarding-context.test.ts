import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  hasFutureScheduledAppointment,
  loadOnboardingStartContext,
} from '../onboarding-context';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PHONE = '+5215512345678';
const NOW = new Date('2026-10-05T13:00:00.000Z');

type QueryResult = { data: unknown; error: unknown };

function buildQuery(result: QueryResult) {
  const query = {
    select: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn(),
    eq: vi.fn(),
    gt: vi.fn(),
    in: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.insert.mockReturnValue(query);
  query.upsert.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.gt.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

function mockClient(queries: {
  patients: ReturnType<typeof buildQuery>;
  history?: ReturnType<typeof buildQuery>;
  appointments?: ReturnType<typeof buildQuery>;
}) {
  const from = vi.fn((table: string) => {
    if (table === 'patients') return queries.patients;
    if (table === 'patient_medical_history') return queries.history;
    if (table === 'appointments') return queries.appointments;
    throw new Error(`Tabla inesperada: ${table}`);
  });
  (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({ from });
  return { from };
}

describe('loadOnboardingStartContext', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('devuelve null sin crear paciente cuando el teléfono no existe', async () => {
    const patients = buildQuery({ data: null, error: null });
    mockClient({ patients });

    const context = await loadOnboardingStartContext({ phone: PHONE, now: NOW });

    expect(context).toBeNull();
    expect(patients.insert).not.toHaveBeenCalled();
    expect(patients.upsert).not.toHaveBeenCalled();
  });

  it('construye el contexto del paciente sin historia con sus datos', async () => {
    const patients = buildQuery({
      data: {
        id: PATIENT_ID,
        full_name: 'Ana López',
        email: null,
        sex: 'female',
      },
      error: null,
    });
    const history = buildQuery({ data: null, error: null });
    const appointments = buildQuery({ data: { id: 'appt-1' }, error: null });
    mockClient({ patients, history, appointments });

    const context = await loadOnboardingStartContext({ phone: PHONE, now: NOW });

    expect(context).toEqual({
      patientId: PATIENT_ID,
      patientName: 'Ana López',
      phone: PHONE,
      sex: 'female',
      historyExists: false,
      source: null,
      email: null,
      missingEmail: true,
      hasFutureScheduledAppointment: true,
    });
  });

  it('marca missingEmail false cuando el paciente ya tiene email', async () => {
    const patients = buildQuery({
      data: { id: PATIENT_ID, full_name: 'Ana', email: 'ana@example.com', sex: null },
      error: null,
    });
    const history = buildQuery({ data: null, error: null });
    const appointments = buildQuery({ data: { id: 'appt-1' }, error: null });
    mockClient({ patients, history, appointments });

    const context = await loadOnboardingStartContext({ phone: PHONE, now: NOW });

    expect(context?.missingEmail).toBe(false);
    expect(context?.email).toBe('ana@example.com');
  });

  it('marca historyExists y conserva la procedencia cuando ya hay fila', async () => {
    const patients = buildQuery({
      data: { id: PATIENT_ID, full_name: 'Ana', email: 'ana@example.com', sex: 'other' },
      error: null,
    });
    const history = buildQuery({
      data: { patient_id: PATIENT_ID, source: 'patient_autoreport' },
      error: null,
    });
    const appointments = buildQuery({ data: { id: 'appt-1' }, error: null });
    mockClient({ patients, history, appointments });

    const context = await loadOnboardingStartContext({ phone: PHONE, now: NOW });

    expect(context?.historyExists).toBe(true);
    expect(context?.source).toBe('patient_autoreport');
  });

  it('no tiene cita futura elegible cuando no hay fila confirmada/pending', async () => {
    const patients = buildQuery({
      data: { id: PATIENT_ID, full_name: 'Ana', email: null, sex: null },
      error: null,
    });
    const history = buildQuery({ data: null, error: null });
    const appointments = buildQuery({ data: null, error: null });
    mockClient({ patients, history, appointments });

    const context = await loadOnboardingStartContext({ phone: PHONE, now: NOW });

    expect(context?.hasFutureScheduledAppointment).toBe(false);
  });
});

describe('hasFutureScheduledAppointment', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('cuenta solo confirmed/pending y consulta desde ahora', async () => {
    const appointments = buildQuery({ data: { id: 'appt-1' }, error: null });
    mockClient({ patients: buildQuery({ data: null, error: null }), appointments });

    const result = await hasFutureScheduledAppointment(PATIENT_ID, NOW);

    expect(result).toBe(true);
    expect(appointments.eq).toHaveBeenCalledWith('patient_id', PATIENT_ID);
    expect(appointments.gt).toHaveBeenCalledWith('start_at', NOW.toISOString());
    expect(appointments.in).toHaveBeenCalledWith('status', ['confirmed', 'pending']);
    expect(appointments.limit).toHaveBeenCalledWith(1);
  });

  it('devuelve false cuando no hay filas', async () => {
    const appointments = buildQuery({ data: null, error: null });
    mockClient({ patients: buildQuery({ data: null, error: null }), appointments });

    const result = await hasFutureScheduledAppointment(PATIENT_ID, NOW);

    expect(result).toBe(false);
  });

  it('no cuenta una cita solo solicitada (requested) porque el filtro no incluye ese estado', async () => {
    const appointments = buildQuery({ data: null, error: null });
    mockClient({ patients: buildQuery({ data: null, error: null }), appointments });

    await hasFutureScheduledAppointment(PATIENT_ID, NOW);

    const statusFilter = appointments.in.mock.calls[0];
    expect(statusFilter[1]).not.toContain('requested');
  });
});
