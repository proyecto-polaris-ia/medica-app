import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  acquireDbSuiteLock,
  applyLocalDbEnv,
  localDbEnabled,
  releaseDbSuiteLock,
  truncateAllTables,
} from '@/test-utils/local-db';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { createPatient } from '../patients';
import { createProvider } from '../providers';
import {
  listTreatmentPlans,
  getTreatmentPlan,
  createTreatmentPlan,
  updateTreatmentPlan,
  deleteTreatmentPlan,
  createTreatmentPlanItem,
  updateTreatmentPlanItem,
  deleteTreatmentPlanItem,
  sumLineTotals,
  moneyToCents,
} from '../treatment-plans';
import { NotFoundError, ConflictError } from '../errors';
import { ValidationError } from '../validate';
import type { TreatmentPlan, TreatmentPlanStatus } from '../types';

/**
 * Suite contra Supabase local (ver openspec/changes/supabase-local-testing).
 * Corre solo con `npm run test:local` (SUPABASE_LOCAL=1 + supabase start);
 * con `npm run test` regular se omite.
 */
const d = localDbEnabled ? describe : describe.skip;

// UUID válido sin fila asociada (los errores PGRST116 / 0 filas son reales).
const MISSING_ID = '00000000-0000-4000-8000-00000000dead';

// Las suites de datos se serializan con un advisory lock (ver
// src/test-utils/local-db.ts) porque vitest corre los archivos en paralelo
// y todas truncan el esquema `public`.

d('treatment-plans data layer', () => {
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

  /** Fixtures deterministas vía funciones de dominio. */
  async function seedPatientAndProvider() {
    const patient = await createPatient({
      fullName: 'Juan Pérez',
      phoneE164: '+5215512345678',
    });
    const provider = await createProvider({ name: 'Dra. Ana' });
    return { patient, provider };
  }

  async function seedDraftPlan(name = 'Plan A') {
    const { patient, provider } = await seedPatientAndProvider();
    const plan = await createTreatmentPlan(patient.id, {
      providerId: provider.id,
      name,
    });
    return { patient, provider, plan };
  }

  /**
   * Camino de transiciones válido para llegar a cada estado; los planes se
   * siembran con las funciones de dominio (no hay inserción directa de estado).
   */
  const TRANSITION_PATH: Record<TreatmentPlanStatus, TreatmentPlanStatus[]> = {
    draft: [],
    presented: ['presented'],
    accepted: ['presented', 'accepted'],
    in_progress: ['presented', 'accepted', 'in_progress'],
    completed: ['presented', 'accepted', 'in_progress', 'completed'],
    cancelled: ['cancelled'],
  };

  async function seedPlanInStatus(status: TreatmentPlanStatus) {
    const { patient, provider, plan } = await seedDraftPlan();
    let current: TreatmentPlan = plan;
    for (const next of TRANSITION_PATH[status]) {
      current = await updateTreatmentPlan(plan.id, { status: next });
    }
    expect(current.status).toBe(status);
    return { patient, provider, plan: current };
  }

  /** Lectura cruda: las columnas del mapper no cubren `accepted_at` en todos los casos. */
  async function readPlanRow(
    planId: string
  ): Promise<Record<string, unknown> | null> {
    const { data, error } = await getSupabaseAdmin()
      .from('treatment_plans')
      .select('*')
      .eq('id', planId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Record<string, unknown> | null) ?? null;
  }

  async function readItemRow(
    itemId: string
  ): Promise<Record<string, unknown> | null> {
    const { data, error } = await getSupabaseAdmin()
      .from('treatment_plan_items')
      .select('*')
      .eq('id', itemId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Record<string, unknown> | null) ?? null;
  }

  async function listItemRows(
    planId: string
  ): Promise<Record<string, unknown>[]> {
    const { data, error } = await getSupabaseAdmin()
      .from('treatment_plan_items')
      .select('id, status, unit_price')
      .eq('treatment_plan_id', planId);
    if (error) throw new Error(error.message);
    return (data ?? []) as Record<string, unknown>[];
  }

  describe('listTreatmentPlans', () => {
    it('returns mapped plans sorted by created_at descending', async () => {
      const { patient, provider } = await seedPatientAndProvider();
      // Creación secuencial: el orden depende de `created_at` real.
      const first = await createTreatmentPlan(patient.id, {
        providerId: provider.id,
        name: 'Primer plan',
      });
      const second = await createTreatmentPlan(patient.id, {
        providerId: provider.id,
        name: 'Segundo plan',
      });

      const plans = await listTreatmentPlans(patient.id);

      expect(plans.map((p) => p.id)).toEqual([second.id, first.id]);
      expect(plans[0]).toMatchObject({
        id: second.id,
        patientId: patient.id,
        providerId: provider.id,
        clinicalVisitId: null,
        name: 'Segundo plan',
        status: 'draft',
        totalAmount: 0,
        acceptedAt: null,
        notes: null,
      });
      expect(plans[0].createdAt).toBeTruthy();
    });

    it('filters by patient and returns an empty array when the patient has no plans', async () => {
      const { patient, provider } = await seedPatientAndProvider();
      await createTreatmentPlan(patient.id, {
        providerId: provider.id,
        name: 'Plan A',
      });
      const other = await createPatient({
        fullName: 'Ana López',
        phoneE164: '+5215598765432',
      });

      expect(await listTreatmentPlans(other.id)).toEqual([]);
    });

    it('throws ValidationError for an invalid patient id', async () => {
      await expect(listTreatmentPlans('bad-id')).rejects.toThrow(ValidationError);
    });
  });

  describe('getTreatmentPlan', () => {
    it('returns a plan with its items ordered by creation', async () => {
      const { patient, provider, plan } = await seedDraftPlan();
      const firstItem = await createTreatmentPlanItem(plan.id, {
        description: 'Restauración',
        unitPrice: 100.5,
        quantity: 2,
        tooth: '11',
      });
      const secondItem = await createTreatmentPlanItem(plan.id, {
        description: 'Limpieza',
        unitPrice: 50,
      });

      const fetched = await getTreatmentPlan(plan.id);

      expect(fetched).toMatchObject({
        id: plan.id,
        patientId: patient.id,
        providerId: provider.id,
        status: 'draft',
        acceptedAt: null,
        notes: null,
      });
      expect(fetched.items.map((item) => item.id)).toEqual([
        firstItem.id,
        secondItem.id,
      ]);
      expect(fetched.items[0]).toMatchObject({
        description: 'Restauración',
        tooth: '11',
        quantity: 2,
        unitPrice: 100.5,
        status: 'pending',
      });
      expect(fetched.totalAmount).toBe(251);
    });

    it('throws NotFoundError when the plan does not exist', async () => {
      await expect(getTreatmentPlan(MISSING_ID)).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it('throws ValidationError for an invalid plan id', async () => {
      await expect(getTreatmentPlan('bad-id')).rejects.toThrow(ValidationError);
    });
  });

  describe('createTreatmentPlan', () => {
    it('inserts a draft plan with total 0 and returns it with items and recomputed total', async () => {
      const { patient, provider } = await seedPatientAndProvider();

      const plan = await createTreatmentPlan(patient.id, {
        providerId: provider.id,
        name: 'Plan A',
        items: [{ description: 'Restauración', unitPrice: 100.5, quantity: 3 }],
      });

      expect(plan).toMatchObject({
        patientId: patient.id,
        providerId: provider.id,
        name: 'Plan A',
        status: 'draft',
        totalAmount: 301.5,
        acceptedAt: null,
        notes: null,
      });
      expect(plan.items).toHaveLength(1);
      expect(plan.items[0]).toMatchObject({
        treatmentPlanId: plan.id,
        description: 'Restauración',
        quantity: 3,
        unitPrice: 100.5,
        status: 'pending',
      });
      // El plan nace en draft con total 0 y `recomputeTotal` lo deja consistente.
      const row = await readPlanRow(plan.id);
      expect(row?.status).toBe('draft');
      expect(Number(row?.total_amount)).toBe(301.5);
    });

    it('creates a plan without items and keeps total at 0', async () => {
      const { patient, provider } = await seedPatientAndProvider();

      const plan = await createTreatmentPlan(patient.id, {
        providerId: provider.id,
        name: 'Plan vacío',
      });

      expect(plan.totalAmount).toBe(0);
      expect(plan.items).toEqual([]);
      const row = await readPlanRow(plan.id);
      expect(Number(row?.total_amount)).toBe(0);
      expect(await listItemRows(plan.id)).toEqual([]);
    });

    it('throws ValidationError when required fields are missing', async () => {
      const { patient, provider } = await seedPatientAndProvider();

      await expect(
        createTreatmentPlan(patient.id, {
          providerId: provider.id,
          name: '',
        })
      ).rejects.toThrow(ValidationError);
      // Nada se persistió: el plan no llegó a insertarse.
      expect(await listTreatmentPlans(patient.id)).toEqual([]);
    });

    it('deletes the partially-created plan when the item insert fails', async () => {
      const { patient, provider } = await seedPatientAndProvider();

      // `quantity: 0` viola el CHECK real `treatment_plan_items_quantity_check`;
      // el mock del query builder nunca ejercitaba la constraint.
      await expect(
        createTreatmentPlan(patient.id, {
          providerId: provider.id,
          name: 'Plan con ítem inválido',
          items: [{ description: 'Restauración', unitPrice: 100, quantity: 0 }],
        })
      ).rejects.toThrow(/treatment_plan_items_quantity_check/);

      // Cleanup observable: ni plan ni ítems sobreviven.
      expect(await listTreatmentPlans(patient.id)).toEqual([]);
      const { data: items, error } = await getSupabaseAdmin()
        .from('treatment_plan_items')
        .select('id');
      expect(error).toBeNull();
      expect(items).toEqual([]);
    });

    it('aborts creation without persisting rows when item validation fails', async () => {
      const { patient, provider } = await seedPatientAndProvider();

      // `tooth: '99'` es FDI inválido: el error se lanza validando en memoria,
      // ANTES del insert de ítems (issue #123: aquí quedaba un plan huérfano
      // en draft porque el .map corría después del insert del plan y fuera
      // del try/catch del cleanup).
      await expect(
        createTreatmentPlan(patient.id, {
          providerId: provider.id,
          name: 'Plan X',
          items: [
            { description: 'Resina', tooth: '99', quantity: 1, unitPrice: 500 },
          ],
        })
      ).rejects.toThrow(ValidationError);

      // Invariante de atomicidad: si la creación falla, nada persiste.
      expect(await listTreatmentPlans(patient.id)).toEqual([]);
      const { data: items, error } = await getSupabaseAdmin()
        .from('treatment_plan_items')
        .select('id');
      expect(error).toBeNull();
      expect(items).toEqual([]);
    });
  });

  describe('updateTreatmentPlan', () => {
    it('allows draft -> presented', async () => {
      const { plan } = await seedPlanInStatus('draft');

      const updated = await updateTreatmentPlan(plan.id, {
        status: 'presented',
      });

      expect(updated.status).toBe('presented');
      expect((await readPlanRow(plan.id))?.status).toBe('presented');
    });

    it('allows presented -> accepted and populates accepted_at', async () => {
      const { plan } = await seedPlanInStatus('presented');

      const updated = await updateTreatmentPlan(plan.id, { status: 'accepted' });

      expect(updated.status).toBe('accepted');
      expect(updated.acceptedAt).toBeTruthy();
      const row = await readPlanRow(plan.id);
      expect(row?.status).toBe('accepted');
      expect(new Date(row?.accepted_at as string).toISOString()).toBe(
        new Date(updated.acceptedAt as string).toISOString()
      );
    });

    it('rejects draft -> accepted', async () => {
      const { plan } = await seedPlanInStatus('draft');

      await expect(
        updateTreatmentPlan(plan.id, { status: 'accepted' })
      ).rejects.toThrow(ValidationError);
      // Sin update en la BD: el estado sigue en draft.
      const row = await readPlanRow(plan.id);
      expect(row?.status).toBe('draft');
      expect(row?.accepted_at).toBeNull();
    });

    it('allows presented -> draft (revert)', async () => {
      const { plan } = await seedPlanInStatus('presented');

      const updated = await updateTreatmentPlan(plan.id, { status: 'draft' });

      expect(updated.status).toBe('draft');
      expect((await readPlanRow(plan.id))?.status).toBe('draft');
    });

    it('allows accepted -> in_progress', async () => {
      const { plan } = await seedPlanInStatus('accepted');

      const updated = await updateTreatmentPlan(plan.id, {
        status: 'in_progress',
      });

      expect(updated.status).toBe('in_progress');
      expect((await readPlanRow(plan.id))?.status).toBe('in_progress');
    });

    it('allows in_progress -> completed', async () => {
      const { plan } = await seedPlanInStatus('in_progress');

      const updated = await updateTreatmentPlan(plan.id, {
        status: 'completed',
      });

      expect(updated.status).toBe('completed');
      expect((await readPlanRow(plan.id))?.status).toBe('completed');
    });

    it('rejects completed -> any transition', async () => {
      const { plan } = await seedPlanInStatus('completed');

      await expect(
        updateTreatmentPlan(plan.id, { status: 'cancelled' })
      ).rejects.toThrow(ValidationError);
      expect((await readPlanRow(plan.id))?.status).toBe('completed');
    });

    it('rejects cancelled -> any transition', async () => {
      const { plan } = await seedPlanInStatus('cancelled');

      await expect(
        updateTreatmentPlan(plan.id, { status: 'draft' })
      ).rejects.toThrow(ValidationError);
      expect((await readPlanRow(plan.id))?.status).toBe('cancelled');
    });

    it('allows any non-completed state -> cancelled and preserves accepted_at', async () => {
      const { plan } = await seedPlanInStatus('accepted');
      const acceptedAt = (await readPlanRow(plan.id))?.accepted_at as string;
      expect(acceptedAt).toBeTruthy();

      const updated = await updateTreatmentPlan(plan.id, {
        status: 'cancelled',
      });

      expect(updated.status).toBe('cancelled');
      expect(updated.acceptedAt).toBeTruthy();
      // El instante de aceptación no se reescribe al cancelar.
      const row = await readPlanRow(plan.id);
      expect(row?.status).toBe('cancelled');
      expect(row?.accepted_at).toBe(acceptedAt);
    });

    it('throws NotFoundError when the plan does not exist', async () => {
      await expect(
        updateTreatmentPlan(MISSING_ID, { name: 'Fantasma' })
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rejects an invalid status value', async () => {
      await expect(
        // @ts-expect-error — deliberate invalid status for validation test
        updateTreatmentPlan(MISSING_ID, { status: 'unknown_status' })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('deleteTreatmentPlan', () => {
    it('deletes a draft plan', async () => {
      const { plan } = await seedPlanInStatus('draft');

      await deleteTreatmentPlan(plan.id);

      expect(await readPlanRow(plan.id)).toBeNull();
    });

    it('throws ConflictError when the plan is not draft', async () => {
      const { patient, plan } = await seedPlanInStatus('accepted');

      await expect(deleteTreatmentPlan(plan.id)).rejects.toBeInstanceOf(
        ConflictError
      );
      // El plan sigue vivo: el delete no se ejecutó.
      expect((await listTreatmentPlans(patient.id)).map((p) => p.id)).toEqual([
        plan.id,
      ]);
    });

    it('throws NotFoundError when the plan does not exist', async () => {
      await expect(deleteTreatmentPlan(MISSING_ID)).rejects.toBeInstanceOf(
        NotFoundError
      );
    });
  });

  describe('createTreatmentPlanItem', () => {
    it('creates an item in a draft plan and recomputes the total', async () => {
      const { plan } = await seedPlanInStatus('draft');

      const item = await createTreatmentPlanItem(plan.id, {
        description: 'Limpieza',
        unitPrice: 100,
        quantity: 2,
      });

      expect(item).toMatchObject({
        treatmentPlanId: plan.id,
        description: 'Limpieza',
        quantity: 2,
        unitPrice: 100,
        serviceId: null,
        tooth: null,
        status: 'pending',
      });
      expect(await readItemRow(item.id)).toMatchObject({
        treatment_plan_id: plan.id,
        status: 'pending',
      });
      expect(Number((await readPlanRow(plan.id))?.total_amount)).toBe(200);
    });

    it('throws ConflictError when the plan is not draft', async () => {
      const { plan } = await seedPlanInStatus('accepted');

      await expect(
        createTreatmentPlanItem(plan.id, {
          description: 'X',
          unitPrice: 100,
        })
      ).rejects.toBeInstanceOf(ConflictError);
      expect(await listItemRows(plan.id)).toEqual([]);
    });

    it('throws ValidationError when input is invalid', async () => {
      const { plan } = await seedPlanInStatus('draft');

      await expect(
        createTreatmentPlanItem(plan.id, {
          description: '',
          unitPrice: -10,
        })
      ).rejects.toThrow(ValidationError);
      expect(await listItemRows(plan.id)).toEqual([]);
    });
  });

  describe('updateTreatmentPlanItem', () => {
    it('allows updating only the item status in any plan state', async () => {
      const { plan } = await seedPlanInStatus('draft');
      const item = await createTreatmentPlanItem(plan.id, {
        description: 'Limpieza',
        unitPrice: 100,
      });
      await updateTreatmentPlan(plan.id, { status: 'presented' });
      await updateTreatmentPlan(plan.id, { status: 'accepted' });

      const updated = await updateTreatmentPlanItem(plan.id, item.id, {
        status: 'done',
      });

      expect(updated.status).toBe('done');
      expect((await readItemRow(item.id))?.status).toBe('done');
    });

    it('allows updating monetary fields in a draft plan and recomputes the total', async () => {
      const { plan } = await seedPlanInStatus('draft');
      const item = await createTreatmentPlanItem(plan.id, {
        description: 'Limpieza',
        unitPrice: 100,
      });

      const updated = await updateTreatmentPlanItem(plan.id, item.id, {
        unitPrice: 200,
      });

      expect(updated.unitPrice).toBe(200);
      expect(Number((await readItemRow(item.id))?.unit_price)).toBe(200);
      expect(Number((await readPlanRow(plan.id))?.total_amount)).toBe(200);
    });

    it('throws ConflictError when changing monetary fields in a non-draft plan', async () => {
      const { plan } = await seedPlanInStatus('draft');
      const item = await createTreatmentPlanItem(plan.id, {
        description: 'Limpieza',
        unitPrice: 100,
      });
      await updateTreatmentPlan(plan.id, { status: 'presented' });
      await updateTreatmentPlan(plan.id, { status: 'accepted' });

      await expect(
        updateTreatmentPlanItem(plan.id, item.id, { unitPrice: 200 })
      ).rejects.toBeInstanceOf(ConflictError);
      // El ítem conserva su precio original.
      expect(Number((await readItemRow(item.id))?.unit_price)).toBe(100);
    });

    it('throws NotFoundError when the item does not exist', async () => {
      const { plan } = await seedPlanInStatus('draft');

      await expect(
        updateTreatmentPlanItem(plan.id, MISSING_ID, { unitPrice: 200 })
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('deleteTreatmentPlanItem', () => {
    it('deletes an item in a draft plan and recomputes the total', async () => {
      const { plan } = await seedPlanInStatus('draft');
      const kept = await createTreatmentPlanItem(plan.id, {
        description: 'Limpieza',
        unitPrice: 100,
      });
      const removed = await createTreatmentPlanItem(plan.id, {
        description: 'Resina',
        unitPrice: 50,
      });
      expect(Number((await readPlanRow(plan.id))?.total_amount)).toBe(150);

      await deleteTreatmentPlanItem(plan.id, removed.id);

      expect(await readItemRow(removed.id)).toBeNull();
      expect(await readItemRow(kept.id)).not.toBeNull();
      expect(Number((await readPlanRow(plan.id))?.total_amount)).toBe(100);
    });

    it('throws ConflictError when the plan is not draft', async () => {
      const { plan } = await seedPlanInStatus('draft');
      const item = await createTreatmentPlanItem(plan.id, {
        description: 'Limpieza',
        unitPrice: 100,
      });
      await updateTreatmentPlan(plan.id, { status: 'presented' });
      await updateTreatmentPlan(plan.id, { status: 'accepted' });

      await expect(
        deleteTreatmentPlanItem(plan.id, item.id)
      ).rejects.toBeInstanceOf(ConflictError);
      expect(await readItemRow(item.id)).not.toBeNull();
    });
  });

  describe('sumLineTotals / money arithmetic', () => {
    it('computes 3 x 100.50 as 301.50 without float drift', () => {
      expect(sumLineTotals([{ quantity: 3, unitPrice: 100.5 }])).toBe(301.5);
    });

    it('handles multiple lines with typical float values', () => {
      expect(
        sumLineTotals([
          { quantity: 1, unitPrice: 0.1 },
          { quantity: 1, unitPrice: 0.2 },
        ])
      ).toBe(0.3);
    });

    it('returns 0 for an empty list', () => {
      expect(sumLineTotals([])).toBe(0);
    });
  });

  describe('moneyToCents', () => {
    it('rounds to the nearest cent', () => {
      expect(moneyToCents(100.505)).toBe(10051);
      expect(moneyToCents(100.504)).toBe(10050);
    });
  });
});
