import { notFound } from 'next/navigation';
import { BookingWizard } from '@/components/booking/BookingWizard';
import { isBookingUiEnabled } from '../api/booking/_lib/flag';

export default function PublicBookingPage() {
  if (!isBookingUiEnabled()) {
    notFound();
  }

  const hasSiteKey = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  const hasSecretKey = Boolean(process.env.TURNSTILE_SECRET_KEY);
  const siteKey = hasSiteKey && hasSecretKey ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY : '';

  return (
    <main className="min-h-screen py-8">
      <h1 className="mb-6 text-center text-2xl font-bold">
        Reserva tu cita
      </h1>
      <BookingWizard mode="public" siteKey={siteKey} />
    </main>
  );
}
