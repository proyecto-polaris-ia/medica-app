'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ErrorState } from '@/components/admin/ErrorState';
import { LoadingState } from '@/components/admin/LoadingState';
import { PatientRecordTabs } from '@/components/admin/patient-record/PatientRecordTabs';
import type {
  ClinicalVisit,
  MedicalHistory,
  Patient,
  PatientRecord,
} from '@/lib/admin/types';

const EMPTY_HISTORY: MedicalHistory = {
  patientId: '',
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
  createdAt: '',
  updatedAt: '',
};

export default function PatientRecordPage() {
  const params = useParams<{ id: string }>();
  const patientId = params?.id;
  const [record, setRecord] = useState<PatientRecord | null>(null);
  const [medicalHistory, setMedicalHistory] = useState<MedicalHistory>(EMPTY_HISTORY);
  const [clinicalVisits, setClinicalVisits] = useState<ClinicalVisit[]>([]);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [visitsError, setVisitsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadRecord() {
    if (!patientId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/patients/${patientId}/record`);
      if (!res.ok) throw new Error('Error al cargar el expediente');
      const data = await res.json();
      setRecord(data.record);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }

  async function loadMedicalHistory() {
    if (!patientId) return;
    try {
      const res = await fetch(`/api/admin/patients/${patientId}/medical-history`);
      if (!res.ok) throw new Error('Error al cargar la historia clínica');
      const data = await res.json();
      setMedicalHistory(data.medicalHistory);
    } catch (err) {
      // Historia clínica vacía no bloquea la vista del expediente.
      setMedicalHistory({ ...EMPTY_HISTORY, patientId });
    }
  }

  async function loadClinicalVisits() {
    if (!patientId) return;
    setVisitsLoading(true);
    setVisitsError(null);
    try {
      const res = await fetch(`/api/admin/patients/${patientId}/clinical-visits`);
      if (!res.ok) throw new Error('Error al cargar las consultas');
      const data = await res.json();
      setClinicalVisits(data.clinicalVisits);
    } catch (err) {
      setVisitsError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setVisitsLoading(false);
    }
  }

  useEffect(() => {
    loadRecord();
    loadMedicalHistory();
    loadClinicalVisits();
  }, [patientId]);

  function handlePatientUpdated(patient: Patient) {
    setRecord((prev) => (prev ? { ...prev, patient } : prev));
  }

  function handleHistoryUpdated(history: MedicalHistory) {
    setMedicalHistory(history);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expediente</h1>
          <p className="text-sm text-gray-500">Resumen inicial del paciente</p>
        </div>
        <Link href="/patients" className="text-sm font-medium text-blue-600 hover:text-blue-800">
          Volver a pacientes
        </Link>
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={loadRecord} />}
      {!loading && !error && record && (
        <PatientRecordTabs
          patient={record.patient}
          record={record}
          medicalHistory={medicalHistory}
          clinicalVisits={clinicalVisits}
          visitsLoading={visitsLoading}
          visitsError={visitsError}
          onPatientUpdated={handlePatientUpdated}
          onHistoryUpdated={handleHistoryUpdated}
          onVisitsChanged={loadClinicalVisits}
        />
      )}
    </div>
  );
}
