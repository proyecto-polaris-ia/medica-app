import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { sendWhatsAppTemplateMessage } from '@/lib/whatsapp/client';
import {
  APPOINTMENT_REMINDER_CLINIC_ADDRESS,
  appointmentReminderPeriod,
  buildAppointmentReminderBodyParameters,
  buildAppointmentReminderKey,
  clinicDateKey,
  formatAppointmentTemplateVars,
  isoWeekKeyForClinicDate,
  resolveClinicReminderConfig,
  selectAppointmentReminderCandidates,
  sendAppointmentReminder,
} from '../send-appointment-reminder';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppTemplateMessage: vi.fn(),
}));

const APPOINTMENT_ID = '990e8400-e29b-41d4-a716-446655440000';
const OTHER_APPOINTMENT_ID = '990e8400-e29b-41d4-a716-446655440001';
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const REMINDER_ID = '770e8400-e29b-41d4-a716-446655440000';

type QueryResult = { data: unknown; error: { message?: string; code?: string } | null };

interface MockQuery {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  lt: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  _result: QueryResult;
  _single: QueryResult;
}

function buildQuery(): MockQuery {
  const query: MockQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    _result: { data: [], error: null },
    _single: { data: null, error: null },
  };
  // La query encadenable de Supabase se resuelve al hacer await sobre el builder.
  Object.defineProperty(query, 'then', {
    get() {
      return (onFulfilled: (value: QueryResult) => unknown) =>
        Promise.resolve(query._result).then(onFulfilled);
    },
  });
  query.maybeSingle.mockImplementation(() => Promise.resolve(query._single));
  return query;
}

function mockAdminByTable(map: Record<string, MockQuery>) {
  const from = vi.fn((table: string) => {
    const q = map[table];
    if (!q) throw new Error(`Unexpected table query: ${table}`);
    return q;
  });
  (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({ from });
  return { from };
}

function appointmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: APPOINTMENT_ID,
    patient_id: PATIENT_ID,
    start_at: '2026-10-06T16:00:00.000Z',
    status: 'requested',
    patients: { full_name: 'María López', phone_e164: '+5215512345678' },
    providers: { name: 'Dr. Jorge' },
    ...overrides,
  };
}

const START_AT = '2026-10-05T16:00:00.000Z'; // 10:00 en America/Mexico_City

function baseSendInput(overrides: Record<string, unknown> = {}) {
  return {
    appointmentId: APPOINTMENT_ID,
    cadence: 'h24' as const,
    patientId: PATIENT_ID,
    patientName: 'María López',
    patientPhoneE164: '+5215512345678',
    providerName: 'Dr. Jorge',
    startAt: START_AT,
    period: appointmentReminderPeriod(START_AT),
    dryRun: false,
    ...overrides,
  };
}

describe('buildAppointmentReminderKey', () => {
  it('h24 usa la semana ISO de la fecha clínica de la cita aunque cruce el año', () => {
    // 2025-12-29T18:00Z = 12:00 local del lunes 29 de diciembre de 2025 → ISO 2026-W01.
    const period = appointmentReminderPeriod('2025-12-29T18:00:00.000Z');
    expect(buildAppointmentReminderKey(APPOINTMENT_ID, 'h24', period)).toBe(
      `cita:${APPOINTMENT_ID}:h24:2026-W01`
    );
  });

  it('same_day usa la fecha clínica local aunque cruce la medianoche UTC', () => {
    // 2026-10-06T02:00Z = 20:00 local del 5 de octubre → fecha clínica 2026-10-05.
    const period = appointmentReminderPeriod('2026-10-06T02:00:00.000Z');
    expect(period.clinicDate).toBe('2026-10-05');
    expect(buildAppointmentReminderKey(APPOINTMENT_ID, 'same_day', period)).toBe(
      `cita:${APPOINTMENT_ID}:same_day:2026-10-05`
    );
  });

  it('la misma cita en dos corridas de la misma ventana produce la misma llave', () => {
    // La llave se deriva de la fecha clínica de la cita, no de `now`, así que
    // corridas en instantes distintos de la misma ventana coinciden.
    const first = buildAppointmentReminderKey(
      APPOINTMENT_ID,
      'h24',
      appointmentReminderPeriod(START_AT)
    );
    const second = buildAppointmentReminderKey(
      APPOINTMENT_ID,
      'h24',
      appointmentReminderPeriod(START_AT)
    );
    expect(first).toBe(second);
    expect(clinicDateKey(START_AT)).toBe('2026-10-05');
  });

  it('la semana ISO proviene de la fecha clínica, no del instante UTC', () => {
    // 2026-10-05T02:00Z sigue siendo 2026-10-04 en UTC-6 (domingo).
    expect(clinicDateKey('2026-10-05T02:00:00.000Z')).toBe('2026-10-04');
    expect(isoWeekKeyForClinicDate('2026-10-04')).toBe('2026-W40');
    expect(isoWeekKeyForClinicDate('2026-10-05')).toBe('2026-W41');
  });
});

describe('selectAppointmentReminderCandidates', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('h24 filtra el rango de instantes absolutos [now+24h, now+36h]', async () => {
    const now = new Date('2026-10-05T12:00:00.000Z');
    const appointments = buildQuery();
    appointments._result = { data: [appointmentRow()], error: null };
    mockAdminByTable({ appointments });

    await selectAppointmentReminderCandidates('h24', now);

    expect(appointments.in).toHaveBeenCalledWith('status', ['requested', 'pending']);
    expect(appointments.gte).toHaveBeenCalledWith('start_at', '2026-10-06T12:00:00.000Z');
    expect(appointments.lte).toHaveBeenCalledWith('start_at', '2026-10-07T00:00:00.000Z');
  });

  it('same_day exige el día clínico y descarta citas ya pasadas (start_at >= now)', async () => {
    const now = new Date('2026-10-05T12:00:00.000Z');
    const appointments = buildQuery();
    appointments._result = { data: [appointmentRow()], error: null };
    mockAdminByTable({ appointments });

    await selectAppointmentReminderCandidates('same_day', now);

    expect(appointments.in).toHaveBeenCalledWith('status', ['requested', 'pending']);
    expect(appointments.gte).toHaveBeenCalledWith('start_at', '2026-10-05T12:00:00.000Z');
    // Fin del día clínico: 2026-10-06T06:00Z (medianoche local UTC-6).
    expect(appointments.lt).toHaveBeenCalledWith('start_at', '2026-10-06T06:00:00.000Z');
  });

  it('mapea las filas a candidatas y descarta las que no tienen paciente o teléfono', async () => {
    const now = new Date('2026-10-05T12:00:00.000Z');
    const appointments = buildQuery();
    appointments._result = {
      data: [
        appointmentRow(),
        appointmentRow({ id: OTHER_APPOINTMENT_ID, patients: null }),
        appointmentRow({ id: OTHER_APPOINTMENT_ID, patients: { full_name: 'Sin Tel', phone_e164: '' } }),
        appointmentRow({ id: OTHER_APPOINTMENT_ID, patients: { full_name: '', phone_e164: '+5215512345679' } }),
      ],
      error: null,
    };
    mockAdminByTable({ appointments });

    const candidates = await selectAppointmentReminderCandidates('h24', now);

    expect(candidates).toEqual([
      {
        appointmentId: APPOINTMENT_ID,
        patientId: PATIENT_ID,
        patientName: 'María López',
        patientPhoneE164: '+5215512345678',
        providerName: 'Dr. Jorge',
        startAt: '2026-10-06T16:00:00.000Z',
        status: 'requested',
      },
    ]);
  });

  it('descarta estados de cita no elegibles devueltos por la consulta', async () => {
    const now = new Date('2026-10-05T12:00:00.000Z');
    const appointments = buildQuery();
    appointments._result = {
      data: [
        appointmentRow({ status: 'confirmed' }),
        appointmentRow({ id: OTHER_APPOINTMENT_ID, status: 'pending' }),
      ],
      error: null,
    };
    mockAdminByTable({ appointments });

    const candidates = await selectAppointmentReminderCandidates('h24', now);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].appointmentId).toBe(OTHER_APPOINTMENT_ID);
    expect(candidates[0].status).toBe('pending');
  });

  it('descarta filas sin patient_id y normaliza el join a-uno en forma de arreglo', async () => {
    const now = new Date('2026-10-05T12:00:00.000Z');
    const appointments = buildQuery();
    appointments._result = {
      data: [
        appointmentRow({ patient_id: null, patients: null }),
        appointmentRow({
          id: OTHER_APPOINTMENT_ID,
          patients: [{ full_name: 'María López', phone_e164: '+5215512345678' }],
          providers: [{ name: 'Dr. Jorge' }],
        }),
      ],
      error: null,
    };
    mockAdminByTable({ appointments });

    const candidates = await selectAppointmentReminderCandidates('h24', now);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      appointmentId: OTHER_APPOINTMENT_ID,
      patientName: 'María López',
      providerName: 'Dr. Jorge',
    });
  });
});

describe('formateo de variables de plantilla', () => {
  it('formatea fecha y hora en America/Mexico_City sin mover el día clínico', () => {
    // 2026-10-06T02:00Z = 20:00 local del 5 de octubre.
    const vars = formatAppointmentTemplateVars({
      patientName: 'maría lópez',
      providerName: 'Dr. Jorge',
      startAt: '2026-10-06T02:00:00.000Z',
      config: { clinicName: 'Dental Sonrisa', clinicAddress: 'Calle 1 #23' },
    });

    expect(vars.patientFirstName).toBe('María');
    expect(vars.dateLabel).toBe('lunes 5 de octubre');
    expect(vars.timeLabel).toBe('20:00');
    expect(vars.clinicAddress).toBe('Calle 1 #23');
  });

  it('congela el orden de bodyParameters: nombre, consultorio, fecha, hora, doctor', () => {
    const vars = formatAppointmentTemplateVars({
      patientName: 'María López',
      providerName: 'Dr. Jorge',
      startAt: START_AT,
      config: { clinicName: 'Dental Sonrisa', clinicAddress: '' },
    });

    const params = buildAppointmentReminderBodyParameters(vars);
    expect(params).toEqual([
      { type: 'text', text: 'María' },
      { type: 'text', text: 'Dental Sonrisa' },
      { type: 'text', text: 'lunes 5 de octubre' },
      { type: 'text', text: '10:00' },
      { type: 'text', text: 'Dr. Jorge' },
    ]);
  });

  it('usa la dirección placeholder exportada y fallback de doctor cuando no hay config', () => {
    const vars = formatAppointmentTemplateVars({
      patientName: 'María López',
      providerName: null,
      startAt: START_AT,
    });
    expect(vars.clinicAddress).toBe(APPOINTMENT_REMINDER_CLINIC_ADDRESS);
    expect(vars.providerName).toBe('tu especialista');
  });

  describe('resolveClinicReminderConfig', () => {
    const original = { ...process.env };

    beforeEach(() => {
      delete process.env.APPOINTMENT_REMINDER_CLINIC_NAME;
      delete process.env.WEB_CHAT_CLINIC_NAME;
      delete process.env.APPOINTMENT_REMINDER_CLINIC_ADDRESS;
    });

    afterEach(() => {
      process.env = { ...original };
    });

    it('prioriza APPOINTMENT_REMINDER_CLINIC_NAME y cae a WEB_CHAT_CLINIC_NAME y al default', () => {
      expect(resolveClinicReminderConfig().clinicName).toBe('Consultorio Dental');
      process.env.WEB_CHAT_CLINIC_NAME = 'Clínica Web';
      expect(resolveClinicReminderConfig().clinicName).toBe('Clínica Web');
      process.env.APPOINTMENT_REMINDER_CLINIC_NAME = 'Dental Sonrisa';
      expect(resolveClinicReminderConfig().clinicName).toBe('Dental Sonrisa');
    });

    it('permite sobreescribir la dirección por variable de entorno', () => {
      process.env.APPOINTMENT_REMINDER_CLINIC_ADDRESS = 'Av. Reforma 123';
      expect(resolveClinicReminderConfig().clinicAddress).toBe('Av. Reforma 123');
    });
  });
});

describe('sendAppointmentReminder', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(sendWhatsAppTemplateMessage).mockResolvedValue({
      ok: true,
      status: 200,
      providerMessageId: 'wamid.appointment-1',
    });
  });

  it('si la llave ya existe retorna skip sin llamar al proveedor', async () => {
    const contacts = buildQuery();
    const reminders = buildQuery();
    reminders._single = { data: { id: REMINDER_ID, status: 'sent' }, error: null };
    const inserts: Record<string, unknown>[] = [];
    reminders.insert.mockImplementation((payload: Record<string, unknown>) => {
      inserts.push(payload);
      return reminders;
    });
    mockAdminByTable({ whatsapp_contacts: contacts, appointment_reminders: reminders });

    const result = await sendAppointmentReminder(baseSendInput());

    expect(reminders.maybeSingle).toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
    expect(sendWhatsAppTemplateMessage).not.toHaveBeenCalled();
    expect(result).toEqual({
      reminderKey: `cita:${APPOINTMENT_ID}:h24:${appointmentReminderPeriod(START_AT).isoWeekKey}`,
      sent: false,
      skipped: true,
    });
  });

  it('dry-run inserta scheduled/dry_run=true y nunca llama al proveedor', async () => {
    const contacts = buildQuery();
    const reminders = buildQuery();
    const inserts: Record<string, unknown>[] = [];
    reminders.insert.mockImplementation((payload: Record<string, unknown>) => {
      inserts.push(payload);
      return reminders;
    });
    mockAdminByTable({ whatsapp_contacts: contacts, appointment_reminders: reminders });

    const result = await sendAppointmentReminder(baseSendInput({ dryRun: true }));

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      appointment_id: APPOINTMENT_ID,
      reminder_key: `cita:${APPOINTMENT_ID}:h24:${appointmentReminderPeriod(START_AT).isoWeekKey}`,
      cadence: 'h24',
      template_name: 'recordatorio_cita',
      status: 'scheduled',
      dry_run: true,
    });
    expect(inserts[0].sent_at).toBeUndefined();
    expect(sendWhatsAppTemplateMessage).not.toHaveBeenCalled();
    expect(result).toMatchObject({ sent: false, skipped: false, dryRun: true });
  });

  it('modo real envía la plantilla y persiste sent con provider_message_id y sent_at', async () => {
    const contacts = buildQuery();
    const reminders = buildQuery();
    const inserts: Record<string, unknown>[] = [];
    reminders.insert.mockImplementation((payload: Record<string, unknown>) => {
      inserts.push(payload);
      return reminders;
    });
    mockAdminByTable({ whatsapp_contacts: contacts, appointment_reminders: reminders });

    const result = await sendAppointmentReminder(baseSendInput());

    expect(sendWhatsAppTemplateMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '+5215512345678',
        templateName: 'recordatorio_cita',
        languageCode: 'es_MX',
        bodyParameters: [
          { type: 'text', text: 'María' },
          { type: 'text', text: expect.any(String) },
          { type: 'text', text: 'lunes 5 de octubre' },
          { type: 'text', text: '10:00' },
          { type: 'text', text: 'Dr. Jorge' },
        ],
      })
    );

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      status: 'sent',
      dry_run: false,
      provider_message_id: 'wamid.appointment-1',
    });
    expect(typeof inserts[0].sent_at).toBe('string');
    expect(result).toMatchObject({
      sent: true,
      skipped: false,
      providerMessageId: 'wamid.appointment-1',
    });
  });

  it('persiste failed con el error cuando el proveedor falla', async () => {
    vi.mocked(sendWhatsAppTemplateMessage).mockResolvedValueOnce({
      ok: false,
      skipped: true,
      status: null,
      error: 'WhatsApp Cloud API credentials are not configured.',
    });
    const contacts = buildQuery();
    const reminders = buildQuery();
    const inserts: Record<string, unknown>[] = [];
    reminders.insert.mockImplementation((payload: Record<string, unknown>) => {
      inserts.push(payload);
      return reminders;
    });
    mockAdminByTable({ whatsapp_contacts: contacts, appointment_reminders: reminders });

    const result = await sendAppointmentReminder(baseSendInput());

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      status: 'failed',
      dry_run: false,
      error: expect.stringContaining('credentials'),
    });
    expect(result).toMatchObject({
      sent: false,
      skipped: false,
      error: expect.stringContaining('credentials'),
    });
  });

  it('omite el envío si el contacto tiene opt_in_status = opted_out', async () => {
    const contacts = buildQuery();
    contacts._single = { data: { opt_in_status: 'opted_out' }, error: null };
    const reminders = buildQuery();
    const inserts: Record<string, unknown>[] = [];
    reminders.insert.mockImplementation((payload: Record<string, unknown>) => {
      inserts.push(payload);
      return reminders;
    });
    mockAdminByTable({ whatsapp_contacts: contacts, appointment_reminders: reminders });

    const result = await sendAppointmentReminder(baseSendInput());

    expect(sendWhatsAppTemplateMessage).not.toHaveBeenCalled();
    expect(reminders.maybeSingle).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
    expect(result).toMatchObject({ sent: false, skipped: true });
  });

  it('trata una violación de unicidad (23505) como skip idempotente sin lanzar', async () => {
    const contacts = buildQuery();
    const reminders = buildQuery();
    reminders._result = {
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    };
    mockAdminByTable({ whatsapp_contacts: contacts, appointment_reminders: reminders });

    const result = await sendAppointmentReminder(baseSendInput());

    expect(result).toMatchObject({
      reminderKey: `cita:${APPOINTMENT_ID}:h24:${appointmentReminderPeriod(START_AT).isoWeekKey}`,
      sent: false,
      skipped: true,
    });
  });
});
