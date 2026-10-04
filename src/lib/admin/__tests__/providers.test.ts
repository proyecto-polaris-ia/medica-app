import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  acquireDbSuiteLock,
  applyLocalDbEnv,
  localDbEnabled,
  releaseDbSuiteLock,
  truncateAllTables,
} from '@/test-utils/local-db';
import {
  createProvider,
  deleteProvider,
  getProvider,
  listProviders,
  updateProvider,
} from '../providers';
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

d('providers service', () => {
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

  it('lists mapped providers ordered by most recent', async () => {
    const first = await createProvider({ name: 'Dra. Ana' });
    const second = await createProvider({ name: 'Dr. Beto', color: '#1F77B4' });

    const providers = await listProviders();

    expect(providers.map((p) => p.id)).toEqual([second.id, first.id]);
    expect(providers[0]).toEqual({
      id: second.id,
      name: 'Dr. Beto',
      color: '#1f77b4',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it('creates a provider', async () => {
    const provider = await createProvider({ name: 'Dra. Ana' });

    expect(provider.name).toBe('Dra. Ana');
    expect(provider.color).toBeNull();
    // Outcome observable en la BD: el color ausente queda como NULL.
    await expect(getProvider(provider.id)).resolves.toEqual(provider);
  });

  it('creates a provider with a normalized color', async () => {
    const provider = await createProvider({ name: 'Dra. Ana', color: '#1F77B4' });

    expect(provider.color).toBe('#1f77b4');
    await expect(getProvider(provider.id)).resolves.toEqual(provider);
  });

  it('tolerates an invalid color by storing null', async () => {
    const provider = await createProvider({ name: 'Dra. Ana', color: 'red' });

    expect(provider.color).toBeNull();
    await expect(getProvider(provider.id)).resolves.toEqual(provider);
  });

  it('rejects an empty provider name', async () => {
    await expect(createProvider({ name: '   ' })).rejects.toThrow(ValidationError);
  });

  it('updates a provider', async () => {
    const created = await createProvider({ name: 'Dra. Ana' });

    const provider = await updateProvider(created.id, { name: 'Dra. Ana López' });

    expect(provider.name).toBe('Dra. Ana López');
    await expect(getProvider(created.id)).resolves.toEqual(provider);
  });

  it('updates a provider color', async () => {
    const created = await createProvider({ name: 'Dra. Ana' });

    const provider = await updateProvider(created.id, {
      name: 'Dra. Ana',
      color: '#2CA02C',
    });

    expect(provider.color).toBe('#2ca02c');
    await expect(getProvider(created.id)).resolves.toEqual(provider);
  });

  it('deletes a provider', async () => {
    const created = await createProvider({ name: 'Ortodoncia' });

    await deleteProvider(created.id);

    const providers = await listProviders();
    expect(providers.find((p) => p.id === created.id)).toBeUndefined();
  });

  describe('getProvider', () => {
    it('returns a provider by id', async () => {
      const created = await createProvider({ name: 'Dra. Ana' });

      const provider = await getProvider(created.id);

      expect(provider).toEqual(created);
    });

    it('throws NotFoundError when provider does not exist', async () => {
      await expect(
        getProvider('550e8400-e29b-41d4-a716-4466554400ff')
      ).rejects.toThrow(NotFoundError);
    });

    it('updateProvider throws NotFoundError when provider does not exist', async () => {
      await expect(
        updateProvider('550e8400-e29b-41d4-a716-4466554400ff', {
          name: 'Fantasma',
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ValidationError for a malformed id', async () => {
      await expect(getProvider('not-a-uuid')).rejects.toThrow(ValidationError);
    });
  });
});
