import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TreatmentPlanForm } from './TreatmentPlanForm';
import type { TreatmentPlanWithItems } from '@/lib/admin/types';

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PROVIDER_ID = '660e8400-e29b-41d4-a716-446655440000';
const VISIT_ID = '880e8400-e29b-41d4-a716-446655440000';
const SERVICE_ID = '990e8400-e29b-41d4-a716-446655440000';
const PLAN_ID = '770e8400-e29b-41d4-a716-446655440000';
const ITEM_ID = 'item-1';

const PROVIDER = { id: PROVIDER_ID, name: 'Dra. Ana', color: null, createdAt: '', updatedAt: '' };
const SERVICE = { id: SERVICE_ID, name: 'Limpieza', durationMinutes: 45, createdAt: '', updatedAt: '' };
const VISIT = {
  id: VISIT_ID,
  patientId: PATIENT_ID,
  appointmentId: null,
  providerId: null,
  subjective: 'Consulta inicial',
  objective: null,
  assessment: null,
  plan: null,
  treatment: null,
  notes: null,
  createdAt: '2026-09-10T10:00:00Z',
  updatedAt: '2026-09-10T10:00:00Z',
};

const PLAN_WITH_ITEMS: TreatmentPlanWithItems = {
  id: PLAN_ID,
  patientId: PATIENT_ID,
  providerId: PROVIDER_ID,
  clinicalVisitId: VISIT_ID,
  name: 'Plan inicial',
  status: 'draft',
  totalAmount: 1500,
  acceptedAt: null,
  notes: 'Notas del plan',
  createdAt: '2026-09-10T10:00:00Z',
  updatedAt: '2026-09-10T10:00:00Z',
  items: [
    {
      id: ITEM_ID,
      treatmentPlanId: PLAN_ID,
      description: 'Limpieza',
      serviceId: SERVICE_ID,
      tooth: '16',
      quantity: 1,
      unitPrice: 1500,
      status: 'pending',
      createdAt: '2026-09-10T10:00:00Z',
      updatedAt: '2026-09-10T10:00:00Z',
    },
  ],
};

function buildFetchMock(overrides: {
  createResponse?: TreatmentPlanWithItems;
  patchResponse?: TreatmentPlanWithItems;
} = {}) {
  return vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
    const urlString = url.toString();

    if (urlString === '/api/admin/providers' && !init?.method) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ providers: [PROVIDER] }) });
    }

    if (urlString === '/api/admin/services' && !init?.method) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ services: [SERVICE] }) });
    }

    if (urlString === `/api/admin/patients/${PATIENT_ID}/clinical-visits` && !init?.method) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ clinicalVisits: [VISIT] }) });
    }

    if (urlString === `/api/admin/patients/${PATIENT_ID}/treatment-plans` && init?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ treatmentPlan: overrides.createResponse ?? PLAN_WITH_ITEMS }),
      });
    }

    if (urlString === `/api/admin/patients/${PATIENT_ID}/treatment-plans/${PLAN_ID}` && init?.method === 'PATCH') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ treatmentPlan: overrides.patchResponse ?? PLAN_WITH_ITEMS }),
      });
    }

    if (urlString === `/api/admin/patients/${PATIENT_ID}/treatment-plans/${PLAN_ID}/items` && init?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ item: { id: 'new-item', treatmentPlanId: PLAN_ID, description: 'Nuevo ítem', serviceId: null, tooth: null, quantity: 1, unitPrice: 0, status: 'pending', createdAt: '', updatedAt: '' } }),
      });
    }

    if (urlString === `/api/admin/patients/${PATIENT_ID}/treatment-plans/${PLAN_ID}/items/${ITEM_ID}` && init?.method === 'PATCH') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ item: PLAN_WITH_ITEMS.items[0] }) });
    }

    if (urlString === `/api/admin/patients/${PATIENT_ID}/treatment-plans/${PLAN_ID}/items/${ITEM_ID}` && init?.method === 'DELETE') {
      return Promise.resolve({ ok: true, status: 204 });
    }

    return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('Not found') });
  });
}

describe('TreatmentPlanForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders create mode with empty fields and one empty item row', async () => {
    global.fetch = buildFetchMock();
    render(
      <TreatmentPlanForm
        patientId={PATIENT_ID}
        plan={null}
        isOpen
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Nuevo plan de tratamiento')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Nombre del plan')).toHaveValue('');
    expect(screen.getByLabelText('Dentista responsable')).toHaveValue('');
    expect(screen.getByLabelText('Notas')).toHaveValue('');
    expect(screen.getAllByPlaceholderText('Descripción').length).toBeGreaterThanOrEqual(1);
  });

  it('renders edit mode with plan data', async () => {
    global.fetch = buildFetchMock();
    render(
      <TreatmentPlanForm
        patientId={PATIENT_ID}
        plan={PLAN_WITH_ITEMS}
        isOpen
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Editar plan de tratamiento')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Nombre del plan')).toHaveValue('Plan inicial');
    expect(screen.getByLabelText('Notas')).toHaveValue('Notas del plan');
    expect(screen.getByPlaceholderText('Descripción')).toHaveValue('Limpieza');
    expect(screen.getByPlaceholderText('11')).toHaveValue('16');
    expect(screen.getAllByPlaceholderText('0.00')[0]).toHaveValue(1500);
  });

  it('shows read-only mode when plan status is not draft', async () => {
    global.fetch = buildFetchMock();
    render(
      <TreatmentPlanForm
        patientId={PATIENT_ID}
        plan={{ ...PLAN_WITH_ITEMS, status: 'presented' }}
        isOpen
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Ver plan de tratamiento')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Nombre del plan')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /agregar ítem/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /guardar/i })).not.toBeInTheDocument();
  });

  it('updates live total when item quantity or unit price changes', async () => {
    global.fetch = buildFetchMock();
    const user = userEvent.setup();
    render(
      <TreatmentPlanForm
        patientId={PATIENT_ID}
        plan={null}
        isOpen
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Nuevo plan de tratamiento')).toBeInTheDocument();
    });

    const descriptionInput = screen.getByPlaceholderText('Descripción');
    await user.type(descriptionInput, 'Limpieza');

    const unitPriceInput = screen.getByPlaceholderText('0.00') as HTMLInputElement;
    await user.clear(unitPriceInput);
    await user.type(unitPriceInput, '500');

    const quantityInput = screen.getByPlaceholderText('1') as HTMLInputElement;
    await user.clear(quantityInput);
    await user.type(quantityInput, '3');

    await waitFor(() => {
      expect(screen.getByText(/Total:\s*\$1,500\.00/)).toBeInTheDocument();
    });
  });

  it('submits POST with header and items in create mode', async () => {
    const fetchMock = buildFetchMock();
    global.fetch = fetchMock;
    const onSaved = vi.fn();
    const user = userEvent.setup();

    render(
      <TreatmentPlanForm
        patientId={PATIENT_ID}
        plan={null}
        isOpen
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Nuevo plan de tratamiento')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Nombre del plan'), 'Plan de limpieza');
    await user.selectOptions(screen.getByLabelText('Dentista responsable'), PROVIDER_ID);

    await user.type(screen.getByPlaceholderText('Descripción'), 'Limpieza');
    const unitPriceInput = screen.getByPlaceholderText('0.00') as HTMLInputElement;
    await user.clear(unitPriceInput);
    await user.type(unitPriceInput, '1200');

    await user.click(screen.getByRole('button', { name: /guardar plan/i }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === `/api/admin/patients/${PATIENT_ID}/treatment-plans` && init?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(postCall![1].body as string);
      expect(body).toMatchObject({
        name: 'Plan de limpieza',
        providerId: PROVIDER_ID,
        items: [{ description: 'Limpieza', unitPrice: 1200, quantity: 1 }],
      });
    });

    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('submits PATCH header and item mutations in edit mode', async () => {
    const fetchMock = buildFetchMock();
    global.fetch = fetchMock;
    const onSaved = vi.fn();
    const user = userEvent.setup();

    render(
      <TreatmentPlanForm
        patientId={PATIENT_ID}
        plan={PLAN_WITH_ITEMS}
        isOpen
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Editar plan de tratamiento')).toBeInTheDocument();
    });

    await user.clear(screen.getByLabelText('Nombre del plan'));
    await user.type(screen.getByLabelText('Nombre del plan'), 'Plan actualizado');

    const quantityInput = screen.getByPlaceholderText('1') as HTMLInputElement;
    await user.clear(quantityInput);
    await user.type(quantityInput, '2');

    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === `/api/admin/patients/${PATIENT_ID}/treatment-plans/${PLAN_ID}` &&
          init?.method === 'PATCH'
      );
      expect(patchCall).toBeDefined();
      expect(JSON.parse(patchCall![1].body as string)).toMatchObject({ name: 'Plan actualizado' });
    });

    await waitFor(() => {
      const itemPatchCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === `/api/admin/patients/${PATIENT_ID}/treatment-plans/${PLAN_ID}/items/${ITEM_ID}` &&
          init?.method === 'PATCH'
      );
      expect(itemPatchCall).toBeDefined();
      expect(JSON.parse(itemPatchCall![1].body as string)).toMatchObject({ quantity: 2 });
    });

    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('calls PATCH status presented when Presentar is clicked', async () => {
    const fetchMock = buildFetchMock();
    global.fetch = fetchMock;
    const onSaved = vi.fn();
    const user = userEvent.setup();

    render(
      <TreatmentPlanForm
        patientId={PATIENT_ID}
        plan={PLAN_WITH_ITEMS}
        isOpen
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Editar plan de tratamiento')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /presentar/i }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === `/api/admin/patients/${PATIENT_ID}/treatment-plans/${PLAN_ID}` &&
          init?.method === 'PATCH'
      );
      expect(patchCall).toBeDefined();
      expect(JSON.parse(patchCall![1].body as string)).toMatchObject({ status: 'presented' });
    });

    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
