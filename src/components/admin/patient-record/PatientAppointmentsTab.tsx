import type { Patient } from '@/lib/admin/types';
import { PatientRecordView } from '@/components/admin/PatientRecordView';

type PatientAppointmentsTabProps = {
  patient: Patient;
  /** `true` en `/patients/[id]`; el modal usa estado local. */
  syncUrl?: boolean;
};

export function PatientAppointmentsTab({
  patient,
  syncUrl,
}: PatientAppointmentsTabProps) {
  return <PatientRecordView patient={patient} syncUrl={syncUrl} />;
}
