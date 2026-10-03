'use client';

import { useState } from 'react';
import type {
  ClinicalVisit,
  MedicalHistory,
  Patient,
  PatientFile,
  PatientReceivableSummary,
  PatientRecord,
  Payment,
  TreatmentPlan,
} from '@/lib/admin/types';
import { PatientDataTab } from './PatientDataTab';
import { PatientHistoryTab } from './PatientHistoryTab';
import { PatientVisitsTab } from './PatientVisitsTab';
import { PatientAppointmentsTab } from './PatientAppointmentsTab';
import { MedicalHistoryBadge } from './MedicalHistoryBadge';
import { OnboardingStatusBadge } from './OnboardingStatusBadge';
import { TreatmentPlansTab } from './TreatmentPlansTab';
import { PatientPaymentsTab } from './PatientPaymentsTab';
import { PatientFilesTab } from './PatientFilesTab';

type TabId =
  | 'data'
  | 'history'
  | 'visits'
  | 'appointments'
  | 'plans'
  | 'payments'
  | 'files';

type PatientRecordTabsProps = {
  patient: Patient;
  record: PatientRecord;
  medicalHistory: MedicalHistory;
  clinicalVisits: ClinicalVisit[];
  visitsLoading: boolean;
  visitsError: string | null;
  treatmentPlans: TreatmentPlan[];
  treatmentPlansLoading: boolean;
  treatmentPlansError: string | null;
  payments: Payment[];
  paymentsSummary: PatientReceivableSummary;
  paymentsLoading: boolean;
  paymentsError: string | null;
  files: PatientFile[];
  filesLoading: boolean;
  filesError: string | null;
  onPatientUpdated: (patient: Patient) => void;
  onHistoryUpdated: (history: MedicalHistory) => void;
  onVisitsChanged: () => void;
  onPlansChanged: () => void;
  onPaymentsChanged: () => void;
  onFilesChanged: () => void;
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'data', label: 'Datos' },
  { id: 'history', label: 'Historia' },
  { id: 'visits', label: 'Consultas' },
  { id: 'appointments', label: 'Citas' },
  { id: 'plans', label: 'Plan de tratamiento' },
  { id: 'payments', label: 'Pagos' },
  { id: 'files', label: 'Archivos' },
];

export function PatientRecordTabs({
  patient,
  record,
  medicalHistory,
  clinicalVisits,
  visitsLoading,
  visitsError,
  treatmentPlans,
  treatmentPlansLoading,
  treatmentPlansError,
  payments,
  paymentsSummary,
  paymentsLoading,
  paymentsError,
  files,
  filesLoading,
  filesError,
  onPatientUpdated,
  onHistoryUpdated,
  onVisitsChanged,
  onPlansChanged,
  onPaymentsChanged,
  onFilesChanged,
}: PatientRecordTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('data');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold text-gray-900">{patient.fullName}</h2>
        <MedicalHistoryBadge history={medicalHistory} />
        <OnboardingStatusBadge
          hasMedicalHistory={medicalHistory.source !== null}
          source={medicalHistory.source}
        />
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6" aria-label="Tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div role="tabpanel" className="pt-2">
        {activeTab === 'data' && (
          <PatientDataTab patient={patient} onPatientUpdated={onPatientUpdated} />
        )}
        {activeTab === 'history' && (
          <PatientHistoryTab
            patientId={patient.id}
            history={medicalHistory}
            onHistoryUpdated={onHistoryUpdated}
          />
        )}
        {activeTab === 'visits' && (
          <PatientVisitsTab
            patientId={patient.id}
            visits={clinicalVisits}
            loading={visitsLoading}
            error={visitsError}
            onVisitsChanged={onVisitsChanged}
          />
        )}
        {activeTab === 'appointments' && <PatientAppointmentsTab record={record} />}
        {activeTab === 'plans' && (
          <TreatmentPlansTab
            patientId={patient.id}
            treatmentPlans={treatmentPlans}
            loading={treatmentPlansLoading}
            error={treatmentPlansError}
            onPlansChanged={onPlansChanged}
          />
        )}
        {activeTab === 'payments' && (
          <PatientPaymentsTab
            patientId={patient.id}
            payments={payments}
            summary={paymentsSummary}
            loading={paymentsLoading}
            error={paymentsError}
            onPaymentsChanged={onPaymentsChanged}
          />
        )}
        {activeTab === 'files' && (
          <PatientFilesTab
            patientId={patient.id}
            clinicalVisits={clinicalVisits}
            files={files}
            loading={filesLoading}
            error={filesError}
            onFilesChanged={onFilesChanged}
          />
        )}
      </div>
    </div>
  );
}
