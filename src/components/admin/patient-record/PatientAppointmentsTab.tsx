import type { PatientRecord } from '@/lib/admin/types';
import { PatientRecordView } from '@/components/admin/PatientRecordView';

type PatientAppointmentsTabProps = {
  record: PatientRecord;
};

export function PatientAppointmentsTab({ record }: PatientAppointmentsTabProps) {
  return <PatientRecordView record={record} />;
}
