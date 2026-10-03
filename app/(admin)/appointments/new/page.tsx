import { notFound } from 'next/navigation';
import {
  BookingWizard,
  type ConfirmInitialPatient,
} from '@/components/booking/BookingWizard';
import { getPatient } from '@/lib/admin/patients';
import { isBookingUiEnabled } from '../../../api/booking/_lib/flag';

export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string }>;
}) {
  if (!isBookingUiEnabled()) {
    notFound();
  }

  const { patientId } = await searchParams;
  let initialPatient: ConfirmInitialPatient | undefined;
  if (patientId) {
    try {
      const patient = await getPatient(patientId);
      if (patient) {
        initialPatient = {
          id: patient.id,
          fullName: patient.fullName,
          phoneE164: patient.phoneE164,
          email: patient.email,
        };
      }
    } catch {
      // patientId inválido en el query string: el wizard pedirá los datos.
    }
  }

  return (
    <main className="min-h-screen py-8">
      <h1 className="mb-6 text-center text-2xl font-bold">
        Reserva tu cita
      </h1>
      <BookingWizard mode="internal" initialPatient={initialPatient} />
    </main>
  );
}
