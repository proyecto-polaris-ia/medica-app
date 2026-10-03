import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import Page from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('@/lib/wcc-follow-up-drafts', () => ({
  getWccFollowUpDrafts: vi.fn(),
}));

import { getWccFollowUpDrafts } from '@/lib/wcc-follow-up-drafts';
import type { WccFollowUpDraftRow } from '@/lib/wcc-follow-up-drafts';

function draft(overrides: Partial<WccFollowUpDraftRow> = {}): WccFollowUpDraftRow {
  return {
    id: '770e8400-e29b-41d4-a716-446655440000',
    patientId: '550e8400-e29b-41d4-a716-446655440000',
    patientName: 'María García',
    patientPhoneE164: '+5215512345678',
    body: 'Hola María, notamos que no pudimos atenderte.',
    templateName: 'seguimiento_paciente',
    status: 'draft',
    errorMessage: null,
    providerMessageId: null,
    approvedAt: null,
    sentAt: null,
    createdAt: '2026-10-03T17:00:00.000Z',
    updatedAt: '2026-10-03T17:00:00.000Z',
    ...overrides,
  };
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
