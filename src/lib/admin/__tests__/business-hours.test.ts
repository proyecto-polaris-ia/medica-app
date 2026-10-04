import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  acquireDbSuiteLock,
  applyLocalDbEnv,
  localDbEnabled,
  releaseDbSuiteLock,
  truncateAllTables,
} from '@/test-utils/local-db';
import { createProvider } from '../providers';
import {
  createBusinessHour,
  deleteBusinessHour,
  listBusinessHours,
  updateBusinessHour,
} from '../business-hours';
import { ValidationError } from '../validate';
import { NotFoundError } from '../errors';

/**
 * Suite contra Supabase local (ver openspec/changes/supabase-local-testing).
 * Corre solo con `npm run test:local` (SUPABASE_LOCAL=1 + supabase start);
 * con `npm run test` regular se omite.
 */
const d = localDbEnabled ? describe : describe.skip;

// Las suites de datos se serializan con un advisory lock (ver
// src/test-utils/local-db.ts) porque vitest corre los archivos en paralelo
// y todas truncan el esquema `public`.

// UUID válido para casos de validación pura, donde no se toca la BD.
const PROVIDER_ID = '550e8400-e29b-41d4-a716-446655440001';

d('business-hours service', () => {
  beforeAll(async () => {
    applyLocalDbEnv();
    await acquireDbSuiteLock();
  });

  afterAll(async () => {
    await releaseDbSuiteLock();
  });

  beforeEach(async () => {
    await truncateAllTables();
  });

  it('lists mapped business hours', async () => {
    const provider = await createProvider({ name: 'Dra. Ana' });
    await createBusinessHour({
      providerId: provider.id,
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '17:00',
    });

    const hours = await listBusinessHours();

    expect(hours).toHaveLength(1);
    expect(hours[0]).toEqual({
      id: expect.any(String),
      providerId: provider.id,
      dayOfWeek: 1,
      startTime: '09:00:00',
      endTime: '17:00:00',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it('creates a business hour', async () => {
    const provider = await createProvider({ name: 'Dra. Ana' });

    const hour = await createBusinessHour({
      providerId: provider.id,
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '17:00',
    });

    expect(hour.providerId).toBe(provider.id);
    expect(hour.dayOfWeek).toBe(1);
    // Outcome observable en la BD: el horario quedó persistido.
    const stored = await listBusinessHours();
    expect(stored.map((h) => h.id)).toContain(hour.id);
  });

  it('rejects an invalid day of week', async () => {
    await expect(
      createBusinessHour({
        providerId: PROVIDER_ID,
        dayOfWeek: 7,
        startTime: '09:00',
        endTime: '17:00',
      })
    ).rejects.toThrow(ValidationError);
  });

  it('rejects end time before start time', async () => {
    await expect(
      createBusinessHour({
        providerId: PROVIDER_ID,
        dayOfWeek: 1,
        startTime: '17:00',
        endTime: '09:00',
      })
    ).rejects.toThrow(ValidationError);
  });

  it('updates a business hour', async () => {
    const provider = await createProvider({ name: 'Dra. Ana' });
    const created = await createBusinessHour({
      providerId: provider.id,
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '17:00',
    });

    const hour = await updateBusinessHour(created.id, {
      providerId: provider.id,
      dayOfWeek: 2,
      startTime: '10:00',
      endTime: '18:00',
    });

    expect(hour.dayOfWeek).toBe(2);
    expect(hour.startTime).toBe('10:00:00');
    const stored = await listBusinessHours();
    expect(stored.find((h) => h.id === created.id)).toEqual(hour);
  });

  it('updateBusinessHour throws NotFoundError when it does not exist', async () => {
    await expect(
      updateBusinessHour('550e8400-e29b-41d4-a716-4466554400ff', {
        providerId: '550e8400-e29b-41d4-a716-446655440001',
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '17:00',
      })
    ).rejects.toThrow(NotFoundError);
  });

  it('deletes a business hour', async () => {
    const provider = await createProvider({ name: 'Dra. Ana' });
    const created = await createBusinessHour({
      providerId: provider.id,
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '17:00',
    });

    await deleteBusinessHour(created.id);

    const hours = await listBusinessHours();
    expect(hours.find((h) => h.id === created.id)).toBeUndefined();
  });
});
