import { describe, expect, it } from 'vitest';
import type { Patient, PatientRecordAppointment } from '../types';
import { buildPatientRecord } from '../patient-record';

const patient: Patient = {
  id: 'patient-1',
  fullName: 'Daniel Rodríguez',
  phoneE164: '+5215512345678',
  email: 'daniel@example.com',
  notes: 'Prefiere tardes',
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
