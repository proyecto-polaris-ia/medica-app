import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FollowUpList } from '../FollowUpList';
import type { FollowUpCase } from '@/lib/admin/follow-up/types';

const MARIA_ID = '550e8400-e29b-41d4-a716-446655440000';
const JUAN_ID = '550e8400-e29b-41d4-a716-446655440001';

const CASES: FollowUpCase[] = [
  {
    patientId: MARIA_ID,
    patientName: 'María García',
    patientPhoneE164: '+5215512345678',
    reason: 'no_show',
    reasonLabel: 'Cita no atendida',
    reasonDate: '2026-09-01T18:00:00.000Z',
    roundDate: '2026-10-03',
    sourceAppointmentId: '550e8400-e29b-41d4-a716-446655440010',
    sourcePlanId: null,
  },
  {
    patientId: JUAN_ID,
    patientName: 'Juan Pérez',
    patientPhoneE164: '+5215587654321',
    reason: 'inactive',
    reasonLabel: 'Paciente inactivo',
    // 2026-09-10 05:00 UTC = 2026-09-09 23:00 en America/Mexico_City.
    reasonDate: '2026-09-10T05:00:00.000Z',
    roundDate: '2026-10-03',
    sourceAppointmentId: null,
    sourcePlanId: null,
  },
];

let listCases: FollowUpCase[] = CASES;

function setupFetch() {
  listCases = CASES;
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const path = String(url);
    if (path === '/api/admin/follow-up') {
      return Response.json({ cases: listCases, roundDate: '2026-10-03' });
    }
    if (path === '/api/admin/follow-up/contacts') {
      void init;
      return Response.json({ contact: {} }, { status: 201 });
    }
    return new Response('Not found', { status: 404 });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function cardFor(name: string): HTMLElement {
  return screen.getByText(name).closest('article') as HTMLElement;
}

function postCalls(fetchMock: ReturnType<typeof setupFetch>) {
  return fetchMock.mock.calls.filter(
    ([, init]) =>
      (init as RequestInit | undefined)?.method === 'POST'
  );
}

describe('FollowUpList', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setupFetch();
  });

  it('groups cases by reason', async () => {
    render(<FollowUpList />);

    expect(
      await screen.findByRole('heading', { name: 'Cita no atendida' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Paciente inactivo' })
    ).toBeInTheDocument();
  });

  it('shows name, phone and the reason date formatted in America/Mexico_City', async () => {
    render(<FollowUpList />);

    await screen.findByText('María García');
    const maria = cardFor('María García');
    expect(within(maria).getByText('+5215512345678')).toBeInTheDocument();
    expect(within(maria).getByText('Cita no atendida')).toBeInTheDocument();
    expect(maria.querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-09-01T18:00:00.000Z'
    );

    const juan = cardFor('Juan Pérez');
    const timeText = juan.querySelector('time')?.textContent ?? '';
    // La fecha debe expresarse en America/Mexico_City (día 9, no 10).
    expect(timeText).toMatch(/9/);
    expect(timeText).not.toMatch(/10/);
  });

  it('marks a patient as contacted via POST and reloads the list', async () => {
    const fetchMock = setupFetch();
    render(<FollowUpList />);

    await screen.findByText('María García');
    const maria = cardFor('María García');
    await userEvent.click(
      within(maria).getByRole('button', { name: 'Marcar contactado' })
    );

    await waitFor(() => {
      const posts = postCalls(fetchMock);
      expect(posts).toHaveLength(1);
      expect(JSON.parse((posts[0][1] as RequestInit).body as string)).toEqual({
        patientId: MARIA_ID,
        status: 'contacted',
      });
    });

    await waitFor(() => {
      const gets = fetchMock.mock.calls.filter(
        ([url]) => String(url) === '/api/admin/follow-up'
      );
      expect(gets).toHaveLength(2);
    });
  });

  it('dismisses a patient via POST', async () => {
    const fetchMock = setupFetch();
    render(<FollowUpList />);

    await screen.findByText('María García');
    const maria = cardFor('María García');
    await userEvent.click(
      within(maria).getByRole('button', { name: 'Descartar' })
    );

    await waitFor(() => {
      const posts = postCalls(fetchMock);
      expect(posts).toHaveLength(1);
      expect(JSON.parse((posts[0][1] as RequestInit).body as string)).toEqual({
        patientId: MARIA_ID,
        status: 'dismissed',
      });
    });
  });

  it('links "Agendar cita" to the wizard and only navigates', async () => {
    const fetchMock = setupFetch();
    render(<FollowUpList />);

    await screen.findByText('María García');
    const maria = cardFor('María García');
    const link = within(maria).getByRole('link', { name: 'Agendar cita' });

    expect(link).toHaveAttribute(
      'href',
      `/appointments/new?patientId=${MARIA_ID}`
    );
    expect(postCalls(fetchMock)).toHaveLength(0);
  });

  it('shows the Phase 3 draft action', async () => {
    render(<FollowUpList />);

    await screen.findByText('María García');
    const maria = cardFor('María García');
    expect(
      within(maria).getByRole('button', { name: 'Generar borrador' })
    ).toBeInTheDocument();
  });

  it('removes a contacted patient once the list reloads', async () => {
    render(<FollowUpList />);

    await screen.findByText('María García');
    const maria = cardFor('María García');
    listCases = CASES.filter((item) => item.patientId !== MARIA_ID);
    await userEvent.click(
      within(maria).getByRole('button', { name: 'Marcar contactado' })
    );

    await waitFor(() => {
      expect(screen.queryByText('María García')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
  });
});
