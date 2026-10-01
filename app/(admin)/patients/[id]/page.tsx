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
  PatientReceivableSummary,
  PatientRecord,
  Payment,
  TreatmentPlan,
} from '@/lib/admin/types';

const EMPTY_PAYMENT_SUMMARY: PatientReceivableSummary = {
  patientId: '',
  totalEligibleAmount: 0,
  paidAmount: 0,
  unallocatedPaidAmount: 0,
  balance: 0,
  creditAmount: 0,
  planBalances: [],
  lastPaymentAt: null,
};

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
  const [treatmentPlans, setTreatmentPlans] = useState<TreatmentPlan[]>([]);
  const [treatmentPlansLoading, setTreatmentPlansLoading] = useState(false);
  const [treatmentPlansError, setTreatmentPlansError] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsSummary, setPaymentsSummary] = useState<PatientReceivableSummary>(EMPTY_PAYMENT_SUMMARY);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
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

  async function loadPayments() {
    if (!patientId) return;
    setPaymentsLoading(true);
    setPaymentsError(null);
    try {
      const res = await fetch(`/api/admin/patients/${patientId}/payments`);
      if (!res.ok) throw new Error('Error al cargar pagos');
      const data = await res.json();
      setPayments(data.payments ?? []);
      setPaymentsSummary(data.summary ?? { ...EMPTY_PAYMENT_SUMMARY, patientId });
    } catch (err) {
      setPaymentsError(err instanceof Error ? err.message : 'Error desconocido');
      setPayments([]);
      setPaymentsSummary({ ...EMPTY_PAYMENT_SUMMARY, patientId });
    } finally {
      setPaymentsLoading(false);
    }
  }

  async function loadTreatmentPlans() {
    if (!patientId) return;
    setTreatmentPlansLoading(true);
    setTreatmentPlansError(null);
    try {
      const res = await fetch(`/api/admin/patients/${patientId}/treatment-plans`);
      if (!res.ok) throw new Error('Error al cargar los planes de tratamiento');
      const data = await res.json();
      setTreatmentPlans(data.treatmentPlans);
    } catch (err) {
      setTreatmentPlansError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setTreatmentPlansLoading(false);
    }
  }

  useEffect(() => {
    loadRecord();
    loadMedicalHistory();
    loadClinicalVisits();
    loadTreatmentPlans();
    loadPayments();
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
          treatmentPlans={treatmentPlans}
          treatmentPlansLoading={treatmentPlansLoading}
          treatmentPlansError={treatmentPlansError}
          payments={payments}
          paymentsSummary={paymentsSummary}
          paymentsLoading={paymentsLoading}
          paymentsError={paymentsError}
          onPatientUpdated={handlePatientUpdated}
          onHistoryUpdated={handleHistoryUpdated}
          onVisitsChanged={loadClinicalVisits}
          onPlansChanged={loadTreatmentPlans}
          onPaymentsChanged={loadPayments}
        />
      )}
    </div>
  );
}
