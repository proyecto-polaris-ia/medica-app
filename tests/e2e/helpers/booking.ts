import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';

/**
 * Shared helpers for the booking wizard specs: seeded data, clinic-timezone
 * dates and the deterministic walk through the four wizard steps.
 */

export const CLINIC_TIME_ZONE = 'America/Mexico_City';

/** Seed values from supabase/seed.sql (see also the task's ids). */
export const SEEDED_SERVICE_NAME = 'Limpieza';
export const SEEDED_PROVIDER_NAME = 'Dra. Ejemplo';
export const SEEDED_PROVIDER_ID = '00000000-0000-4000-8000-000000000101';

/**
 * Mexico City has had no DST since 2022-10-30, so a fixed UTC-6 offset matches
 * the clinic timezone the availability function resolves with `AT TIME ZONE`.
 */
const CLINIC_UTC_OFFSET = '-06:00';

const DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLINIC_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: CLINIC_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Today's calendar date in clinic time, as YYYY-MM-DD. */
export function clinicToday(now: Date = new Date()): string {
  return DATE_FORMATTER.format(now);
}

function toCalendarDate(localDate: string): Date {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(localDate: string, days: number): string {
  const date = toCalendarDate(localDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The `nth` business day (Mon–Fri, per the seeded business hours) strictly after
 * `localDate`. "Tomorrow" is not enough: a Friday run would land on a Saturday
 * with no seeded availability and the suite would fail for calendar reasons.
 */
export function nextBusinessDay(localDate: string, nth = 1): string {
  let date = localDate;
  let found = 0;
  while (found < nth) {
    date = addDays(date, 1);
    const weekday = toCalendarDate(date).getUTCDay();
    if (weekday >= 1 && weekday <= 5) {
      found += 1;
    }
  }
  return date;
}

/** Absolute instant for a clinic-local wall clock time (e.g. 10:00 → 16:00Z). */
export function clinicInstant(localDate: string, hours: number, minutes = 0): Date {
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  return new Date(`${localDate}T${hh}:${mm}:00${CLINIC_UTC_OFFSET}`);
}

/** Wall clock time of an instant in clinic time, as HH:mm. */
export function clinicTimeOfDay(instant: string | Date): string {
  return TIME_FORMATTER.format(new Date(instant));
}

export type ApiSlot = { startAt: string; endAt: string };

export type Catalog = {
  services: { id: string; name: string; durationMinutes: number }[];
  providers: { id: string; name: string }[];
};

export async function fetchCatalog(request: APIRequestContext): Promise<Catalog> {
  const servicesResponse = await request.get('/api/booking/services');
  const { services } = await readJson<Pick<Catalog, 'services'>>(
    servicesResponse,
    'GET /api/booking/services'
  );

  const providersResponse = await request.get('/api/booking/providers');
  const { providers } = await readJson<Pick<Catalog, 'providers'>>(
    providersResponse,
    'GET /api/booking/providers'
  );

  return { services, providers };
}

/** Reads a JSON body, failing with the status and URL when the API call failed. */
async function readJson<T>(response: APIResponse, label: string): Promise<T> {
  if (!response.ok()) {
    throw new Error(
      `${label} failed: status ${response.status()} at ${response.url()} — ${await response.text()}`
    );
  }
  return (await response.json()) as T;
}

export async function fetchSlots(
  request: APIRequestContext,
  params: { providerId: string; serviceId: string; date: string }
): Promise<ApiSlot[]> {
  const query = new URLSearchParams(params);
  const path = `/api/booking/slots?${query.toString()}`;
  const response = await request.get(path);
  const { slots } = await readJson<{ slots: ApiSlot[] }>(response, `GET ${path}`);
  return slots;
}

/** Ids of the seeded service/provider pair, resolved through the public API. */
export async function fetchSeededIds(
  request: APIRequestContext
): Promise<{ serviceId: string; providerId: string; serviceName: string; providerName: string }> {
  const catalog = await fetchCatalog(request);
  const service = catalog.services.find((candidate) => candidate.name === SEEDED_SERVICE_NAME);
  const provider = catalog.providers.find((candidate) => candidate.name === SEEDED_PROVIDER_NAME);
  if (!service || !provider) {
    throw new Error(
      `Seeded catalog not found: need service "${SEEDED_SERVICE_NAME}" and provider "${SEEDED_PROVIDER_NAME}".`
    );
  }
  return {
    serviceId: service.id,
    providerId: provider.id,
    serviceName: service.name,
    providerName: provider.name,
  };
}

async function selectOption(page: Page, listLabel: string, optionName: string): Promise<void> {
  const list = page.getByRole('listbox', { name: listLabel });
  await expect(list).toBeVisible();
  await list.getByRole('button', { name: new RegExp(optionName) }).click();
}

export type BookingSelection = {
  serviceId: string;
  serviceName: string;
  providerId: string;
  providerName: string;
  localDate: string;
  slot: ApiSlot;
};

/**
 * Walks the public wizard up to the confirmation step and returns what was
 * chosen. The slot is picked from the availability API by index and clicked by
 * the same index in the rendered list: both come from GET /api/booking/slots in
 * the same order (the UI only filters past slots out for today's date, and the
 * specs always book future business days).
 */
export async function walkToConfirmStep(
  page: Page,
  options: {
    localDate: string;
    serviceName?: string;
    providerName?: string;
    preferClinicTime?: { hours: number; minutes: number };
  }
): Promise<BookingSelection> {
  const serviceName = options.serviceName ?? SEEDED_SERVICE_NAME;
  const providerName = options.providerName ?? SEEDED_PROVIDER_NAME;

  const catalog = await fetchCatalog(page.request);
  const service = catalog.services.find((candidate) => candidate.name === serviceName);
  if (!service) {
    throw new Error(`Seeded service "${serviceName}" not found in GET /api/booking/services`);
  }
  const provider = catalog.providers.find((candidate) => candidate.name === providerName);
  if (!provider) {
    throw new Error(`Seeded provider "${providerName}" not found in GET /api/booking/providers`);
  }

  await page.goto('/booking');
  await expect(page.getByRole('heading', { name: 'Reserva tu cita' })).toBeVisible();

  await selectOption(page, 'Servicios', serviceName);
  await selectOption(page, 'Especialistas', providerName);

  await page.locator('input[type="date"]').fill(options.localDate);

  const slots = await fetchSlots(page.request, {
    providerId: provider.id,
    serviceId: service.id,
    date: options.localDate,
  });
  expect(slots.length, `free slots for ${serviceName} on ${options.localDate}`).toBeGreaterThan(0);

  let slotIndex = 0;
  if (options.preferClinicTime) {
    const { hours, minutes } = options.preferClinicTime;
    const preferred = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    const found = slots.findIndex((slot) => clinicTimeOfDay(slot.startAt) === preferred);
    if (found >= 0) {
      slotIndex = found;
    }
  }

  const slotList = page.getByRole('listbox', { name: 'Horarios disponibles' });
  await expect(slotList.getByRole('button').first()).toBeVisible();
  await slotList.getByRole('button').nth(slotIndex).click();

  await expect(page.locator('input[type="tel"]')).toBeVisible();

  return {
    serviceId: service.id,
    serviceName,
    providerId: provider.id,
    providerName,
    localDate: options.localDate,
    slot: slots[slotIndex],
  };
}

/** Fills the contact fields of the confirmation step (public mode). */
export async function fillContactDetails(
  page: Page,
  details: { phone: string; fullName: string }
): Promise<void> {
  await page.locator('input[type="tel"]').fill(details.phone);
  const nameInput = page.locator('input[type="text"]');
  await expect(nameInput).toHaveCount(1);
  await nameInput.fill(details.fullName);
}
