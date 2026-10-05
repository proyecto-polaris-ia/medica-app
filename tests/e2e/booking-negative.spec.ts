import { expect, test } from '@playwright/test';
import {
  clinicInstant,
  clinicToday,
  fetchSeededIds,
  fillContactDetails,
  nextBusinessDay,
  SEEDED_PROVIDER_ID,
  walkToConfirmStep,
} from './helpers/booking';
import { closeDb, countAppointments } from './helpers/db';

/**
 * Negative paths of public booking: rejected captcha, graceful degradation
 * without Turnstile keys and double-booking conflicts.
 *
 * Projects: every test runs in the `booking` project (Turnstile test keys)
 * except the tagged @no-captcha one, which runs in `booking-no-captcha`.
 */

const TURNSTILE_HOST_PROBE = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
const PROBE_TIMEOUT_MS = 5_000;
const NETWORK_SKIP_REASON =
  'Turnstile test widget requires network access to challenges.cloudflare.com';
const E2E_PHONE = '+5215512345678';
const E2E_FULL_NAME = 'Ana Prueba E2E';

// The always-pass test secret accepts any token value ("XXXX.DUMMY.TOKEN.XXXX"
// is Cloudflare's documented dummy), so the API can be driven without a browser.
const DUMMY_CAPTCHA_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

// This spec owns the second business day, so it never competes with the happy
// path's first business day.
const SPEC_DAY_OFFSET = 2;

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

test('rejects a booking POST without captchaToken and stores nothing', async ({ request }) => {
  test.skip(!turnstileReachable, NETWORK_SKIP_REASON);

  const { serviceId, providerId } = await fetchSeededIds(request);
  const localDate = nextBusinessDay(clinicToday(), SPEC_DAY_OFFSET);
  const startAt = clinicInstant(localDate, 10, 0);
  const endAt = clinicInstant(localDate, 10, 45);

  const response = await request.post('/api/booking/book', {
    data: {
      serviceId,
      providerId,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      phone: E2E_PHONE,
      fullName: E2E_FULL_NAME,
      // captchaToken intentionally missing.
    },
  });

  expect(response.status()).toBeGreaterThanOrEqual(400);
  expect(response.status()).toBeLessThan(500);
  expect(await response.json()).toMatchObject({ error: 'invalid_request', field: 'captchaToken' });
  expect(await countAppointments(providerId, startAt)).toBe(0);
});

test('keeps a single appointment when the slot is booked twice', async ({ page, request }) => {
  test.skip(!turnstileReachable, NETWORK_SKIP_REASON);

  const localDate = nextBusinessDay(clinicToday(), SPEC_DAY_OFFSET);
  const { serviceId, providerId } = await fetchSeededIds(request);

  const selection = await walkToConfirmStep(page, { localDate });
  expect(selection.providerId).toBe(SEEDED_PROVIDER_ID);
  const { startAt, endAt } = selection.slot;

  const bookingPayload = {
    serviceId,
    providerId,
    startAt,
    endAt,
    phone: E2E_PHONE,
    fullName: E2E_FULL_NAME,
    captchaToken: DUMMY_CAPTCHA_TOKEN,
  };

  const first = await request.post('/api/booking/book', { data: bookingPayload });
  expect(first.status()).toBe(201);

  const duplicate = await request.post('/api/booking/book', { data: bookingPayload });
  expect(duplicate.status()).toBe(409);
  expect(await duplicate.json()).toMatchObject({ status: 'conflict' });

  // The wizard still holds the slot the API just took, so submitting it must
  // surface the conflict block instead of creating a second appointment.
  await fillContactDetails(page, { phone: E2E_PHONE, fullName: E2E_FULL_NAME });
  const submit = page.getByRole('button', { name: 'Confirmar reserva' });
  await expect(submit).toBeEnabled({ timeout: 30_000 });
  await submit.click();

  await expect(
    page.getByRole('heading', { name: 'El horario ya no está disponible' })
  ).toBeVisible();
  expect(await countAppointments(providerId, new Date(startAt))).toBe(1);
});

test('disables public booking when Turnstile keys are missing @no-captcha', async ({ page }) => {
  const localDate = nextBusinessDay(clinicToday());

  await walkToConfirmStep(page, { localDate });

  await expect(
    page.getByText('La reserva en línea no está habilitada en este momento.')
  ).toBeVisible();
  await expect(page.getByTestId('turnstile-widget')).toHaveCount(0);

  // Even with valid contact data the booking cannot be completed.
  await fillContactDetails(page, { phone: E2E_PHONE, fullName: E2E_FULL_NAME });
  await expect(page.getByRole('button', { name: 'Confirmar reserva' })).toBeDisabled();
  await expect(page.getByRole('heading', { name: '¡Reserva confirmada!' })).toHaveCount(0);
});
