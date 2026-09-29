import { describe, expect, it } from 'vitest';
import type {
  TreatmentPlan,
  TreatmentPlanInput,
  TreatmentPlanItem,
  TreatmentPlanItemInput,
  TreatmentPlanItemStatus,
  TreatmentPlanItemUpdateInput,
  TreatmentPlanStatus,
  TreatmentPlanUpdateInput,
  TreatmentPlanWithItems,
} from '../types';

describe('treatment plan types', () => {
  it('accepts a valid TreatmentPlanStatus union', () => {
    const status: TreatmentPlanStatus = 'draft';
    expect(status).toBe('draft');
  });

  it('accepts a valid TreatmentPlanItemStatus union', () => {
    const status: TreatmentPlanItemStatus = 'pending';
    expect(status).toBe('pending');
  });

  it('accepts a complete TreatmentPlan shape', () => {
    const plan: TreatmentPlan = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      patientId: '550e8400-e29b-41d4-a716-446655440001',
      providerId: '550e8400-e29b-41d4-a716-446655440002',
      clinicalVisitId: null,
      name: 'Plan inicial',
      status: 'draft',
      totalAmount: 500.0,
      acceptedAt: null,
      notes: null,
      createdAt: '2026-09-01T10:00:00Z',
      updatedAt: '2026-09-01T10:00:00Z',
    };
    expect(plan.totalAmount).toBe(500.0);
  });

  it('accepts a complete TreatmentPlanItem shape', () => {
    const item: TreatmentPlanItem = {
      id: '550e8400-e29b-41d4-a716-446655440003',
      treatmentPlanId: '550e8400-e29b-41d4-a716-446655440000',
      description: 'Resina',
      serviceId: null,
      tooth: '11',
      quantity: 1,
      unitPrice: 500.0,
      status: 'pending',
      createdAt: '2026-09-01T10:00:00Z',
      updatedAt: '2026-09-01T10:00:00Z',
    };
    expect(item.tooth).toBe('11');
  });

  it('accepts TreatmentPlanWithItems with nested items', () => {
    const planWithItems: TreatmentPlanWithItems = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      patientId: '550e8400-e29b-41d4-a716-446655440001',
      providerId: '550e8400-e29b-41d4-a716-446655440002',
      clinicalVisitId: null,
      name: 'Plan inicial',
      status: 'draft',
      totalAmount: 500.0,
      acceptedAt: null,
      notes: null,
      createdAt: '2026-09-01T10:00:00Z',
      updatedAt: '2026-09-01T10:00:00Z',
      items: [],
    };
    expect(planWithItems.items).toHaveLength(0);
  });

  it('accepts a TreatmentPlanInput with optional items', () => {
    const input: TreatmentPlanInput = {
      providerId: '550e8400-e29b-41d4-a716-446655440002',
      name: 'Plan inicial',
      notes: null,
      items: [],
    };
    expect(input.name).toBe('Plan inicial');
  });

  it('accepts a TreatmentPlanUpdateInput without totalAmount or acceptedAt', () => {
    const input: TreatmentPlanUpdateInput = {
      name: 'Plan actualizado',
      status: 'presented',
    };
    expect(input.status).toBe('presented');
  });

  it('accepts a TreatmentPlanItemInput with defaultable quantity', () => {
    const input: TreatmentPlanItemInput = {
      description: 'Resina',
      unitPrice: 500.0,
    };
    expect(input.unitPrice).toBe(500.0);
  });

  it('accepts a TreatmentPlanItemUpdateInput with all optional fields', () => {
    const input: TreatmentPlanItemUpdateInput = {
      status: 'done',
    };
    expect(input.status).toBe('done');
  });
});
