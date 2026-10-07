import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Page from './page';

const { routerRefresh } = vi.hoisted(() => ({ routerRefresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));

vi.mock('@/lib/wcc-follow-up-drafts', () => ({
  getWccFollowUpDrafts: vi.fn(),
}));

import { getWccFollowUpDrafts } from '@/lib/wcc-follow-up-drafts';
import type { WccFollowUpDraftRow } from '@/lib/wcc-follow-up-drafts';

const DRAFT_ID = '770e8400-e29b-41d4-a716-446655440000';

function draft(overrides: Partial<WccFollowUpDraftRow> = {}): WccFollowUpDraftRow {
  return {
    id: DRAFT_ID,
    patientId: '550e8400-e29b-41d4-a716-446655440000',
    patientName: 'María García',
    patientPhoneE164: '+5215512345678',
    body: 'Hola María, notamos que no pudimos atenderte.',
    templateName: 'seguimiento_paciente',
    status: 'draft',
    errorMessage: null,
    providerMessageId: null,
    approvedAt: null,
    editedBy: null,
    editedAt: null,
    sentAt: null,
    createdAt: '2026-10-03T17:00:00.000Z',
    updatedAt: '2026-10-03T17:00:00.000Z',
    ...overrides,
  };
}

function setupFetch(status = 200) {
  const fetchMock = vi.fn(async () =>
    Response.json({ draft: {} }, { status })
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function patchCalls(fetchMock: ReturnType<typeof setupFetch>) {
  return fetchMock.mock.calls.filter(
    ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH'
  );
}

function buildQueue(
  drafts: WccFollowUpDraftRow[] = [],
  overrides: Record<string, unknown> = {}
) {
  return {
    isSupabaseConfigured: true,
    isConfiguredButUnavailable: false,
    drafts,
    ...overrides,
  };
}

describe('/whatsapp-command-center/follow-up-drafts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    routerRefresh.mockReset();
    setupFetch();
  });

  it('lists drafts with the patient name', async () => {
    vi.mocked(getWccFollowUpDrafts).mockResolvedValue(buildQueue([draft()]) as never);
    render(await Page());
    expect(screen.getByText('María García')).toBeInTheDocument();
  });

  it('offers Aprobar and Rechazar for a draft and no Enviar', async () => {
    vi.mocked(getWccFollowUpDrafts).mockResolvedValue(buildQueue([draft()]) as never);
    render(await Page());
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar' })).not.toBeInTheDocument();
  });

  it('offers Enviar for an approved draft and no Aprobar/Rechazar', async () => {
    vi.mocked(getWccFollowUpDrafts).mockResolvedValue(
      buildQueue([draft({ status: 'approved' })]) as never
    );
    render(await Page());
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
  });

  it('shows no actions for sent and rejected drafts', async () => {
    vi.mocked(getWccFollowUpDrafts).mockResolvedValue(
      buildQueue([
        draft({ status: 'sent' }),
        draft({ id: 'draft-2', status: 'rejected' }),
      ]) as never
    );
    render(await Page());
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar' })).not.toBeInTheDocument();
  });

  it('shows the sent_failed error message', async () => {
    vi.mocked(getWccFollowUpDrafts).mockResolvedValue(
      buildQueue([
        draft({
          status: 'sent_failed',
          errorMessage: 'WhatsApp Cloud API request failed with status 500.',
        }),
      ]) as never
    );
    render(await Page());
    const article = screen.getByText('María García').closest('article') as HTMLElement;
    expect(
      within(article).getByText(/status 500/)
    ).toBeInTheDocument();
  });

  it('renders an editable textarea with the body and the not-sent notice in draft', async () => {
    vi.mocked(getWccFollowUpDrafts).mockResolvedValue(buildQueue([draft()]) as never);
    render(await Page());

    const textarea = screen.getByRole('textbox', { name: /texto del borrador/i });
    expect(textarea).toHaveValue('Hola María, notamos que no pudimos atenderte.');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
    expect(screen.getByText(/guardar no envía nada/i)).toBeInTheDocument();
  });

  it('saves the edited body with PATCH { action: edit, body }', async () => {
    const fetchMock = setupFetch();
    vi.mocked(getWccFollowUpDrafts).mockResolvedValue(buildQueue([draft()]) as never);
    render(await Page());

    const textarea = screen.getByRole('textbox', { name: /texto del borrador/i });
    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'Hola María, te esperamos pronto.');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      const patches = patchCalls(fetchMock);
      expect(patches).toHaveLength(1);
      expect(String(patches[0][0])).toBe(`/api/admin/follow-up/drafts/${DRAFT_ID}`);
      expect(JSON.parse((patches[0][1] as RequestInit).body as string)).toEqual({
        action: 'edit',
        body: 'Hola María, te esperamos pronto.',
      });
    });
  });

  it('surfaces an error and does not refresh when saving is rejected', async () => {
    const fetchMock = setupFetch(409);
    vi.mocked(getWccFollowUpDrafts).mockResolvedValue(buildQueue([draft()]) as never);
    render(await Page());

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(screen.getByText(/no se pudo guardar/i)).toBeInTheDocument()
    );
    expect(patchCalls(fetchMock)).toHaveLength(1);
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it('does not render the editor for approved and sent drafts', async () => {
    vi.mocked(getWccFollowUpDrafts).mockResolvedValue(
      buildQueue([
        draft({ status: 'approved' }),
        draft({ id: 'draft-2', status: 'sent' }),
      ]) as never
    );
    render(await Page());

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Guardar cambios' })
    ).not.toBeInTheDocument();
  });

  it('shows "Editado" when the draft has edit audit data', async () => {
    vi.mocked(getWccFollowUpDrafts).mockResolvedValue(
      buildQueue([
        draft({ editedBy: 'user-1', editedAt: '2026-10-03T18:30:00.000Z' }),
      ]) as never
    );
    render(await Page());

    expect(screen.getByText(/Editado/)).toBeInTheDocument();
  });

  it('shows an empty state when there are no drafts', async () => {
    vi.mocked(getWccFollowUpDrafts).mockResolvedValue(buildQueue([]) as never);
    render(await Page());
    expect(screen.getByText(/Sin borradores/i)).toBeInTheDocument();
  });

  it('warns when the database is configured but unavailable', async () => {
    vi.mocked(getWccFollowUpDrafts).mockResolvedValue(
      buildQueue([], { isConfiguredButUnavailable: true }) as never
    );
    render(await Page());
    expect(screen.getByText(/No se pudieron leer los borradores/i)).toBeInTheDocument();
  });
});
