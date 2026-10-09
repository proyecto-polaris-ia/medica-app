import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  acquireDbSuiteLock,
  applyLocalDbEnv,
  localDbEnabled,
  releaseDbSuiteLock,
  truncateAllTables,
} from '@/test-utils/local-db';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { createProvider } from '../providers';
import {
  createBusinessHour,
  deleteBusinessHour,
  listBusinessHoursPage,
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

  /** Crea `count` horarios del proveedor en días distintos (0..6). */
  async function seedHours(providerId: string, count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let day = 0; day < count; day += 1) {
      const hour = await createBusinessHour({
        providerId,
        dayOfWeek: day,
        startTime: '09:00',
        endTime: '17:00',
      });
      ids.push(hour.id);
    }
    return ids;
  }

  /** Escribe `created_at` explícito: la suite necesita un orden determinista. */
  async function setCreatedAt(id: string, createdAtIso: string): Promise<void> {
    const { error } = await getSupabaseAdmin()
      .from('business_hours')
      .update({ created_at: createdAtIso })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  describe('listBusinessHoursPage', () => {
    it('lists mapped business hours with pagination metadata', async () => {
      const provider = await createProvider({ name: 'Dra. Ana' });
      await createBusinessHour({
        providerId: provider.id,
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '17:00',
      });

      const { businessHours, total } = await listBusinessHoursPage({
        page: 1,
        pageSize: 20,
      });

      expect(total).toBe(1);
      expect(businessHours).toHaveLength(1);
      expect(businessHours[0]).toEqual({
        id: expect.any(String),
        providerId: provider.id,
        dayOfWeek: 1,
        startTime: '09:00:00',
        endTime: '17:00:00',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('slices the listing across pages without repeating or losing rows (1.1)', async () => {
      const provider = await createProvider({ name: 'Dra. Ana' });
      const allIds = await seedHours(provider.id, 3);

      const page1 = await listBusinessHoursPage({ page: 1, pageSize: 2 });
      const page2 = await listBusinessHoursPage({ page: 2, pageSize: 2 });

      expect(page1.total).toBe(3);
      expect(page1.businessHours).toHaveLength(2);
      expect(page2.total).toBe(3);
      expect(page2.businessHours).toHaveLength(1);

      const page1Ids = page1.businessHours.map((hour) => hour.id);
      const page2Ids = page2.businessHours.map((hour) => hour.id);
      expect(page1Ids.filter((id) => page2Ids.includes(id))).toEqual([]);
      expect(new Set([...page1Ids, ...page2Ids])).toEqual(new Set(allIds));
    });

    it('reports the same total on every page and a coherent totalPages (1.2)', async () => {
      const provider = await createProvider({ name: 'Dra. Ana' });
      await seedHours(provider.id, 3);

      const page1 = await listBusinessHoursPage({ page: 1, pageSize: 2 });
      const page2 = await listBusinessHoursPage({ page: 2, pageSize: 2 });

      expect(page1.total).toBe(3);
      expect(page2.total).toBe(3);
      expect(Math.ceil(page1.total / 2)).toBe(2);
      expect(Math.ceil(page2.total / 2)).toBe(2);
    });

    it('filters by provider and counts only that provider (1.3)', async () => {
      const providerA = await createProvider({ name: 'Dra. Ana' });
      const providerB = await createProvider({ name: 'Dr. Beto' });
      const idsA = await seedHours(providerA.id, 7);
      await seedHours(providerB.id, 2);

      const filtered = await listBusinessHoursPage({
        providerId: providerA.id,
        page: 1,
        pageSize: 20,
      });

      expect(filtered.total).toBe(7);
      expect(filtered.businessHours).toHaveLength(7);
      expect(
        filtered.businessHours.every((hour) => hour.providerId === providerA.id)
      ).toBe(true);
      expect(filtered.businessHours.map((hour) => hour.id).sort()).toEqual(
        [...idsA].sort()
      );

      const unfiltered = await listBusinessHoursPage({ page: 1, pageSize: 20 });
      expect(unfiltered.total).toBe(9);
    });

    it('orders by created_at desc with an id desc tiebreaker across pages (1.4)', async () => {
      const provider = await createProvider({ name: 'Dra. Ana' });
      const allIds = await seedHours(provider.id, 5);
      for (const id of allIds) {
        await setCreatedAt(id, '2026-01-01T00:00:00.000Z');
      }

      const page1 = await listBusinessHoursPage({ page: 1, pageSize: 2 });
      const page2 = await listBusinessHoursPage({ page: 2, pageSize: 2 });
      const page3 = await listBusinessHoursPage({ page: 3, pageSize: 2 });

      const seen = [
        ...page1.businessHours,
        ...page2.businessHours,
        ...page3.businessHours,
      ].map((hour) => hour.id);

      expect(seen).toHaveLength(5);
      expect(new Set(seen)).toEqual(new Set(allIds));
      // Desempate `id desc` cuando `created_at` es idéntico.
      expect(seen).toEqual([...allIds].sort().reverse());

      const page1Again = await listBusinessHoursPage({ page: 1, pageSize: 2 });
      expect(page1Again.businessHours.map((hour) => hour.id)).toEqual(
        page1.businessHours.map((hour) => hour.id)
      );
    });

    it('rejects a malformed providerId (1.5)', async () => {
      await expect(
        listBusinessHoursPage({ providerId: 'no-es-un-uuid', page: 1, pageSize: 20 })
      ).rejects.toThrow(ValidationError);
      await expect(
        listBusinessHoursPage({ providerId: 'no-es-un-uuid', page: 1, pageSize: 20 })
      ).rejects.toMatchObject({ field: 'providerId' });
    });

    it('returns an empty page with the real total when out of range (1.6)', async () => {
      const provider = await createProvider({ name: 'Dra. Ana' });
      await seedHours(provider.id, 5);

      const result = await listBusinessHoursPage({ page: 9, pageSize: 20 });

      expect(result.businessHours).toEqual([]);
      expect(result.total).toBe(5);
    });

    it('keeps the filtered total when an out-of-range page also filters (triangulación)', async () => {
      const providerA = await createProvider({ name: 'Dra. Ana' });
      const providerB = await createProvider({ name: 'Dr. Beto' });
      await seedHours(providerA.id, 3);
      await seedHours(providerB.id, 4);

      const result = await listBusinessHoursPage({
        providerId: providerA.id,
        page: 9,
        pageSize: 20,
      });

      expect(result.businessHours).toEqual([]);
      expect(result.total).toBe(3);
    });

    it('reports total 0 for an empty catalog', async () => {
      const result = await listBusinessHoursPage({ page: 1, pageSize: 20 });

      expect(result.businessHours).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('createBusinessHour', () => {
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
      const stored = await listBusinessHoursPage({ page: 1, pageSize: 100 });
      expect(stored.businessHours.map((item) => item.id)).toContain(hour.id);
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
  });

  describe('updateBusinessHour', () => {
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
      const stored = await listBusinessHoursPage({ page: 1, pageSize: 100 });
      expect(stored.businessHours.find((item) => item.id === created.id)).toEqual(
        hour
      );
    });

    it('throws NotFoundError when it does not exist', async () => {
      await expect(
        updateBusinessHour('550e8400-e29b-41d4-a716-4466554400ff', {
          providerId: '550e8400-e29b-41d4-a716-446655440001',
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '17:00',
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteBusinessHour', () => {
    it('deletes a business hour', async () => {
      const provider = await createProvider({ name: 'Dra. Ana' });
      const created = await createBusinessHour({
        providerId: provider.id,
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '17:00',
      });

      await deleteBusinessHour(created.id);

      const stored = await listBusinessHoursPage({ page: 1, pageSize: 100 });
      expect(stored.businessHours.find((item) => item.id === created.id)).toBeUndefined();
    });
  });
});
