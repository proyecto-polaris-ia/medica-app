import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquireDbSuiteLock,
  applyLocalDbEnv,
  localDbEnabled,
  releaseDbSuiteLock,
  truncateAllTables,
} from '@/test-utils/local-db';
import { createProvider } from '@/lib/admin/providers';
import { createService } from '@/lib/admin/services';
import { listProviders, listServices } from '../catalog';

/**
 * Suite contra Supabase local (ver openspec/changes/supabase-local-testing).
 * Corre solo con `npm run test:local` (SUPABASE_LOCAL=1 + supabase start);
 * con `npm run test` regular se omite.
 *
 * El catálogo público lee la BD real: se siembra con funciones de dominio y se
 * comprueba el mapeo de filas, no las llamadas al query builder.
 */
const d = localDbEnabled ? describe : describe.skip;

// Las suites de datos se serializan con un advisory lock (ver
// src/test-utils/local-db.ts) porque vitest corre los archivos en paralelo
// y todas truncan el esquema `public`.

/**
 * Falla de transporte/consulta real vista por el cliente de Supabase: se
 * inyecta a nivel `fetch` (no se mockea el query builder), de modo que
 * `listServices`/`listProviders` ejecutan su rama `if (error) throw`.
 * El 500 evita el reintento interno de PostgREST (solo reintenta 520/503).
 */
function stubFailingQuery(message: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  );
}

d('catalog', () => {
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

  describe('listServices', () => {
    it('returns mapped services', async () => {
      const consulta = await createService({ name: 'Consulta', durationMinutes: 30 });
      const limpieza = await createService({ name: 'Limpieza', durationMinutes: 60 });

      const services = await listServices();

      expect(services).toHaveLength(2);
      expect(services).toEqual(
        expect.arrayContaining([
          { id: consulta.id, name: 'Consulta', durationMinutes: 30 },
          { id: limpieza.id, name: 'Limpieza', durationMinutes: 60 },
        ])
      );
    });

    it('throws when the query fails', async () => {
      stubFailingQuery('connection lost');
      try {
        await expect(listServices()).rejects.toThrow('connection lost');
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('returns an empty array when no services exist', async () => {
      const services = await listServices();

      expect(services).toEqual([]);
    });
  });

  describe('listProviders', () => {
    it('returns mapped providers', async () => {
      const ana = await createProvider({ name: 'Dra. Ana López' });
      const carlos = await createProvider({ name: 'Dr. Carlos Ruiz' });

      const providers = await listProviders();

      expect(providers).toHaveLength(2);
      expect(providers).toEqual(
        expect.arrayContaining([
          { id: ana.id, name: 'Dra. Ana López' },
          { id: carlos.id, name: 'Dr. Carlos Ruiz' },
        ])
      );
    });

    it('throws when the query fails', async () => {
      stubFailingQuery('timeout');
      try {
        await expect(listProviders()).rejects.toThrow('timeout');
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
