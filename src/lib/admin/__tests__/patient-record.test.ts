import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';

import { NotFoundError } from '../errors';
import type { Patient, PatientRecordAppointment } from '../types';
import { ValidationError } from '../validate';
import { buildPatientRecord, getPatientRecord } from '../patient-record';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

const admin = getSupabaseAdmin as ReturnType<typeof vi.fn>;

const patient: Patient = {
  id: 'patient-1',
  fullName: 'Daniel Rodríguez',
  phoneE164: '+5215512345678',
  email: 'daniel@example.com',
  notes: 'Prefiere tardes',
  birthDate: null,
  sex: null,
  address: null,
  occupation: null,
  referralSource: null,
  secondaryPhone: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  emergencyContactRelationship: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

function appointment(
  id: string,
  startAt: string,
  status: PatientRecordAppointment['status']
): PatientRecordAppointment {
  return {
    id,
    patientId: patient.id,
    serviceId: 'service-1',
    providerId: 'provider-1',
    startAt,
    endAt: new Date(new Date(startAt).getTime() + 30 * 60 * 1000).toISOString(),
    status,
    notes: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    serviceName: 'Limpieza dental',
    providerName: 'Dra. Ana Martínez',
  };
}

describe('buildPatientRecord', () => {
  it('classifies active future appointments ascending and attended history descending', () => {
    const record = buildPatientRecord(
      patient,
      [
        appointment('future-late', '2026-09-16T17:00:00.000Z', 'confirmed'),
        appointment('future-cancelled', '2026-09-14T17:00:00.000Z', 'cancelled'),
        appointment('attended-old', '2026-08-01T17:00:00.000Z', 'attended'),
        appointment('future-early', '2026-09-13T17:00:00.000Z', 'requested'),
        appointment('attended-new', '2026-08-20T17:00:00.000Z', 'attended'),
      ],
      new Date('2026-09-12T00:00:00.000Z')
    );

    expect(record.upcomingAppointments.map((item) => item.id)).toEqual([
      'future-early',
      'future-late',
    ]);
    expect(record.attendedAppointments.map((item) => item.id)).toEqual([
      'attended-new',
      'attended-old',
    ]);
  });
});

describe('buildPatientRecord — future inactive statuses', () => {
  it('excludes every inactive future status from upcoming', () => {
    const record = buildPatientRecord(
      patient,
      [
        appointment('f-requested', '2026-09-13T17:00:00.000Z', 'requested'),
        appointment('f-confirmed', '2026-09-13T18:00:00.000Z', 'confirmed'),
        appointment('f-cancelled', '2026-09-13T19:00:00.000Z', 'cancelled'),
        appointment('f-rescheduled', '2026-09-13T19:30:00.000Z', 'rescheduled'),
        appointment('f-no-show', '2026-09-13T20:00:00.000Z', 'no_show'),
        appointment('f-attended', '2026-09-13T20:30:00.000Z', 'attended'),
      ],
      new Date('2026-09-12T00:00:00.000Z'),
    );

    expect(record.upcomingAppointments.map((item) => item.id)).toEqual([
      'f-requested',
      'f-confirmed',
    ]);
  });

  it('classifies a past non-attended appointment as neither upcoming nor attended', () => {
    const record = buildPatientRecord(
      patient,
      [appointment('past-cancelled', '2026-09-01T17:00:00.000Z', 'cancelled')],
      new Date('2026-09-12T00:00:00.000Z'),
    );

    expect(record.upcomingAppointments).toEqual([]);
    expect(record.attendedAppointments).toEqual([]);
  });
});

describe('getPatientRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockPatientQuery(result: { data: unknown; error: unknown }) {
    const single = vi.fn().mockResolvedValue(result);
    const eq = vi.fn().mockReturnValue({ single });
    const select = vi.fn().mockReturnValue({ eq });
    return { select, eq, single };
  }

  function mockAppointmentsQuery(result: { data: unknown; error: unknown }) {
    const order = vi.fn().mockResolvedValue(result);
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    return { select, eq, order };
  }

  function mockFrom(patientResult: { data: unknown; error: unknown }, appointmentsResult: { data: unknown; error: unknown }) {
    const patientsQuery = mockPatientQuery(patientResult);
    const appointmentsQuery = mockAppointmentsQuery(appointmentsResult);
    const from = vi.fn((table: string) =>
      table === 'patients' ? patientsQuery : appointmentsQuery,
    );
    admin.mockReturnValue({ from });
    return { from, patientsQuery, appointmentsQuery };
  }

  const patientRow = {
    id: '00000000-0000-4000-8000-000000000001',
    full_name: 'Daniel Rodríguez',
    phone_e164: '+5215512345678',
    email: null,
    notes: undefined,
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z',
  };

  const appointmentRow = {
    id: '00000000-0000-4000-8000-000000000002',
    patient_id: '00000000-0000-4000-8000-000000000001',
    service_id: 'service-1',
    provider_id: 'provider-1',
    start_at: '2027-01-10T17:00:00.000Z',
    end_at: '2027-01-10T17:30:00.000Z',
    status: 'confirmed',
    notes: 'Traer radiografía',
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z',
    services: { name: 'Limpieza dental' },
    providers: [{ full_name: 'Dra. Ana Martínez' }],
  };

  it('maps a patient row with optional nulls and embedded relation names', async () => {
    mockFrom({ data: patientRow, error: null }, { data: [appointmentRow], error: null });

    const record = await getPatientRecord('00000000-0000-4000-8000-000000000001');

    expect(record.patient.fullName).toBe('Daniel Rodríguez');
    expect(record.patient.email).toBeNull();
    expect(record.patient.notes).toBeNull();
    expect(record.patient.birthDate).toBeNull();
    expect(record.patient.sex).toBeNull();
    expect(record.patient.address).toBeNull();
    expect(record.patient.occupation).toBeNull();
    expect(record.patient.referralSource).toBeNull();
    expect(record.patient.secondaryPhone).toBeNull();
    expect(record.patient.emergencyContactName).toBeNull();
    expect(record.patient.emergencyContactPhone).toBeNull();
    expect(record.patient.emergencyContactRelationship).toBeNull();

    const [first] = record.upcomingAppointments;
    expect(first.serviceName).toBe('Limpieza dental');
    expect(first.providerName).toBe('Dra. Ana Martínez');
    expect(first.notes).toBe('Traer radiografía');
  });

  it('falls back to unknown names when the embedded relations are missing', async () => {
    mockFrom(
      { data: patientRow, error: null },
      {
        data: [
          {
            ...appointmentRow,
            services: { full_name: 'Ortodoncia' },
            providers: undefined,
          },
        ],
        error: null,
      },
    );

    const record = await getPatientRecord('00000000-0000-4000-8000-000000000001');

    expect(record.upcomingAppointments[0].serviceName).toBe('Ortodoncia');
    expect(record.upcomingAppointments[0].providerName).toBe('Proveedor desconocido');
  });

  it('tolerates scalar relation payloads through toArray', async () => {
    mockFrom(
      { data: patientRow, error: null },
      {
        data: [
          {
            ...appointmentRow,
            services: 'Limpieza profiláctica',
            providers: null,
          },
        ],
        error: null,
      },
    );

    const record = await getPatientRecord('00000000-0000-4000-8000-000000000001');

    // El escalar pasa por toArray (rama cubierta) pero un string no tiene
    // `name`/`full_name`: cae al fallback determinista.
    expect(record.upcomingAppointments[0].serviceName).toBe('Servicio desconocido');
    expect(record.upcomingAppointments[0].providerName).toBe('Proveedor desconocido');
  });

  it('throws NotFoundError when the patient does not exist', async () => {
    mockFrom({ data: null, error: null }, { data: [], error: null });

    await expect(
      getPatientRecord('00000000-0000-4000-8000-000000000009'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError when the patient query errors', async () => {
    mockFrom({ data: null, error: { message: 'boom' } }, { data: [], error: null });

    await expect(
      getPatientRecord('00000000-0000-4000-8000-000000000001'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('surfaces an appointments query error with its message', async () => {
    mockFrom(
      { data: patientRow, error: null },
      { data: null, error: { message: 'appointments exploded' } },
    );

    await expect(
      getPatientRecord('00000000-0000-4000-8000-000000000001'),
    ).rejects.toThrow('appointments exploded');
  });

  it('validates the patient id as a uuid', async () => {
    await expect(getPatientRecord('not-a-uuid')).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
