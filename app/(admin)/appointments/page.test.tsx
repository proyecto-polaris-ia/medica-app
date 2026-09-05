import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppointmentsPage from './page';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const PROVIDER_ID = '550e8400-e29b-41d4-a716-446655440001';
const SERVICE_ID = '550e8400-e29b-41d4-a716-446655440002';
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440003';
const APPOINTMENT_ID = '550e8400-e29b-41d4-a716-446655440004';

const BASE_APPOINTMENT = {
  id: APPOINTMENT_ID,
  patientId: PATIENT_ID,
  serviceId: SERVICE_ID,
  providerId: PROVIDER_ID,
  startAt: '2026-09-10T14:00:00.000Z',
  endAt: '2026-09-10T14:30:00.000Z',
  status: 'confirmed',
  notes: null,
};

const LONG_NOTES = 'a'.repeat(120);
function truncateNotes(notes: string): string {
  return notes.length > 80 ? `${notes.slice(0, 80)}…` : notes;
}

function buildFetchMock() {
  return vi.fn().mockImplementation((url: string) => {
    if (url === '/api/admin/appointments' || url.startsWith('/api/admin/appointments?')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ appointments: [BASE_APPOINTMENT] }),
      });
    }
    if (url === '/api/admin/patients') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ patients: [{ id: PATIENT_ID, fullName: 'Paciente A' }] }),
      });
    }
    if (url === '/api/admin/providers') {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            providers: [{ id: PROVIDER_ID, name: 'Dra. Ana', color: '#1f77b4' }],
          }),
      });
    }
    if (url === '/api/admin/services') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ services: [{ id: SERVICE_ID, name: 'Limpieza' }] }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

describe('/appointments integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('switches to calendar view and fetches a date range', async () => {
    const fetchMock = buildFetchMock();
    global.fetch = fetchMock;
    const user = userEvent.setup();

    render(<AppointmentsPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Paciente A').length).toBeGreaterThan(0);
    });

    await user.click(screen.getByRole('button', { name: /Calendario/ }));

    await waitFor(() => {
      expect(screen.getAllByTestId('weekday-label')).toHaveLength(7);
    }, { timeout: 10000 });

    const rangeCall = fetchMock.mock.calls.find((call) =>
      (call[0] as string).startsWith('/api/admin/appointments?')
    );
    expect(rangeCall).toBeDefined();
    expect(rangeCall![0]).toContain('start=');
    expect(rangeCall![0]).toContain('end=');
  });

  it('opens the edit flow when a calendar block is clicked', async () => {
    const fetchMock = buildFetchMock();
    global.fetch = fetchMock;
    const user = userEvent.setup();

    render(<AppointmentsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Calendario/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Calendario/ }));

    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      const blockButton = buttons.find((b) =>
        b.getAttribute('aria-label')?.includes('Limpieza')
      );
      expect(blockButton).toBeTruthy();
    }, { timeout: 10000 });

    const buttons = screen.getAllByRole('button');
    const blockButton = buttons.find((b) =>
      b.getAttribute('aria-label')?.includes('Limpieza')
    );
    await user.click(blockButton!);

    expect(screen.getByText('Editar cita')).toBeInTheDocument();
  }, 15000);

  it('renders the Notas column with a truncated preview', async () => {
    const fetchMock = buildFetchMock();
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/admin/appointments') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            appointments: [{ ...BASE_APPOINTMENT, notes: LONG_NOTES }],
          }),
        });
      }
      return buildFetchMock()(url);
    });
    global.fetch = fetchMock;

    render(<AppointmentsPage />);

    await waitFor(() => {
      expect(screen.getByText(truncateNotes(LONG_NOTES))).toBeInTheDocument();
    });
  });

  it('renders an em dash when notes are empty', async () => {
    const fetchMock = buildFetchMock();
    global.fetch = fetchMock;

    render(<AppointmentsPage />);

    await waitFor(() => {
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  it('binds notes to the edit modal textarea', async () => {
    const fetchMock = buildFetchMock();
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/admin/appointments') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            appointments: [{ ...BASE_APPOINTMENT, notes: 'Traer radiografías' }],
          }),
        });
      }
      return buildFetchMock()(url);
    });
    global.fetch = fetchMock;
    const user = userEvent.setup();

    render(<AppointmentsPage />);

    await waitFor(() => {
      expect(screen.getByText('Traer radiografías')).toBeInTheDocument();
    });

    const editButton = screen.getAllByRole('button', { name: /Editar/i })[0];
    await user.click(editButton);

    const textarea = screen.getByLabelText('Notas de la cita');
    expect(textarea).toHaveValue('Traer radiografías');
    expect(textarea).toHaveAttribute('maxLength', '1000');
  });

  it('sends an empty notes value when cleared in the modal', async () => {
    let savedBody: Record<string, unknown> | null = null;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/admin/appointments') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            appointments: [{ ...BASE_APPOINTMENT, notes: 'Traer radiografías' }],
          }),
        });
      }
      if (url === `/api/admin/appointments/${APPOINTMENT_ID}` && init?.body) {
        savedBody = JSON.parse(init.body as string);
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return buildFetchMock()(url, init);
    });
    global.fetch = fetchMock;
    const user = userEvent.setup();

    render(<AppointmentsPage />);

    await waitFor(() => {
      expect(screen.getByText('Traer radiografías')).toBeInTheDocument();
    });

    const editButton = screen.getAllByRole('button', { name: /Editar/i })[0];
    await user.click(editButton);

    const textarea = screen.getByLabelText('Notas de la cita');
    await user.clear(textarea);

    await user.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    await waitFor(() => {
      expect(savedBody).not.toBeNull();
    });

    expect(savedBody).toMatchObject({ notes: '' });
  });
});
