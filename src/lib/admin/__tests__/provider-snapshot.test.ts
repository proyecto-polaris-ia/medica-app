import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  acquireDbSuiteLock,
  applyLocalDbEnv,
  localDbEnabled,
  releaseDbSuiteLock,
  truncateAllTables,
} from '@/test-utils/local-db';
import { getProviderSnapshot } from '../provider-snapshot';
import { createProvider } from '../providers';
import { createService } from '../services';
import { createPatient } from '../patients';
import { createAppointment } from '../appointments';
import { NotFoundError } from '../errors';
import { ValidationError } from '../validate';
import type { AppointmentStatus, Patient, Provider, Service } from '../types';

/**
 * Suite contra Supabase local (ver openspec/changes/supabase-local-testing).
 * Corre solo con `npm run test:local` (SUPABASE_LOCAL=1 + supabase start);
 * con `npm run test` regular se omite.
 */
const d = localDbEnabled ? describe : describe.skip;

// UUID válido que no existe en la BD.
const MISSING_PROVIDER_ID = '550e8400-e29b-41d4-a716-4466554400ff';

// Las suites de datos se serializan con un advisory lock (ver
// src/test-utils/local-db.ts) porque vitest corre los archivos en paralelo
// y todas truncan el esquema `public`.

type Base = {
  provider: Provider;
  service: Service;
  juan: Patient;
  maria: Patient;
};

async function seedBase(): Promise<Base> {
  const provider = await createProvider({ name: 'Dra. García' });
  const service = await createService({ name: 'Limpieza', durationMinutes: 45 });
  const juan = await createPatient({
    fullName: 'Juan Pérez',
    phoneE164: '+5215511111111',
  });
  const maria = await createPatient({
    fullName: 'María López',
    phoneE164: '+5215522222222',
  });
  return { provider, service, juan, maria };
}

async function addAppointment(
  base: Base,
  patient: Patient,
  startAt: string,
  endAt: string,
  status: AppointmentStatus
): Promise<void> {
  await createAppointment({
    patientId: patient.id,
    serviceId: base.service.id,
    providerId: base.provider.id,
    startAt,
    endAt,
    status,
  });
}

/** PostgREST serializa timestamptz con offset; comparamos el instante real. */
function instant(iso: string): string {
  return new Date(iso).toISOString();
}

d('getProviderSnapshot', () => {
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

  it('returns upcoming appointments sorted ascending', async () => {
    const base = await seedBase();
    await addAppointment(
      base,
      base.juan,
      '2026-09-05T14:00:00.000Z',
      '2026-09-05T14:30:00.000Z',
      'confirmed'
    );
    await addAppointment(
      base,
      base.maria,
      '2026-09-10T14:00:00.000Z',
      '2026-09-10T14:30:00.000Z',
      'confirmed'
    );

    const snapshot = await getProviderSnapshot(
      base.provider.id,
      new Date('2026-09-01T10:00:00.000Z')
    );

    expect(snapshot.provider.id).toBe(base.provider.id);
    expect(snapshot.upcoming).toHaveLength(2);
    expect(instant(snapshot.upcoming[0].startAt)).toBe('2026-09-05T14:00:00.000Z');
    expect(instant(snapshot.upcoming[1].startAt)).toBe('2026-09-10T14:00:00.000Z');
  });

  it('returns today agenda in America/Mexico_City', async () => {
    const base = await seedBase();
    await addAppointment(
      base,
      base.juan,
      '2026-09-03T14:00:00.000Z',
      '2026-09-03T14:30:00.000Z',
      'confirmed'
    );

    const snapshot = await getProviderSnapshot(
      base.provider.id,
      new Date('2026-09-03T20:30:00.000Z')
    );

    expect(snapshot.today).toHaveLength(1);
    expect(instant(snapshot.today[0].startAt)).toBe('2026-09-03T14:00:00.000Z');
  });

  it('deduplicates recent clients and counts appointments', async () => {
    const base = await seedBase();
    await addAppointment(
      base,
      base.juan,
      '2026-08-25T14:00:00.000Z',
      '2026-08-25T14:30:00.000Z',
      'attended'
    );
    await addAppointment(
      base,
      base.juan,
      '2026-08-28T14:00:00.000Z',
      '2026-08-28T14:30:00.000Z',
      'confirmed'
    );
    await addAppointment(
      base,
      base.maria,
      '2026-08-29T14:00:00.000Z',
      '2026-08-29T14:30:00.000Z',
      'attended'
    );
    await addAppointment(
      base,
      base.maria,
      '2026-08-30T14:00:00.000Z',
      '2026-08-30T14:30:00.000Z',
      'cancelled'
    );

    const snapshot = await getProviderSnapshot(
      base.provider.id,
      new Date('2026-09-03T20:30:00.000Z')
    );

    expect(snapshot.recentClients).toHaveLength(2);
    const juan = snapshot.recentClients.find((c) => c.fullName === 'Juan Pérez');
    const maria = snapshot.recentClients.find((c) => c.fullName === 'María López');
    expect(juan?.count).toBe(2);
    expect(maria?.count).toBe(1);
  });

  it('throws NotFoundError when provider does not exist', async () => {
    await expect(
      getProviderSnapshot(MISSING_PROVIDER_ID, new Date('2026-09-03T20:30:00.000Z'))
    ).rejects.toThrow(NotFoundError);
  });

  it('throws ValidationError for a malformed id', async () => {
    await expect(getProviderSnapshot('not-a-uuid', new Date())).rejects.toThrow(
      ValidationError
    );
  });
});
