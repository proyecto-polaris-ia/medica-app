import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TreatmentPlansTab } from './TreatmentPlansTab';
import type { TreatmentPlan, TreatmentPlanWithItems } from '@/lib/admin/types';

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PROVIDER_ID = '660e8400-e29b-41d4-a716-446655440000';
const PLAN_ID = '770e8400-e29b-41d4-a716-446655440000';
const VISIT_ID = '880e8400-e29b-41d4-a716-446655440000';
const SERVICE_ID = '990e8400-e29b-41d4-a716-446655440000';

const PROVIDER = { id: PROVIDER_ID, name: 'Dra. Ana', color: null, createdAt: '', updatedAt: '' };

const BASE_PLAN: TreatmentPlan = {
  id: PLAN_ID,
  patientId: PATIENT_ID,
  providerId: PROVIDER_ID,
  clinicalVisitId: null,
  name: 'Plan inicial',
  status: 'draft',
  totalAmount: 1500,
  acceptedAt: null,
  notes: null,
  createdAt: '2026-09-10T10:00:00Z',
  updatedAt: '2026-09-10T10:00:00Z',
};

const PLAN_WITH_ITEMS: TreatmentPlanWithItems = {
  ...BASE_PLAN,
  items: [
    {
      id: 'item-1',
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

function buildFetchMock(
  overrides: { providers?: unknown[]; treatmentPlansById?: Record<string, TreatmentPlanWithItems> } = {}
) {
  const providers = overrides.providers ?? [PROVIDER];
  const treatmentPlansById = overrides.treatmentPlansById ?? { [PLAN_ID]: PLAN_WITH_ITEMS };
  const detailPrefix = `/api/admin/patients/${PATIENT_ID}/treatment-plans/`;

  return vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
    const urlString = url.toString();

    if (urlString === '/api/admin/providers' && !init?.method) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ providers }) });
    }

    if (urlString.startsWith(detailPrefix)) {
      const planId = urlString.slice(detailPrefix.length);

      if (!init?.method) {
        const treatmentPlan = treatmentPlansById[planId];
        if (treatmentPlan) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ treatmentPlan }) });
        }
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
      }

      if (init.method === 'DELETE') {
        return Promise.resolve({ ok: true, status: 204 });
      }
    }

    return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('Not found') });
  });
}

describe('TreatmentPlansTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.confirm = vi.fn(() => true);
    window.alert = vi.fn();
    global.fetch = buildFetchMock();
  });

  it('renders loading state', async () => {
    render(
      <TreatmentPlansTab
        patientId={PATIENT_ID}
        treatmentPlans={[]}
        onPlansChanged={vi.fn()}
        loading
        error={null}
      />
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByText('Cargando planes de tratamiento...')).toBeInTheDocument();
  });

  it('renders error state with retry', async () => {
    const onPlansChanged = vi.fn();
    render(
      <TreatmentPlansTab
        patientId={PATIENT_ID}
        treatmentPlans={[]}
        onPlansChanged={onPlansChanged}
        loading={false}
        error="Error de carga"
      />
    );

    expect(screen.getByText('Error de carga')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /intentar de nuevo/i }));

    expect(onPlansChanged).toHaveBeenCalledTimes(1);
  });

  it('renders empty state when there are no plans', async () => {
    render(
      <TreatmentPlansTab
        patientId={PATIENT_ID}
        treatmentPlans={[]}
        onPlansChanged={vi.fn()}
        loading={false}
        error={null}
      />
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByText('No hay planes de tratamiento')).toBeInTheDocument();
  });

  it('renders plan status badge, provider name, total and date', async () => {
    global.fetch = buildFetchMock();
    render(
      <TreatmentPlansTab
        patientId={PATIENT_ID}
        treatmentPlans={[BASE_PLAN]}
        onPlansChanged={vi.fn()}
        loading={false}
        error={null}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Dra. Ana')).toBeInTheDocument();
    });

    expect(screen.getByText('Plan inicial')).toBeInTheDocument();
    expect(screen.getByText('Borrador')).toBeInTheDocument();
    expect(screen.getByText(/\$1,500\.00/)).toBeInTheDocument();
    expect(screen.getByText('10 sep 2026')).toBeInTheDocument();
  });

  it('shows edit and delete buttons only for draft plans', async () => {
    global.fetch = buildFetchMock();
    const presentedPlan: TreatmentPlan = { ...BASE_PLAN, id: 'plan-2', name: 'Plan presentado', status: 'presented' };
    render(
      <TreatmentPlansTab
        patientId={PATIENT_ID}
        treatmentPlans={[BASE_PLAN, presentedPlan]}
        onPlansChanged={vi.fn()}
        loading={false}
        error={null}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Plan presentado')).toBeInTheDocument();
    });

    const draftCard = screen.getByText('Plan inicial').closest('article') as HTMLElement;
    const presentedCard = screen.getByText('Plan presentado').closest('article') as HTMLElement;

    expect(draftCard).toBeInTheDocument();
    expect(within(draftCard).getByRole('button', { name: /editar/i })).toBeInTheDocument();
    expect(within(draftCard).getByRole('button', { name: /eliminar/i })).toBeInTheDocument();

    expect(presentedCard).toBeInTheDocument();
    expect(within(presentedCard).queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();
    expect(within(presentedCard).queryByRole('button', { name: /eliminar/i })).not.toBeInTheDocument();
  });

  it('opens the form in create mode when Nuevo plan is clicked', async () => {
    global.fetch = buildFetchMock();
    const user = userEvent.setup();
    render(
      <TreatmentPlansTab
        patientId={PATIENT_ID}
        treatmentPlans={[]}
        onPlansChanged={vi.fn()}
        loading={false}
        error={null}
      />
    );

    await user.click(screen.getByRole('button', { name: /nuevo plan/i }));

    await waitFor(() => {
      expect(screen.getByText('Nuevo plan de tratamiento')).toBeInTheDocument();
    });
  });

  it('opens the form in edit mode when a draft plan edit button is clicked', async () => {
    global.fetch = buildFetchMock();
    const user = userEvent.setup();
    render(
      <TreatmentPlansTab
        patientId={PATIENT_ID}
        treatmentPlans={[BASE_PLAN]}
        onPlansChanged={vi.fn()}
        loading={false}
        error={null}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /editar/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /editar/i }));

    await waitFor(() => {
      expect(screen.getByText('Editar plan de tratamiento')).toBeInTheDocument();
    });
  });

  it('opens the detail modal for the clicked plan card', async () => {
    const fetchMock = buildFetchMock();
    global.fetch = fetchMock;
    const user = userEvent.setup();

    render(
      <TreatmentPlansTab
        patientId={PATIENT_ID}
        treatmentPlans={[BASE_PLAN]}
        onPlansChanged={vi.fn()}
        loading={false}
        error={null}
      />
    );

    const card = await screen.findByRole('button', { name: /ver detalle del plan plan inicial/i });
    await user.click(within(card).getByText('Plan inicial'));

    expect(await screen.findByText('Limpieza')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/patients/${PATIENT_ID}/treatment-plans/${PLAN_ID}`
    );
  });

  it('opens the correct plan detail when several plans are listed', async () => {
    const presentedPlan: TreatmentPlan = {
      ...BASE_PLAN,
      id: 'plan-2',
      name: 'Plan presentado',
      status: 'presented',
    };
    const presentedPlanWithItems: TreatmentPlanWithItems = {
      ...presentedPlan,
      items: [{ ...PLAN_WITH_ITEMS.items[0], id: 'item-2', treatmentPlanId: 'plan-2', description: 'Ortodoncia' }],
    };

    const fetchMock = buildFetchMock({
      treatmentPlansById: { [PLAN_ID]: PLAN_WITH_ITEMS, 'plan-2': presentedPlanWithItems },
    });
    global.fetch = fetchMock;
    const user = userEvent.setup();

    render(
      <TreatmentPlansTab
        patientId={PATIENT_ID}
        treatmentPlans={[BASE_PLAN, presentedPlan]}
        onPlansChanged={vi.fn()}
        loading={false}
        error={null}
      />
    );

    const presentedCard = await screen.findByRole('button', {
      name: /ver detalle del plan plan presentado/i,
    });
    await user.click(within(presentedCard).getByText('Plan presentado'));

    expect(await screen.findByText('Ortodoncia')).toBeInTheDocument();
    expect(screen.queryByText('Limpieza')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/patients/${PATIENT_ID}/treatment-plans/plan-2`
    );
  });

  it('opens the detail modal from the Ver detalle button with the keyboard', async () => {
    global.fetch = buildFetchMock();
    const user = userEvent.setup();

    render(
      <TreatmentPlansTab
        patientId={PATIENT_ID}
        treatmentPlans={[BASE_PLAN]}
        onPlansChanged={vi.fn()}
        loading={false}
        error={null}
      />
    );

    const detailButton = await screen.findByRole('button', { name: 'Ver detalle' });
    detailButton.focus();
    expect(detailButton).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(await screen.findByText('Limpieza')).toBeInTheDocument();
  });

  it('opens the edit form from the detail view of a draft plan and closes the detail', async () => {
    global.fetch = buildFetchMock();
    const user = userEvent.setup();

    render(
      <TreatmentPlansTab
        patientId={PATIENT_ID}
        treatmentPlans={[BASE_PLAN]}
        onPlansChanged={vi.fn()}
        loading={false}
        error={null}
      />
    );

    await user.click(await screen.findByRole('button', { name: 'Ver detalle' }));
    await screen.findByText('Limpieza');

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Editar' }));

    expect(await screen.findByText('Editar plan de tratamiento')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Limpieza')).not.toBeInTheDocument();
  });

  it('keeps a non-draft plan read-only in the card and in the detail view', async () => {
    const acceptedPlan: TreatmentPlan = {
      ...BASE_PLAN,
      name: 'Plan aceptado',
      status: 'accepted',
    };
    const acceptedPlanWithItems: TreatmentPlanWithItems = { ...PLAN_WITH_ITEMS, ...acceptedPlan };

    global.fetch = buildFetchMock({ treatmentPlansById: { [PLAN_ID]: acceptedPlanWithItems } });
    const user = userEvent.setup();

    render(
      <TreatmentPlansTab
        patientId={PATIENT_ID}
        treatmentPlans={[acceptedPlan]}
        onPlansChanged={vi.fn()}
        loading={false}
        error={null}
      />
    );

    const card = await screen.findByRole('button', {
      name: /ver detalle del plan plan aceptado/i,
    });
    expect(within(card).queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /eliminar/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ver detalle' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('keeps the plans list intact after closing the detail view', async () => {
    global.fetch = buildFetchMock();
    const user = userEvent.setup();

    render(
      <TreatmentPlansTab
        patientId={PATIENT_ID}
        treatmentPlans={[BASE_PLAN]}
        onPlansChanged={vi.fn()}
        loading={false}
        error={null}
      />
    );

    await user.click(await screen.findByRole('button', { name: 'Ver detalle' }));
    await screen.findByText('Limpieza');

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Plan inicial')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver detalle' })).toBeInTheDocument();
  });

  it('deletes a draft plan and refreshes the list', async () => {
    const fetchMock = buildFetchMock();
    global.fetch = fetchMock;
    const onPlansChanged = vi.fn();
    const user = userEvent.setup();

    render(
      <TreatmentPlansTab
        patientId={PATIENT_ID}
        treatmentPlans={[BASE_PLAN]}
        onPlansChanged={onPlansChanged}
        loading={false}
        error={null}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /eliminar/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /eliminar/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/admin/patients/${PATIENT_ID}/treatment-plans/${PLAN_ID}`,
        { method: 'DELETE' }
      );
    });

    expect(onPlansChanged).toHaveBeenCalledTimes(1);
  });
});
