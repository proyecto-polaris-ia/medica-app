import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MedicalHistory, Patient, PatientRecord, PatientReceivableSummary } from '@/lib/admin/types';
import { PatientRecordTabs } from '../PatientRecordTabs';

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';

const PATIENT: Patient = {
  id: PATIENT_ID,
  fullName: 'Juan Pérez',
  phoneE164: '+5215512345678',
  email: 'juan@example.com',
  notes: null,
  birthDate: null,
  sex: null,
  address: null,
  occupation: null,
  referralSource: null,
  secondaryPhone: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  emergencyContactRelationship: null,
  createdAt: '2026-09-01T10:00:00Z',
  updatedAt: '2026-09-01T10:00:00Z',
};

const RECORD: PatientRecord = {
  patient: PATIENT,
  upcomingAppointments: [],
  attendedAppointments: [],
};

const PAYMENTS_SUMMARY: PatientReceivableSummary = {
  patientId: PATIENT_ID,
  totalEligibleAmount: 0,
  paidAmount: 0,
  unallocatedPaidAmount: 0,
  balance: 0,
  creditAmount: 0,
  planBalances: [],
  lastPaymentAt: null,
};

function history(overrides: Partial<MedicalHistory> = {}): MedicalHistory {
  return {
    patientId: PATIENT_ID,
    allergies: [],
    systemicConditions: [],
    medications: [],
    pregnancyStatus: null,
    coagulationDisorders: null,
    anticoagulants: null,
    surgeries: null,
    infectiousDiseases: null,
    smoking: null,
    alcohol: null,
    dentalHistory: null,
    oralHabits: [],
    clinicalNotes: null,
    source: null,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    ...overrides,
  };
}

function renderTabs(medicalHistory: MedicalHistory) {
  return render(
    <PatientRecordTabs
      patient={PATIENT}
      record={RECORD}
      medicalHistory={medicalHistory}
      clinicalVisits={[]}
      visitsLoading={false}
      visitsError={null}
      treatmentPlans={[]}
      treatmentPlansLoading={false}
      treatmentPlansError={null}
      payments={[]}
      paymentsSummary={PAYMENTS_SUMMARY}
      paymentsLoading={false}
      paymentsError={null}
      files={[]}
      filesLoading={false}
      filesError={null}
      onPatientUpdated={vi.fn()}
      onHistoryUpdated={vi.fn()}
      onVisitsChanged={vi.fn()}
      onPlansChanged={vi.fn()}
      onPaymentsChanged={vi.fn()}
      onFilesChanged={vi.fn()}
    />
  );
}

describe('PatientRecordTabs onboarding badge', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('renderiza el badge "Onboarding pendiente" cuando no hay fila de historia (source null)', () => {
    renderTabs(history());

    expect(screen.getByText('Onboarding pendiente')).toBeInTheDocument();
    expect(screen.queryByText('Onboarding completo')).not.toBeInTheDocument();
  });

  it('renderiza el badge "Onboarding completo" con procedencia de autoreporte', () => {
    renderTabs(history({ source: 'patient_autoreport' }));

    const badge = screen.getByText('Onboarding completo');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Historia de autoreporte del paciente')
    );
  });

  it('mantiene el badge de advertencia clínica junto al badge de onboarding', () => {
    renderTabs(history({ allergies: ['penicilina'], source: 'patient_autoreport' }));

    expect(screen.getByText(/advertencia/i)).toBeInTheDocument();
    expect(screen.getByText('Alergias registradas')).toBeInTheDocument();
    expect(screen.getByText('Onboarding completo')).toBeInTheDocument();
  });

  it('no dispara fetch nuevo al renderizar el expediente', () => {
    renderTabs(history());

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
