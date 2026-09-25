'use client';

import { useState } from 'react';
import type {
  ClinicalVisit,
  MedicalHistory,
  Patient,
  PatientRecord,
} from '@/lib/admin/types';
import { PatientDataTab } from './PatientDataTab';
import { PatientHistoryTab } from './PatientHistoryTab';
import { PatientVisitsTab } from './PatientVisitsTab';
import { PatientAppointmentsTab } from './PatientAppointmentsTab';
import { MedicalHistoryBadge } from './MedicalHistoryBadge';

type TabId = 'data' | 'history' | 'visits' | 'appointments';

type PatientRecordTabsProps = {
  patient: Patient;
  record: PatientRecord;
  medicalHistory: MedicalHistory;
  clinicalVisits: ClinicalVisit[];
  visitsLoading: boolean;
  visitsError: string | null;
  onPatientUpdated: (patient: Patient) => void;
  onHistoryUpdated: (history: MedicalHistory) => void;
  onVisitsChanged: () => void;
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'data', label: 'Datos' },
  { id: 'history', label: 'Historia' },
  { id: 'visits', label: 'Consultas' },
  { id: 'appointments', label: 'Citas' },
];

export function PatientRecordTabs({
  patient,
  record,
  medicalHistory,
  clinicalVisits,
  visitsLoading,
  visitsError,
  onPatientUpdated,
  onHistoryUpdated,
  onVisitsChanged,
}: PatientRecordTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('data');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold text-gray-900">{patient.fullName}</h2>
        <MedicalHistoryBadge history={medicalHistory} />
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
      </div>
    </div>
  );
}
