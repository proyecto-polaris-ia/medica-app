import { expect, test } from '@playwright/test';
import {
  clinicToday,
  fillContactDetails,
  nextBusinessDay,
  SEEDED_PROVIDER_ID,
  walkToConfirmStep,
} from './helpers/booking';
import { closeDb, countAppointments, countAppointmentsOnDate } from './helpers/db';

/**
 * Happy path of the public booking wizard against the local Supabase stack.
 *
 * The Turnstile test widget (always-pass sitekey) needs network access to
 * challenges.cloudflare.com; when that host is unreachable the test is skipped
 * instead of producing a false failure.
 */

const TURNSTILE_HOST_PROBE = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
const PROBE_TIMEOUT_MS = 5_000;
const E2E_PHONE = '+5215512345678';
const E2E_FULL_NAME = 'Ana Prueba E2E';

let turnstileReachable = false;

test.beforeAll(async ({ request }) => {
  try {
    const response = await request.get(TURNSTILE_HOST_PROBE, {
      timeout: PROBE_TIMEOUT_MS,
      failOnStatusCode: false,
    });
    turnstileReachable = response.status() < 500;
  } catch {
    turnstileReachable = false;
  }
});

test.afterAll(async () => {
  await closeDb();
});

test('completes the wizard and persists the appointment', async ({ page }) => {
  test.skip(
    !turnstileReachable,
    'Turnstile test widget requires network access to challenges.cloudflare.com'
  );

  // First business day after today: "tomorrow" may be a weekend, which has no
  // seeded availability and would fail for calendar reasons.
  const localDate = nextBusinessDay(clinicToday());
  expect(localDate).not.toBe(clinicToday());

  const selection = await walkToConfirmStep(page, {
    localDate,
    // The 45-minute grid rarely contains 10:00; the helper falls back to the
    // first free slot, which is 09:00 for a freshly reset database.
    preferClinicTime: { hours: 10, minutes: 0 },
  });
  expect(selection.providerId).toBe(SEEDED_PROVIDER_ID);

  await fillContactDetails(page, { phone: E2E_PHONE, fullName: E2E_FULL_NAME });

  const submit = page.getByRole('button', { name: 'Confirmar reserva' });
  await expect(page.getByTestId('turnstile-widget')).toBeVisible();
  // The submit button only enables once Turnstile hands over a token.
  await expect(submit).toBeEnabled({ timeout: 30_000 });
  await submit.click();

  await expect(page.getByRole('heading', { name: '¡Reserva confirmada!' })).toBeVisible();
  await expect(page.getByText(E2E_FULL_NAME)).toBeVisible();

  const startAt = new Date(selection.slot.startAt);
  expect(await countAppointments(selection.providerId, startAt)).toBe(1);
  expect(await countAppointmentsOnDate(selection.providerId, localDate)).toBe(1);
});
