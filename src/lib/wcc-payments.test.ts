import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  acquireDbSuiteLock,
  applyLocalDbEnv,
  localDbEnabled,
  releaseDbSuiteLock,
  truncateAllTables,
} from '@/test-utils/local-db';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { createPatient } from '@/lib/admin/patients';
import { createPaymentIntent } from '@/lib/payments/payment-intents';
import { getWccPaymentsQueue, getWccRemindersQueue } from './wcc-payments';

/**
 * Suite contra Supabase local (ver openspec/changes/supabase-local-testing).
 * Corre solo con `npm run test:local` (SUPABASE_LOCAL=1 + supabase start);
 * con `npm run test` regular se omite.
 */
const d = localDbEnabled ? describe : describe.skip;

// Las suites de datos se serializan con un advisory lock (ver
// src/test-utils/local-db.ts) porque vitest corre los archivos en paralelo
// y todas truncan el esquema `public`.

/** Ejecuta `run` con la config de Supabase ausente (rama "not configured"). */
async function withUnconfiguredSupabase<T>(run: () => Promise<T>): Promise<T> {
  const previous = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    service: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    return await run();
  } finally {
    if (previous.url !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    if (previous.anon !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previous.anon;
    if (previous.service !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = previous.service;
  }
}

/**
 * Fuerza una respuesta de error de PostgREST (service key inválida contra la
 * API local ya corriendo): la consulta real falla y el módulo debe degradar a
 * `isConfiguredButUnavailable`.
 */
async function withFailingSupabase<T>(run: () => Promise<T>): Promise<T> {
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'invalid-service-role-key';
  try {
    return await run();
  } finally {
    if (previousKey !== undefined) {
      process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    }
  }
}

d('wcc payments data layer', () => {
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

  const iso = (value: string) => new Date(value).toISOString();

  describe('getWccPaymentsQueue', () => {
    it('joins payment_intents with patient identity and lists DB-derived amounts', async () => {
      const patient = await createPatient({
        fullName: 'María López',
        phoneE164: '+5215512345678',
      });

      const intent = await createPaymentIntent({
        patientId: patient.id,
        amount: 1200,
        method: 'cash',
        source: 'manual',
      });

      const result = await getWccPaymentsQueue({ page: 1 });

      expect(result.isSupabaseConfigured).toBe(true);
      expect(result.isConfiguredButUnavailable).toBe(false);
      expect(result.totalCount).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.intents).toHaveLength(1);
      expect(result.intents[0]).toMatchObject({
        id: intent.id,
        patientId: patient.id,
        patientName: 'María López',
        patientPhoneE164: '+5215512345678',
        amount: 1200,
        method: 'cash',
        status: 'pending',
      });
    });

    it('degrades to empty when Supabase is not configured', async () => {
      const result = await withUnconfiguredSupabase(() => getWccPaymentsQueue({}));

      expect(result.isSupabaseConfigured).toBe(false);
      expect(result.isConfiguredButUnavailable).toBe(false);
      expect(result.intents).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it('flags the queue as configured-but-unavailable when the upstream query fails', async () => {
      const result = await withFailingSupabase(() => getWccPaymentsQueue({}));

      expect(result.isSupabaseConfigured).toBe(true);
      expect(result.isConfiguredButUnavailable).toBe(true);
      expect(result.intents).toEqual([]);
    });
  });

  describe('getWccRemindersQueue', () => {
    it('lists payment_reminders with patient identity, template, dry_run and sent_at', async () => {
      const patient = await createPatient({
        fullName: 'María López',
        phoneE164: '+5215512345678',
      });

      // No hay función de dominio para recordatorios arbitrarios: se insertan
      // directo en la tabla con `created_at` explícito para fijar el orden
      // "más reciente primero" que aplica la consulta real.
      const { data: sentReminder, error: sentError } = await getSupabaseAdmin()
        .from('payment_reminders')
        .insert({
          patient_id: patient.id,
          reminder_key: `patient:${patient.id}:plan:plan-1:2026-W39`,
          template_name: 'recordatorio_pago',
          status: 'sent',
          dry_run: false,
          balance_at_send: 1200,
          sent_at: '2026-09-30T12:00:00Z',
          created_at: '2026-09-30T12:00:00Z',
        })
        .select('id')
        .single();
      if (sentError || !sentReminder) {
        throw new Error(sentError?.message ?? 'reminder insert failed');
      }
      const { data: scheduledReminder, error: scheduledError } = await getSupabaseAdmin()
        .from('payment_reminders')
        .insert({
          patient_id: patient.id,
          reminder_key: `patient:${patient.id}:plan:plan-1:2026-W40`,
          template_name: 'recordatorio_pago',
          status: 'scheduled',
          dry_run: true,
          balance_at_send: null,
          sent_at: null,
          created_at: '2026-09-29T12:00:00Z',
        })
        .select('id')
        .single();
      if (scheduledError || !scheduledReminder) {
        throw new Error(scheduledError?.message ?? 'reminder insert failed');
      }

      const result = await getWccRemindersQueue({});

      expect(result.isSupabaseConfigured).toBe(true);
      expect(result.isConfiguredButUnavailable).toBe(false);
      expect(result.totalCount).toBe(2);
      expect(result.reminders).toHaveLength(2);
      expect(result.reminders[0]).toMatchObject({
        id: sentReminder.id,
        patientId: patient.id,
        patientName: 'María López',
        templateName: 'recordatorio_pago',
        status: 'sent',
        dryRun: false,
        balanceAtSend: 1200,
      });
      // timestamptz vuelve con offset `+00:00`: se normaliza a ISO.
      expect(iso(result.reminders[0].sentAt as string)).toBe(
        '2026-09-30T12:00:00.000Z'
      );
      expect(result.reminders[1]).toMatchObject({
        id: scheduledReminder.id,
        dryRun: true,
        sentAt: null,
        balanceAtSend: null,
        status: 'scheduled',
      });
    });

    it('degrades to empty when Supabase is not configured', async () => {
      const result = await withUnconfiguredSupabase(() => getWccRemindersQueue({}));

      expect(result.isSupabaseConfigured).toBe(false);
      expect(result.reminders).toEqual([]);
      expect(result.totalCount).toBe(0);
    });
  });
});
