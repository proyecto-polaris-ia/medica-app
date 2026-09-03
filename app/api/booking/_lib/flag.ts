export function isBookingUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_BOOKING_UI_ENABLED === 'true';
}
