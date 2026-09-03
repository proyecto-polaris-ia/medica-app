export function isBookingUiEnabled(): boolean {
  // Opt-out flag: the UI is enabled unless explicitly disabled with
  // NEXT_PUBLIC_BOOKING_UI_ENABLED=false.
  return process.env.NEXT_PUBLIC_BOOKING_UI_ENABLED !== 'false';
}
