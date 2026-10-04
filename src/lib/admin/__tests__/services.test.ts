import { beforeAll, beforeEach, expect, it } from 'vitest';
import {
  applyLocalDbEnv,
  localDbEnabled,
  truncateAllTables,
} from '@/test-utils/local-db';
import {
  createService,
  deleteService,
  listServices,
  updateService,
} from '../services';
import { NotFoundError } from '../errors';
import { ValidationError } from '../validate';

/**
 * Suite piloto contra Supabase local (ver openspec/changes/supabase-local-testing).
 * Corre solo con `npm run test:local` (SUPABASE_LOCAL=1 + supabase start);
 * con `npm run test` regular se omite.
 */
const d = localDbEnabled ? it : it.skip;

d('createService persists and maps a service', async () => {
  const service = await createService({ name: 'Consulta', durationMinutes: 30 });

  expect(service.id).toBeDefined();
  expect(service.name).toBe('Consulta');
  expect(service.durationMinutes).toBe(30);
  expect(service.createdAt).toBeTruthy();
  expect(service.updatedAt).toBeTruthy();
});

d('listServices returns services ordered by most recent', async () => {
  const first = await createService({ name: 'Limpieza', durationMinutes: 45 });
  const second = await createService({ name: 'Resina', durationMinutes: 60 });

  const services = await listServices();

  expect(services.map((s) => s.id)).toEqual([second.id, first.id]);
  const found = services[0];
  expect(found.name).toBe('Resina');
  expect(found.durationMinutes).toBe(60);
});

d('createService rejects a non-positive duration', async () => {
  await expect(createService({ name: 'Consulta', durationMinutes: 0 })).rejects.toThrow(
    ValidationError
  );
  await expect(
    createService({ name: 'Consulta', durationMinutes: -10 })
  ).rejects.toThrow(ValidationError);
});

d('updateService updates name and duration', async () => {
  const created = await createService({ name: 'Consulta', durationMinutes: 30 });

  const updated = await updateService(created.id, {
    name: 'Limpieza',
    durationMinutes: 60,
  });

  expect(updated.id).toBe(created.id);
  expect(updated.name).toBe('Limpieza');
  expect(updated.durationMinutes).toBe(60);
});

d('updateService throws NotFoundError for a missing service', async () => {
  await expect(
    updateService('00000000-0000-4000-8000-00000000dead', {
      name: 'Fantasma',
      durationMinutes: 30,
    })
  ).rejects.toThrow(NotFoundError);
});

d('deleteService removes the service', async () => {
  const created = await createService({ name: 'Ortodoncia', durationMinutes: 90 });

  await deleteService(created.id);

  const services = await listServices();
  expect(services.find((s) => s.id === created.id)).toBeUndefined();
});

d('deleteService rejects a service referenced by an appointment (FK)', async () => {
  const created = await createService({ name: 'Extracción', durationMinutes: 60 });
  const supabase = (await import('@/lib/supabase/server')).getSupabaseAdmin();

  const provider = await supabase
    .from('providers')
    .insert({ name: 'Dra. Piloto' })
    .select('id')
    .single();
  expect(provider.error).toBeNull();
  if (!provider.data) throw new Error('provider insert returned no data');

  const start = new Date('2026-06-01T15:00:00Z');
  const inserted = await supabase
    .from('appointments')
    .insert({
      service_id: created.id,
      provider_id: provider.data.id,
      start_at: start.toISOString(),
      end_at: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single();
  expect(inserted.error).toBeNull();

  // La FK real impide borrar un servicio en uso: comportamiento que el mock
  // del query builder simulaba y podía divergir de producción.
  await expect(deleteService(created.id)).rejects.toThrow();
});

beforeAll(() => {
  applyLocalDbEnv();
});

beforeEach(async () => {
  await truncateAllTables();
});
