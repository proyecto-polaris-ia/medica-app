import { notFound } from 'next/navigation';
import { BookingWizard } from '@/components/booking/BookingWizard';
import { isBookingUiEnabled } from '../../api/booking/_lib/flag';

export default function BookingPage() {
  if (!isBookingUiEnabled()) {
    notFound();
  }

  return (
    <main className="min-h-screen py-8">
      <h1 className="mb-6 text-center text-2xl font-bold">
        Reserva tu cita
      </h1>
      <BookingWizard />
    </main>
  );
}
