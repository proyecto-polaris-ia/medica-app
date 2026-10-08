import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppointmentsPage from './page';
import { TimezoneProvider } from '@/components/admin/TimezoneProvider';
import {
  clinicLocalInputToUtc,
  clinicTimeLabel,
  toClinicLocalInput,
} from '@/lib/admin/timezone';

const { replaceMock, searchParamsRef } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  searchParamsRef: { value: new URLSearchParams() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParamsRef.value,
}));

const PROVIDER_ID = '550e8400-e29b-41d4-a716-446655440001';
const SERVICE_ID = '550e8400-e29b-41d4-a716-446655440002';
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440003';
const APPOINTMENT_ID = '550e8400-e29b-41d4-a716-446655440004';

// La clínica opera en America/Mexico_City (UTC-6, sin DST). Fijamos la cita en el
// día 10 del mes actual para que el bloque siempre caiga dentro de la grilla visible
// del calendario, sin depender de una fecha hardcodeada que envejece (time-bomb).
function currentMonthDate(day: number): { startAt: string; endAt: string } {
  const now = new Date();
  // 14:00 UTC == 08:00 hora clínica (UTC-6).
  const startUtc = Date.UTC(now.getFullYear(), now.getMonth(), day, 14, 0, 0);
  const endUtc = Date.UTC(now.getFullYear(), now.getMonth(), day, 14, 30, 0);
  return {
    startAt: new Date(startUtc).toISOString(),
    endAt: new Date(endUtc).toISOString(),
  };
}

const { startAt, endAt } = currentMonthDate(10);

const BASE_APPOINTMENT = {
  id: APPOINTMENT_ID,
  patientId: PATIENT_ID,
  serviceId: SERVICE_ID,
  providerId: PROVIDER_ID,
  startAt,
  endAt,
  status: 'confirmed',
  notes: null,
};

const LONG_NOTES = 'a'.repeat(120);
function truncateNotes(notes: string): string {
  return notes.length > 80 ? `${notes.slice(0, 80)}…` : notes;
}

// Etiqueta de fecha/hora de la lista, con el mismo formato que la página.
function viewerListDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function buildFetchMock() {
  return vi.fn().mockImplementation((url: string) => {
    if (url === '/api/admin/appointments' || url.startsWith('/api/admin/appointments?')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ appointments: [BASE_APPOINTMENT] }),
      });
    }
    if (url === '/api/admin/patients' || url.startsWith('/api/admin/patients?')) {
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
    if (url === `/api/admin/patients/${PATIENT_ID}/record`) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          record: {
            patient: { id: PATIENT_ID, fullName: 'Paciente A', phoneE164: '+5215512345678', email: 'paciente@example.com', notes: null, createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' },
            upcomingAppointments: [],
            attendedAppointments: [],
          },
        }),
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

    const rangeCall = fetchMock.mock.calls.find((call) => {
      const url = call[0] as string;
      return (
        url.startsWith('/api/admin/appointments?') &&
        url.includes('start=') &&
        url.includes('end=')
      );
    });
    expect(rangeCall).toBeDefined();
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



  it('opens the patient record modal from the appointment list patient name', async () => {
    const fetchMock = buildFetchMock();
    global.fetch = fetchMock;
    const user = userEvent.setup();

    render(<AppointmentsPage />);

    await user.click(await screen.findByRole('button', { name: 'Paciente A' }));

    expect(await screen.findByText('Expediente del paciente')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`/api/admin/patients/${PATIENT_ID}/record`);
  });

  it('renders the Notas column with a truncated preview', async () => {
    const fetchMock = buildFetchMock();
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith('/api/admin/appointments?')) {
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
      if (url.startsWith('/api/admin/appointments?')) {
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
      if (url.startsWith('/api/admin/appointments?')) {
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

  function buildAppointmentsFetch(appointments: unknown[]) {
    const fetchMock = buildFetchMock();
    fetchMock.mockImplementation((url: string) => {
      if (
        url === '/api/admin/appointments' ||
        url.startsWith('/api/admin/appointments?')
      ) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ appointments }),
        });
      }
      return buildFetchMock()(url);
    });
    return fetchMock;
  }

  it('renders the H-24 reminder badge with its send date', async () => {
    global.fetch = buildAppointmentsFetch([
      {
        ...BASE_APPOINTMENT,
        reminders: [
          {
            cadence: 'h24',
            status: 'sent',
            sentAt: '2026-10-03T15:15:00.000Z',
            dryRun: false,
            createdAt: '2026-10-03T15:15:00.000Z',
          },
        ],
      },
    ]);

    render(<AppointmentsPage />);

    expect(
      await screen.findByText('Recordatorio H-24 enviado el 3 oct 2026, 09:15')
    ).toBeInTheDocument();
  });

  it('renders the same-day reminder badge with its send date', async () => {
    global.fetch = buildAppointmentsFetch([
      {
        ...BASE_APPOINTMENT,
        reminders: [
          {
            cadence: 'same_day',
            status: 'sent',
            sentAt: '2026-10-03T15:15:00.000Z',
            dryRun: false,
            createdAt: '2026-10-03T15:15:00.000Z',
          },
        ],
      },
    ]);

    render(<AppointmentsPage />);

    expect(
      await screen.findByText('Recordatorio día mismo enviado el 3 oct 2026, 09:15')
    ).toBeInTheDocument();
  });

  it('renders a dry-run badge for scheduled dry-run reminders', async () => {
    global.fetch = buildAppointmentsFetch([
      {
        ...BASE_APPOINTMENT,
        status: 'requested',
        reminders: [
          {
            cadence: 'h24',
            status: 'scheduled',
            sentAt: null,
            dryRun: true,
            createdAt: '2026-10-03T15:15:00.000Z',
          },
        ],
      },
    ]);

    render(<AppointmentsPage />);

    expect(await screen.findByText('Simulado (dry-run)')).toBeInTheDocument();
  });

  it('renders a neutral reminder state when an appointment has no reminders', async () => {
    global.fetch = buildAppointmentsFetch([{ ...BASE_APPOINTMENT, reminders: [] }]);

    render(<AppointmentsPage />);

    expect(await screen.findByText('Sin recordatorio')).toBeInTheDocument();
  });

  it('shows a readable confirmation status label', async () => {
    global.fetch = buildAppointmentsFetch([{ ...BASE_APPOINTMENT, status: 'confirmed' }]);

    render(<AppointmentsPage />);

    expect(await screen.findByText('Confirmada')).toBeInTheDocument();
  });
});

// Regresión del bug "lista 17:00 / calendario 16:00": la página de citas debe
// leer y escribir horas en la zona del observador (la preferencia del usuario),
// con default en la zona clínica, y nunca en la zona del dispositivo.
describe('/appointments viewer-timezone rendering', () => {
  const ORIGINAL_TZ = process.env.TZ;

  beforeEach(() => {
    vi.restoreAllMocks();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => false);
    // Equipo del usuario fuera de la zona clínica: New York va 1 h adelante
    // de Ciudad de México (UTC-4 vs UTC-6) en septiembre.
    process.env.TZ = 'America/New_York';
  });

  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  it('renders the list and edit modal in clinic time, not device time', async () => {
    global.fetch = buildFetchMock();
    const user = userEvent.setup();

    render(<AppointmentsPage />);

    // 14:00 UTC = 08:00 hora clínica (UTC-6); en New York serían 10:00.
    await waitFor(() => {
      expect(screen.getByText(/8:00/)).toBeInTheDocument();
    });

    const editButton = screen.getAllByRole('button', { name: /Editar/i })[0];
    await user.click(editButton);

    const startInput = document.querySelectorAll('input[type="datetime-local"]')[0] as HTMLInputElement;
    expect(startInput.value).toBe(`${startAt.slice(0, 10)}T08:00`);
  });

  it('saves the untouched clinic time without shifting the UTC instant', async () => {
    let savedBody: Record<string, unknown> | null = null;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
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
      expect(screen.getByText(/8:00/)).toBeInTheDocument();
    });

    const editButton = screen.getAllByRole('button', { name: /Editar/i })[0];
    await user.click(editButton);

    // Editar sin tocar la hora no debe mover la cita una hora.
    await user.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    await waitFor(() => {
      expect(savedBody).not.toBeNull();
    });

    expect(savedBody).toMatchObject({ startAt, endAt });
  });

  it('muestra la misma hora del observador en la lista, el calendario y el modal', async () => {
    global.fetch = buildFetchMock();
    const user = userEvent.setup();

    render(
      <TimezoneProvider timezone="America/Los_Angeles">
        <AppointmentsPage />
      </TimezoneProvider>
    );

    const viewerHour = clinicTimeLabel(startAt, 'America/Los_Angeles');

    // La lista debe usar la zona del observador, no la de la clínica (8:00).
    expect(
      await screen.findByText(viewerListDateTime(startAt, 'America/Los_Angeles'))
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Calendario/ }));
    await waitFor(
      () => {
        expect(screen.getAllByTestId('weekday-label')).toHaveLength(7);
      },
      { timeout: 10000 }
    );

    const block = screen
      .getAllByRole('button')
      .find((button) => button.getAttribute('aria-label')?.includes('Limpieza'));
    expect(block?.getAttribute('aria-label')).toContain(viewerHour);

    await user.click(block!);

    const startInput = document.querySelectorAll(
      'input[type="datetime-local"]'
    )[0] as HTMLInputElement;
    expect(startInput.value).toBe(toClinicLocalInput(startAt, 'America/Los_Angeles'));
  }, 15000);

  it('indica la zona horaria del observador junto a los campos de captura', async () => {
    global.fetch = buildFetchMock();
    const user = userEvent.setup();

    render(
      <TimezoneProvider timezone="America/Los_Angeles">
        <AppointmentsPage />
      </TimezoneProvider>
    );

    await screen.findByText(viewerListDateTime(startAt, 'America/Los_Angeles'));

    await user.click(screen.getAllByRole('button', { name: /Editar/i })[0]);

    expect(
      screen.getByText('Zona horaria: America/Los_Angeles')
    ).toBeInTheDocument();
  });

  it('interpreta la hora capturada como hora del observador al guardar', async () => {
    let savedBody: Record<string, unknown> | null = null;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === `/api/admin/appointments/${APPOINTMENT_ID}` && init?.body) {
        savedBody = JSON.parse(init.body as string);
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return buildFetchMock()(url, init);
    });
    global.fetch = fetchMock;
    const user = userEvent.setup();

    render(
      <TimezoneProvider timezone="America/Los_Angeles">
        <AppointmentsPage />
      </TimezoneProvider>
    );

    await screen.findByText(viewerListDateTime(startAt, 'America/Los_Angeles'));

    await user.click(screen.getAllByRole('button', { name: /Editar/i })[0]);

    const date = startAt.slice(0, 10);
    const captured = `${date}T17:00`;
    const startInput = document.querySelectorAll(
      'input[type="datetime-local"]'
    )[0] as HTMLInputElement;
    fireEvent.change(startInput, { target: { value: captured } });

    await user.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    await waitFor(() => {
      expect(savedBody).not.toBeNull();
    });

    expect(savedBody).toMatchObject({
      startAt: clinicLocalInputToUtc(captured, 'America/Los_Angeles'),
    });
    // La interpretación clínica sería distinta: la captura usó la zona del observador.
    expect(savedBody).not.toMatchObject({
      startAt: clinicLocalInputToUtc(captured, 'America/Mexico_City'),
    });
  });

  it('usa la zona de la clínica cuando la preferencia del observador es la clínica', async () => {
    global.fetch = buildFetchMock();

    render(
      <TimezoneProvider timezone="America/Mexico_City">
        <AppointmentsPage />
      </TimezoneProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/8:00/)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Filtro multi-selección de proveedores en el calendario (issue #174).
// ---------------------------------------------------------------------------
const CAL_PROVIDERS = [
  { id: 'prov-a', name: 'Dra. Ana', color: '#1f77b4' },
  { id: 'prov-b', name: 'Dr. Beto', color: '#ff7f0e' },
  { id: 'prov-c', name: 'Dra. Caro', color: '#2ca02c' },
];

const CAL_PATIENTS = [
  { id: 'patient-a', fullName: 'Paciente A' },
  { id: 'patient-b', fullName: 'Paciente B' },
  { id: 'patient-c', fullName: 'Paciente C' },
];

// Catálogo multi-servicio del calendario (#177). `CAL_SERVICE` se conserva
// como alias retrocompatible de la primera entrada para las pruebas de #174.
const CAL_SERVICES = [
  { id: 'service-1', name: 'Limpieza' },
  { id: 'service-2', name: 'Ortodoncia' },
  { id: 'service-3', name: 'Revisión' },
];

const CAL_SERVICE = CAL_SERVICES[0];

// America/Mexico_City opera en UTC-6 (sin DST): hora clínica + 6 = UTC.
function clinicHourIso(day: number, hour: number): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), day, hour + 6, 0, 0)
  ).toISOString();
}

function calAppointment(
  id: string,
  providerId: string,
  patientId: string,
  day: number,
  hour: number,
  serviceId: string = CAL_SERVICE.id
) {
  return {
    id,
    patientId,
    serviceId,
    providerId,
    startAt: clinicHourIso(day, hour),
    endAt: clinicHourIso(day, hour + 1),
    status: 'confirmed',
    notes: null,
  };
}

const CAL_APPOINTMENTS = [
  calAppointment('appt-a', 'prov-a', 'patient-a', 10, 8),
  calAppointment('appt-b', 'prov-b', 'patient-b', 10, 9),
  calAppointment('appt-c', 'prov-c', 'patient-c', 10, 10),
];

function buildCalendarFetch({
  appointments = CAL_APPOINTMENTS,
  providers = CAL_PROVIDERS,
  patients = CAL_PATIENTS,
  services = [CAL_SERVICE],
}: {
  appointments?: unknown[];
  providers?: unknown[];
  patients?: unknown[];
  services?: unknown[];
} = {}) {
  const ok = (body: unknown) =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  return vi.fn().mockImplementation((url: string) => {
    if (url.startsWith('/api/admin/appointments')) return ok({ appointments });
    if (url === '/api/admin/patients' || url.startsWith('/api/admin/patients?')) return ok({ patients });
    if (url === '/api/admin/providers') return ok({ providers });
    if (url === '/api/admin/services') return ok({ services });
    return ok({});
  });
}

function legendEntry(name: string | RegExp) {
  return screen.getByRole('button', { name });
}

function calendarBlock(name: string | RegExp) {
  return screen.queryByRole('button', { name });
}

async function openCalendar(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Calendario$/ }));
  await waitFor(
    () => {
      expect(screen.getAllByTestId('weekday-label')).toHaveLength(7);
    },
    { timeout: 10000 }
  );
}

describe('/appointments calendar provider filter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => false);
    searchParamsRef.value = new URLSearchParams();
    replaceMock.mockClear();
  });

  it('2.1 muestra solo las citas del proveedor deseleccionado (A y B)', async () => {
    global.fetch = buildCalendarFetch({
      providers: [CAL_PROVIDERS[0], CAL_PROVIDERS[1]],
      patients: [CAL_PATIENTS[0], CAL_PATIENTS[1]],
      appointments: [CAL_APPOINTMENTS[0], CAL_APPOINTMENTS[1]],
    });
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/08:00 Limpieza — Paciente A/)).toBeInTheDocument()
    );
    expect(calendarBlock(/09:00 Limpieza — Paciente B/)).toBeInTheDocument();

    await user.click(legendEntry(/Dr\. Beto/));

    await waitFor(() => {
      expect(calendarBlock(/08:00 Limpieza — Paciente A/)).toBeInTheDocument();
      expect(calendarBlock(/09:00 Limpieza — Paciente B/)).not.toBeInTheDocument();
    });
  });

  it('2.1 muestra solo los proveedores elegidos (A y C, sin B)', async () => {
    global.fetch = buildCalendarFetch();
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/09:00 Limpieza — Paciente B/)).toBeInTheDocument()
    );

    await user.click(legendEntry(/Dr\. Beto/));

    await waitFor(() => {
      expect(calendarBlock(/08:00 Limpieza — Paciente A/)).toBeInTheDocument();
      expect(calendarBlock(/10:00 Limpieza — Paciente C/)).toBeInTheDocument();
      expect(calendarBlock(/09:00 Limpieza — Paciente B/)).not.toBeInTheDocument();
    });
  });

  it('2.2 volver a "todos" restaura todas las citas y lo comunica', async () => {
    global.fetch = buildCalendarFetch();
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/09:00 Limpieza — Paciente B/)).toBeInTheDocument()
    );

    await user.click(legendEntry(/Dr\. Beto/));
    await waitFor(() =>
      expect(calendarBlock(/09:00 Limpieza — Paciente B/)).not.toBeInTheDocument()
    );
    expect(
      screen.queryByText('Mostrando todos los proveedores')
    ).not.toBeInTheDocument();

    await user.click(legendEntry(/Dr\. Beto/));

    await waitFor(() => {
      expect(
        screen.getByText('Mostrando todos los proveedores')
      ).toBeInTheDocument();
    });
    expect(calendarBlock(/08:00 Limpieza — Paciente A/)).toBeInTheDocument();
    expect(calendarBlock(/09:00 Limpieza — Paciente B/)).toBeInTheDocument();
    expect(calendarBlock(/10:00 Limpieza — Paciente C/)).toBeInTheDocument();
  });

  it('2.2 el filtrado precede al agrupamiento por día', async () => {
    global.fetch = buildCalendarFetch({
      providers: [CAL_PROVIDERS[0], CAL_PROVIDERS[1]],
      patients: [CAL_PATIENTS[0], CAL_PATIENTS[1]],
      appointments: [
        calAppointment('appt-a', 'prov-a', 'patient-a', 12, 9),
        calAppointment('appt-b', 'prov-b', 'patient-b', 12, 11),
      ],
    });
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/11:00 Limpieza — Paciente B/)).toBeInTheDocument()
    );

    await user.click(legendEntry(/Dr\. Beto/));

    await waitFor(() => {
      expect(calendarBlock(/09:00 Limpieza — Paciente A/)).toBeInTheDocument();
      expect(calendarBlock(/11:00 Limpieza — Paciente B/)).not.toBeInTheDocument();
    });
  });

  it('2.3 refleja la selección en la URL con ids unidos por coma', async () => {
    global.fetch = buildCalendarFetch();
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/10:00 Limpieza — Paciente C/)).toBeInTheDocument()
    );

    await user.click(legendEntry(/Dra\. Caro/));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(
        '/appointments?providerId=prov-a,prov-b'
      );
    });
  });

  it('2.3 restaura la selección desde un deep link', async () => {
    searchParamsRef.value = new URLSearchParams('providerId=prov-a,prov-b');
    global.fetch = buildCalendarFetch();
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/09:00 Limpieza — Paciente B/)).toBeInTheDocument()
    );

    expect(legendEntry(/Dra\. Ana/)).toHaveAttribute('aria-pressed', 'true');
    expect(legendEntry(/Dr\. Beto/)).toHaveAttribute('aria-pressed', 'true');
    expect(legendEntry(/Dra\. Caro/)).toHaveAttribute('aria-pressed', 'false');
    expect(calendarBlock(/10:00 Limpieza — Paciente C/)).not.toBeInTheDocument();
  });

  it('2.3 "Limpiar filtros" reinicia la selección y limpia la URL', async () => {
    searchParamsRef.value = new URLSearchParams('providerId=prov-a,prov-b');
    global.fetch = buildCalendarFetch();
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/10:00 Limpieza — Paciente C/)).not.toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/appointments');
    });
    expect(calendarBlock(/08:00 Limpieza — Paciente A/)).toBeInTheDocument();
    expect(calendarBlock(/09:00 Limpieza — Paciente B/)).toBeInTheDocument();
    expect(calendarBlock(/10:00 Limpieza — Paciente C/)).toBeInTheDocument();
  });

  it('2.3 no reescribe la URL cuando la selección efectiva no cambia', async () => {
    global.fetch = buildCalendarFetch({
      providers: [CAL_PROVIDERS[0]],
      patients: [CAL_PATIENTS[0]],
      appointments: [CAL_APPOINTMENTS[0]],
    });
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/08:00 Limpieza — Paciente A/)).toBeInTheDocument()
    );

    await user.click(legendEntry(/Dra\. Ana/));

    await waitFor(() =>
      expect(calendarBlock(/08:00 Limpieza — Paciente A/)).toBeInTheDocument()
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('2.4 tolera ids desconocidos en la URL sin romper el calendario', async () => {
    searchParamsRef.value = new URLSearchParams('providerId=prov-a,desconocido');
    global.fetch = buildCalendarFetch({
      providers: [CAL_PROVIDERS[0], CAL_PROVIDERS[1]],
      patients: [CAL_PATIENTS[0], CAL_PATIENTS[1]],
      appointments: [CAL_APPOINTMENTS[0], CAL_APPOINTMENTS[1]],
    });
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/08:00 Limpieza — Paciente A/)).toBeInTheDocument()
    );

    // La leyenda conserva el universo del mes: A y B siguen como controles.
    expect(legendEntry(/Dra\. Ana/)).toHaveAttribute('aria-pressed', 'true');
    expect(legendEntry(/Dr\. Beto/)).toHaveAttribute('aria-pressed', 'false');
    expect(calendarBlock(/09:00 Limpieza — Paciente B/)).not.toBeInTheDocument();
  });

  it('3.1 la lista conserva su filtro de proveedor de un solo valor', async () => {
    searchParamsRef.value = new URLSearchParams('providerId=prov-a');
    global.fetch = buildCalendarFetch({
      providers: [CAL_PROVIDERS[0], CAL_PROVIDERS[1]],
      patients: [CAL_PATIENTS[0], CAL_PATIENTS[1]],
      appointments: [CAL_APPOINTMENTS[0], CAL_APPOINTMENTS[1]],
    });
    render(<AppointmentsPage />);

    await waitFor(() =>
      expect(screen.getAllByRole('row').length).toBeGreaterThan(1)
    );
    const providerSelect = screen.getByRole('combobox', { name: 'Proveedor' }) as HTMLSelectElement;
    expect(providerSelect).toHaveValue('prov-a');
    expect(
      screen.queryByText('No hay citas que coincidan con los filtros.')
    ).not.toBeInTheDocument();
  });

  it('3.1 un providerId multi-valor deja la lista en "todos" y no reescribe la URL', async () => {
    searchParamsRef.value = new URLSearchParams('providerId=prov-a,prov-b');
    global.fetch = buildCalendarFetch({
      providers: [CAL_PROVIDERS[0], CAL_PROVIDERS[1]],
      patients: [CAL_PATIENTS[0], CAL_PATIENTS[1]],
      appointments: [CAL_APPOINTMENTS[0], CAL_APPOINTMENTS[1]],
    });
    render(<AppointmentsPage />);

    await waitFor(() =>
      expect(screen.getAllByRole('row').length).toBeGreaterThan(1)
    );
    expect(
      screen.queryByText('No hay citas que coincidan con los filtros.')
    ).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('3.2 la selección sobrevive el cambio Lista ↔ Calendario', async () => {
    searchParamsRef.value = new URLSearchParams('providerId=prov-a,prov-b');
    global.fetch = buildCalendarFetch();
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/09:00 Limpieza — Paciente B/)).toBeInTheDocument()
    );
    expect(legendEntry(/Dra\. Ana/)).toHaveAttribute('aria-pressed', 'true');
    expect(legendEntry(/Dr\. Beto/)).toHaveAttribute('aria-pressed', 'true');

    const replaceCallsBefore = replaceMock.mock.calls.length;

    await user.click(screen.getByRole('button', { name: /^Lista$/ }));
    await waitFor(() =>
      expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0)
    );
    await user.click(screen.getByRole('button', { name: /^Calendario$/ }));
    await waitFor(
      () => {
        expect(screen.getAllByTestId('weekday-label')).toHaveLength(7);
      },
      { timeout: 10000 }
    );

    await waitFor(() =>
      expect(calendarBlock(/09:00 Limpieza — Paciente B/)).toBeInTheDocument()
    );
    expect(legendEntry(/Dra\. Ana/)).toHaveAttribute('aria-pressed', 'true');
    expect(legendEntry(/Dr\. Beto/)).toHaveAttribute('aria-pressed', 'true');
    expect(calendarBlock(/10:00 Limpieza — Paciente C/)).not.toBeInTheDocument();
    expect(replaceMock.mock.calls.length).toBe(replaceCallsBefore);
  });

  it('3.3 la fila es responsiva y "Limpiar filtros" solo existe con filtro activo', async () => {
    global.fetch = buildCalendarFetch();
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);

    expect(
      screen.queryByRole('button', { name: 'Limpiar filtros' })
    ).not.toBeInTheDocument();

    const nav = screen.getByRole('button', { name: 'Mes anterior' });
    const row = nav.parentElement!.parentElement!;
    expect(row.className).toContain('flex-col');
    expect(row.className).toContain('gap-4');
    expect(row.className).toContain('sm:flex-row');
    expect(row.className).toContain('sm:items-center');
    expect(row.className).toContain('sm:justify-between');

    await user.click(legendEntry(/Dr\. Beto/));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Limpiar filtros' })
      ).toBeInTheDocument();
    });
  });

  it('12.1 el centinela providerId=all se parsea a "todos"', async () => {
    searchParamsRef.value = new URLSearchParams('providerId=all');
    global.fetch = buildCalendarFetch();
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/09:00 Limpieza — Paciente B/)).toBeInTheDocument()
    );

    expect(
      screen.getByText('Mostrando todos los proveedores')
    ).toBeInTheDocument();
    expect(legendEntry(/Dra\. Ana/)).toHaveAttribute('aria-pressed', 'true');
    expect(legendEntry(/Dr\. Beto/)).toHaveAttribute('aria-pressed', 'true');
    expect(legendEntry(/Dra\. Caro/)).toHaveAttribute('aria-pressed', 'true');
    expect(calendarBlock(/10:00 Limpieza — Paciente C/)).toBeInTheDocument();
  });

  it('12.1 alternar entradas consecutivas escribe la unión en orden sin repetir la última', async () => {
    global.fetch = buildCalendarFetch();
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/10:00 Limpieza — Paciente C/)).toBeInTheDocument()
    );

    // Desactivar C -> selección [A, B].
    await user.click(legendEntry(/Dra\. Caro/));
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        '/appointments?providerId=prov-a,prov-b'
      )
    );

    // Reactivar C -> [A, B, C] equivale a "todos" -> se guarda [].
    await user.click(legendEntry(/Dra\. Caro/));
    await waitFor(() =>
      expect(replaceMock).toHaveBeenLastCalledWith('/appointments')
    );

    // Desactivar A -> [B, C].
    await user.click(legendEntry(/Dra\. Ana/));
    await waitFor(() =>
      expect(replaceMock).toHaveBeenLastCalledWith(
        '/appointments?providerId=prov-b,prov-c'
      )
    );

    expect(replaceMock.mock.calls.map((call) => call[0])).toEqual([
      '/appointments?providerId=prov-a,prov-b',
      '/appointments',
      '/appointments?providerId=prov-b,prov-c',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Filtro multi-selección de servicios en el calendario (issue #177).
// ---------------------------------------------------------------------------
function serviceEntry(name: string | RegExp) {
  return screen.getByRole('button', { name });
}

describe('/appointments calendar service filter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => false);
    searchParamsRef.value = new URLSearchParams();
    replaceMock.mockClear();
  });

  it('3.1 seleccionar solo un servicio muestra únicamente sus citas', async () => {
    global.fetch = buildCalendarFetch({
      services: CAL_SERVICES,
      providers: [CAL_PROVIDERS[0]],
      patients: [CAL_PATIENTS[0], CAL_PATIENTS[1]],
      appointments: [
        calAppointment('appt-x', 'prov-a', 'patient-a', 10, 8, 'service-1'),
        calAppointment('appt-y', 'prov-a', 'patient-b', 10, 9, 'service-2'),
      ],
    });
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/09:00 Ortodoncia — Paciente B/)).toBeInTheDocument()
    );

    // Desde "todos" ([]) se deselecciona Y: la cuadrícula queda solo con X.
    await user.click(serviceEntry('Ortodoncia'));

    await waitFor(() => {
      expect(calendarBlock(/08:00 Limpieza — Paciente A/)).toBeInTheDocument();
      expect(
        calendarBlock(/09:00 Ortodoncia — Paciente B/)
      ).not.toBeInTheDocument();
    });
  });

  it('3.1 con tres servicios, desactivar el intermedio deja los otros dos', async () => {
    global.fetch = buildCalendarFetch({
      services: CAL_SERVICES,
      providers: [CAL_PROVIDERS[0]],
      patients: CAL_PATIENTS,
      appointments: [
        calAppointment('appt-x', 'prov-a', 'patient-a', 10, 8, 'service-1'),
        calAppointment('appt-y', 'prov-a', 'patient-b', 10, 9, 'service-2'),
        calAppointment('appt-z', 'prov-a', 'patient-c', 10, 10, 'service-3'),
      ],
    });
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/10:00 Revisión — Paciente C/)).toBeInTheDocument()
    );

    await user.click(serviceEntry('Ortodoncia'));

    await waitFor(() => {
      expect(calendarBlock(/08:00 Limpieza — Paciente A/)).toBeInTheDocument();
      expect(calendarBlock(/10:00 Revisión — Paciente C/)).toBeInTheDocument();
      expect(
        calendarBlock(/09:00 Ortodoncia — Paciente B/)
      ).not.toBeInTheDocument();
    });
  });

  it('3.1 desmarcar hasta [] restaura todo y comunica "todos"', async () => {
    global.fetch = buildCalendarFetch({
      services: CAL_SERVICES,
      providers: [CAL_PROVIDERS[0]],
      patients: CAL_PATIENTS,
      appointments: [
        calAppointment('appt-x', 'prov-a', 'patient-a', 10, 8, 'service-1'),
        calAppointment('appt-y', 'prov-a', 'patient-b', 10, 9, 'service-2'),
        calAppointment('appt-z', 'prov-a', 'patient-c', 10, 10, 'service-3'),
      ],
    });
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/09:00 Ortodoncia — Paciente B/)).toBeInTheDocument()
    );

    await user.click(serviceEntry('Ortodoncia'));
    await waitFor(() =>
      expect(
        calendarBlock(/09:00 Ortodoncia — Paciente B/)
      ).not.toBeInTheDocument()
    );
    expect(
      screen.queryByText('Mostrando todos los servicios')
    ).not.toBeInTheDocument();

    await user.click(serviceEntry('Ortodoncia'));

    await waitFor(() => {
      expect(
        screen.getByText('Mostrando todos los servicios')
      ).toBeInTheDocument();
    });
    expect(calendarBlock(/08:00 Limpieza — Paciente A/)).toBeInTheDocument();
    expect(calendarBlock(/09:00 Ortodoncia — Paciente B/)).toBeInTheDocument();
    expect(calendarBlock(/10:00 Revisión — Paciente C/)).toBeInTheDocument();
  });

  it('3.2 el filtro de servicios se compone con AND con el de proveedores', async () => {
    global.fetch = buildCalendarFetch({
      services: CAL_SERVICES,
      providers: [CAL_PROVIDERS[0], CAL_PROVIDERS[1]],
      patients: CAL_PATIENTS,
      appointments: [
        calAppointment('appt-xa', 'prov-a', 'patient-a', 10, 8, 'service-1'),
        calAppointment('appt-xb', 'prov-b', 'patient-b', 10, 9, 'service-1'),
        calAppointment('appt-ya', 'prov-a', 'patient-c', 10, 10, 'service-2'),
      ],
    });
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/10:00 Ortodoncia — Paciente C/)).toBeInTheDocument()
    );

    // Seleccionar X: deseleccionar Y.
    await user.click(serviceEntry('Ortodoncia'));
    await waitFor(() =>
      expect(
        calendarBlock(/10:00 Ortodoncia — Paciente C/)
      ).not.toBeInTheDocument()
    );

    // Seleccionar A: deseleccionar B.
    await user.click(legendEntry(/Dr\. Beto/));

    await waitFor(() => {
      expect(calendarBlock(/08:00 Limpieza — Paciente A/)).toBeInTheDocument();
      expect(
        calendarBlock(/09:00 Limpieza — Paciente B/)
      ).not.toBeInTheDocument();
      expect(
        calendarBlock(/10:00 Ortodoncia — Paciente C/)
      ).not.toBeInTheDocument();
    });
  });

  it('3.2 el filtrado de servicios precede al agrupamiento por día', async () => {
    global.fetch = buildCalendarFetch({
      services: CAL_SERVICES,
      providers: [CAL_PROVIDERS[0], CAL_PROVIDERS[1]],
      patients: [CAL_PATIENTS[0], CAL_PATIENTS[1]],
      appointments: [
        calAppointment('appt-a', 'prov-a', 'patient-a', 12, 9, 'service-1'),
        calAppointment('appt-b', 'prov-b', 'patient-b', 12, 11, 'service-2'),
      ],
    });
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(
        calendarBlock(/11:00 Ortodoncia — Paciente B/)
      ).toBeInTheDocument()
    );

    await user.click(serviceEntry('Ortodoncia'));
    await user.click(legendEntry(/Dr\. Beto/));

    await waitFor(() => {
      expect(calendarBlock(/09:00 Limpieza — Paciente A/)).toBeInTheDocument();
      expect(
        calendarBlock(/11:00 Ortodoncia — Paciente B/)
      ).not.toBeInTheDocument();
    });
  });

  it('3.3 refleja la selección de servicios en la URL con ids unidos por coma', async () => {
    global.fetch = buildCalendarFetch({
      services: CAL_SERVICES,
      providers: [CAL_PROVIDERS[0]],
      patients: CAL_PATIENTS,
      appointments: [
        calAppointment('appt-x', 'prov-a', 'patient-a', 10, 8, 'service-1'),
        calAppointment('appt-y', 'prov-a', 'patient-b', 10, 9, 'service-2'),
        calAppointment('appt-z', 'prov-a', 'patient-c', 10, 10, 'service-3'),
      ],
    });
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/10:00 Revisión — Paciente C/)).toBeInTheDocument()
    );

    await user.click(serviceEntry('Revisión'));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(
        '/appointments?serviceId=service-1,service-2'
      );
    });
  });

  it('3.3 restaura la selección de servicios desde un deep link', async () => {
    searchParamsRef.value = new URLSearchParams('serviceId=service-1,service-2');
    global.fetch = buildCalendarFetch({
      services: CAL_SERVICES,
      providers: [CAL_PROVIDERS[0]],
      patients: CAL_PATIENTS,
      appointments: [
        calAppointment('appt-x', 'prov-a', 'patient-a', 10, 8, 'service-1'),
        calAppointment('appt-y', 'prov-a', 'patient-b', 10, 9, 'service-2'),
        calAppointment('appt-z', 'prov-a', 'patient-c', 10, 10, 'service-3'),
      ],
    });
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/08:00 Limpieza — Paciente A/)).toBeInTheDocument()
    );

    expect(serviceEntry('Limpieza')).toHaveAttribute('aria-pressed', 'true');
    expect(serviceEntry('Ortodoncia')).toHaveAttribute('aria-pressed', 'true');
    expect(serviceEntry('Revisión')).toHaveAttribute('aria-pressed', 'false');
    expect(
      calendarBlock(/10:00 Revisión — Paciente C/)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Mostrando todos los servicios')
    ).not.toBeInTheDocument();
  });

  it('3.3 compone providerId primero y serviceId después', async () => {
    global.fetch = buildCalendarFetch({
      services: CAL_SERVICES,
      providers: [CAL_PROVIDERS[0], CAL_PROVIDERS[1]],
      patients: CAL_PATIENTS,
      appointments: [
        calAppointment('appt-xa', 'prov-a', 'patient-a', 10, 8, 'service-1'),
        calAppointment('appt-xb', 'prov-b', 'patient-b', 10, 9, 'service-1'),
        calAppointment('appt-ya', 'prov-a', 'patient-c', 10, 10, 'service-2'),
        calAppointment('appt-za', 'prov-a', 'patient-c', 10, 11, 'service-3'),
      ],
    });
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/11:00 Revisión — Paciente C/)).toBeInTheDocument()
    );

    // Seleccionar X e Y: deseleccionar Z (Revisión).
    await user.click(serviceEntry('Revisión'));
    await waitFor(() =>
      expect(replaceMock).toHaveBeenLastCalledWith(
        '/appointments?serviceId=service-1,service-2'
      )
    );

    // Seleccionar A: deseleccionar B.
    await user.click(legendEntry(/Dr\. Beto/));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenLastCalledWith(
        '/appointments?providerId=prov-a&serviceId=service-1,service-2'
      );
    });
  });

  it('3.3 el deep link con ambos parámetros restaura ambos filtros', async () => {
    searchParamsRef.value = new URLSearchParams(
      'providerId=prov-a&serviceId=service-1,service-2'
    );
    global.fetch = buildCalendarFetch({
      services: CAL_SERVICES,
      providers: [CAL_PROVIDERS[0], CAL_PROVIDERS[1]],
      patients: CAL_PATIENTS,
      appointments: [
        calAppointment('appt-xa', 'prov-a', 'patient-a', 10, 8, 'service-1'),
        calAppointment('appt-xb', 'prov-b', 'patient-b', 10, 9, 'service-1'),
        calAppointment('appt-ya', 'prov-a', 'patient-c', 10, 10, 'service-3'),
        calAppointment('appt-yb', 'prov-b', 'patient-b', 10, 11, 'service-2'),
      ],
    });
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/08:00 Limpieza — Paciente A/)).toBeInTheDocument()
    );

    expect(serviceEntry('Limpieza')).toHaveAttribute('aria-pressed', 'true');
    expect(serviceEntry('Ortodoncia')).toHaveAttribute('aria-pressed', 'true');
    expect(legendEntry(/Dra\. Ana/)).toHaveAttribute('aria-pressed', 'true');
    expect(legendEntry(/Dr\. Beto/)).toHaveAttribute('aria-pressed', 'false');
    expect(
      calendarBlock(/09:00 Limpieza — Paciente B/)
    ).not.toBeInTheDocument();
    expect(
      calendarBlock(/10:00 Revisión — Paciente C/)
    ).not.toBeInTheDocument();
    expect(
      calendarBlock(/11:00 Ortodoncia — Paciente B/)
    ).not.toBeInTheDocument();
  });

  it('3.4 la selección de servicios sobrevive el cambio Lista ↔ Calendario', async () => {
    searchParamsRef.value = new URLSearchParams(
      'providerId=prov-a&serviceId=service-1,service-2'
    );
    global.fetch = buildCalendarFetch({
      services: CAL_SERVICES,
      providers: [CAL_PROVIDERS[0], CAL_PROVIDERS[1]],
      patients: CAL_PATIENTS,
      appointments: [
        calAppointment('appt-xa', 'prov-a', 'patient-a', 10, 8, 'service-1'),
        calAppointment('appt-xb', 'prov-b', 'patient-b', 10, 9, 'service-1'),
        calAppointment('appt-ya', 'prov-a', 'patient-c', 10, 10, 'service-2'),
        calAppointment('appt-za', 'prov-a', 'patient-b', 10, 11, 'service-3'),
      ],
    });
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/08:00 Limpieza — Paciente A/)).toBeInTheDocument()
    );
    const replaceCallsBefore = replaceMock.mock.calls.length;

    await user.click(screen.getByRole('button', { name: /^Lista$/ }));
    await waitFor(() =>
      expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0)
    );
    await user.click(screen.getByRole('button', { name: /^Calendario$/ }));
    await waitFor(
      () => {
        expect(screen.getAllByTestId('weekday-label')).toHaveLength(7);
      },
      { timeout: 10000 }
    );

    await waitFor(() =>
      expect(calendarBlock(/08:00 Limpieza — Paciente A/)).toBeInTheDocument()
    );
    expect(serviceEntry('Limpieza')).toHaveAttribute('aria-pressed', 'true');
    expect(serviceEntry('Ortodoncia')).toHaveAttribute('aria-pressed', 'true');
    expect(serviceEntry('Revisión')).toHaveAttribute('aria-pressed', 'false');
    expect(legendEntry(/Dra\. Ana/)).toHaveAttribute('aria-pressed', 'true');
    expect(calendarBlock(/10:00 Ortodoncia — Paciente C/)).toBeInTheDocument();
    expect(
      calendarBlock(/11:00 Revisión — Paciente B/)
    ).not.toBeInTheDocument();
    expect(replaceMock.mock.calls.length).toBe(replaceCallsBefore);
  });

  it('3.5 "Limpiar filtros" reinicia ambos filtros con una sola escritura', async () => {
    searchParamsRef.value = new URLSearchParams(
      'providerId=prov-a&serviceId=service-1'
    );
    global.fetch = buildCalendarFetch({
      services: CAL_SERVICES,
      providers: [CAL_PROVIDERS[0], CAL_PROVIDERS[1]],
      patients: CAL_PATIENTS,
      appointments: [
        calAppointment('appt-xa', 'prov-a', 'patient-a', 10, 8, 'service-1'),
        calAppointment('appt-xb', 'prov-b', 'patient-b', 10, 9, 'service-1'),
        calAppointment('appt-ya', 'prov-a', 'patient-c', 10, 10, 'service-2'),
      ],
    });
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/08:00 Limpieza — Paciente A/)).toBeInTheDocument()
    );
    expect(
      calendarBlock(/10:00 Ortodoncia — Paciente C/)
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/appointments');
    });
    expect(replaceMock.mock.calls).toEqual([['/appointments']]);
    expect(calendarBlock(/08:00 Limpieza — Paciente A/)).toBeInTheDocument();
    expect(calendarBlock(/09:00 Limpieza — Paciente B/)).toBeInTheDocument();
    expect(calendarBlock(/10:00 Ortodoncia — Paciente C/)).toBeInTheDocument();
  });

  it('3.5 el botón aparece solo con filtro activo (solo servicio)', async () => {
    global.fetch = buildCalendarFetch({
      services: CAL_SERVICES,
      providers: [CAL_PROVIDERS[0]],
      patients: [CAL_PATIENTS[0], CAL_PATIENTS[1]],
      appointments: [
        calAppointment('appt-x', 'prov-a', 'patient-a', 10, 8, 'service-1'),
        calAppointment('appt-y', 'prov-a', 'patient-b', 10, 9, 'service-2'),
      ],
    });
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/09:00 Ortodoncia — Paciente B/)).toBeInTheDocument()
    );

    expect(
      screen.queryByRole('button', { name: 'Limpiar filtros' })
    ).not.toBeInTheDocument();

    await user.click(serviceEntry('Ortodoncia'));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Limpiar filtros' })
      ).toBeInTheDocument();
    });
  });

  it('3.6 la lista conserva su filtro de servicio de un solo valor', async () => {
    searchParamsRef.value = new URLSearchParams('serviceId=service-1,service-2');
    // El filtro de la lista es server-side: el mock respeta `serviceId` del
    // query para reproducir la página filtrada que devuelve el API.
    const listAppointments = [
      calAppointment('appt-x', 'prov-a', 'patient-a', 10, 8, 'service-1'),
      calAppointment('appt-y', 'prov-a', 'patient-b', 10, 9, 'service-2'),
    ];
    const ok = (body: unknown) =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('/api/admin/appointments')) {
        const serviceId = new URLSearchParams(url.split('?')[1] ?? '').get(
          'serviceId'
        );
        const filtered = serviceId
          ? listAppointments.filter((a) => a.serviceId === serviceId)
          : listAppointments;
        return ok({
          appointments: filtered,
          pagination: {
            total: filtered.length,
            page: 1,
            pageSize: 20,
            totalPages: filtered.length > 0 ? 1 : 0,
          },
        });
      }
      return buildCalendarFetch({
        services: CAL_SERVICES,
        providers: [CAL_PROVIDERS[0]],
        patients: [CAL_PATIENTS[0], CAL_PATIENTS[1]],
        appointments: listAppointments,
      })(url);
    });
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await waitFor(() =>
      expect(screen.getAllByRole('row').length).toBeGreaterThan(1)
    );
    const serviceSelect = screen.getByRole('combobox', { name: 'Servicio' }) as HTMLSelectElement;
    expect(serviceSelect).toHaveValue('');
    const rowsBefore = screen.getAllByRole('row').length;

    await user.selectOptions(serviceSelect, 'service-2');

    await waitFor(() =>
      expect(screen.getAllByRole('row').length).toBe(rowsBefore - 1)
    );
    expect(serviceSelect).toHaveValue('service-2');
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('3.6 ids desconocidos en la URL no rompen el calendario', async () => {
    searchParamsRef.value = new URLSearchParams('serviceId=service-1,desconocido');
    global.fetch = buildCalendarFetch({
      services: CAL_SERVICES,
      providers: [CAL_PROVIDERS[0]],
      patients: [CAL_PATIENTS[0], CAL_PATIENTS[1]],
      appointments: [
        calAppointment('appt-x', 'prov-a', 'patient-a', 10, 8, 'service-1'),
        calAppointment('appt-y', 'prov-a', 'patient-b', 10, 9, 'service-2'),
      ],
    });
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/08:00 Limpieza — Paciente A/)).toBeInTheDocument()
    );

    // El control conserva el universo del mes: X e Y siguen como controles.
    expect(serviceEntry('Limpieza')).toHaveAttribute('aria-pressed', 'true');
    expect(serviceEntry('Ortodoncia')).toHaveAttribute('aria-pressed', 'false');
    expect(
      calendarBlock(/09:00 Ortodoncia — Paciente B/)
    ).not.toBeInTheDocument();
  });

  it('3.6 la fila con el control de servicios es usable y conserva el layout', async () => {
    global.fetch = buildCalendarFetch({
      services: CAL_SERVICES,
      providers: [CAL_PROVIDERS[0]],
      patients: [CAL_PATIENTS[0], CAL_PATIENTS[1]],
      appointments: [
        calAppointment('appt-x', 'prov-a', 'patient-a', 10, 8, 'service-1'),
        calAppointment('appt-y', 'prov-a', 'patient-b', 10, 9, 'service-2'),
      ],
    });
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);

    expect(screen.getByText('Servicios:')).toBeInTheDocument();
    expect(legendEntry(/Dra\. Ana/)).toBeInTheDocument();

    const nav = screen.getByRole('button', { name: 'Mes anterior' });
    const row = nav.parentElement!.parentElement!;
    expect(row.className).toContain('flex-col');
    expect(row.className).toContain('gap-4');
    expect(row.className).toContain('sm:flex-row');
    expect(row.className).toContain('sm:items-center');
    expect(row.className).toContain('sm:justify-between');
  });

  it('3.7 el centinela serviceId=all se parsea a "todos"', async () => {
    searchParamsRef.value = new URLSearchParams('serviceId=all');
    global.fetch = buildCalendarFetch({
      services: CAL_SERVICES,
      providers: [CAL_PROVIDERS[0]],
      patients: [CAL_PATIENTS[0], CAL_PATIENTS[1]],
      appointments: [
        calAppointment('appt-x', 'prov-a', 'patient-a', 10, 8, 'service-1'),
        calAppointment('appt-y', 'prov-a', 'patient-b', 10, 9, 'service-2'),
      ],
    });
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/09:00 Ortodoncia — Paciente B/)).toBeInTheDocument()
    );

    expect(
      screen.getByText('Mostrando todos los servicios')
    ).toBeInTheDocument();
    expect(serviceEntry('Limpieza')).toHaveAttribute('aria-pressed', 'true');
    expect(serviceEntry('Ortodoncia')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'all' })).not.toBeInTheDocument();
  });
  it('13.1 alternar servicios consecutivos escribe la unión en orden sin repetir la última', async () => {
    global.fetch = buildCalendarFetch({
      services: CAL_SERVICES,
      providers: [CAL_PROVIDERS[0]],
      patients: CAL_PATIENTS,
      appointments: [
        calAppointment('appt-x', 'prov-a', 'patient-a', 10, 8, 'service-1'),
        calAppointment('appt-y', 'prov-a', 'patient-b', 10, 9, 'service-2'),
        calAppointment('appt-z', 'prov-a', 'patient-c', 10, 10, 'service-3'),
      ],
    });
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/10:00 Revisión — Paciente C/)).toBeInTheDocument()
    );

    // Desactivar Z -> selección [X, Y].
    await user.click(serviceEntry('Revisión'));
    await waitFor(() =>
      expect(replaceMock).toHaveBeenLastCalledWith(
        '/appointments?serviceId=service-1,service-2'
      )
    );

    // Reactivar Z -> [X, Y, Z] equivale a "todos" -> se guarda [].
    await user.click(serviceEntry('Revisión'));
    await waitFor(() =>
      expect(replaceMock).toHaveBeenLastCalledWith('/appointments')
    );

    // Desactivar X -> [Y, Z].
    await user.click(serviceEntry('Limpieza'));
    await waitFor(() =>
      expect(replaceMock).toHaveBeenLastCalledWith(
        '/appointments?serviceId=service-2,service-3'
      )
    );

    expect(replaceMock.mock.calls.map((call) => call[0])).toEqual([
      '/appointments?serviceId=service-1,service-2',
      '/appointments',
      '/appointments?serviceId=service-2,service-3',
    ]);
  });

  it('13.1 "Limpiar filtros" con solo servicio activo deja la URL en /appointments', async () => {
    global.fetch = buildCalendarFetch({
      services: CAL_SERVICES,
      providers: [CAL_PROVIDERS[0]],
      patients: [CAL_PATIENTS[0], CAL_PATIENTS[1]],
      appointments: [
        calAppointment('appt-x', 'prov-a', 'patient-a', 10, 8, 'service-1'),
        calAppointment('appt-y', 'prov-a', 'patient-b', 10, 9, 'service-2'),
      ],
    });
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await openCalendar(user);
    await waitFor(() =>
      expect(calendarBlock(/09:00 Ortodoncia — Paciente B/)).toBeInTheDocument()
    );

    await user.click(serviceEntry('Ortodoncia'));
    await waitFor(() =>
      expect(replaceMock).toHaveBeenLastCalledWith(
        '/appointments?serviceId=service-1'
      )
    );

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    await waitFor(() =>
      expect(replaceMock).toHaveBeenLastCalledWith('/appointments')
    );
    expect(calendarBlock(/09:00 Ortodoncia — Paciente B/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Paginación server-side de la lista de citas (issue #168).
// ---------------------------------------------------------------------------
function listParamsCalls(fetchMock: ReturnType<typeof buildFetchMock>) {
  return fetchMock.mock.calls
    .map((call) => call[0])
    .filter(
      (url): url is string =>
        typeof url === 'string' && url.startsWith('/api/admin/appointments?')
    )
    .map((url) => new URLSearchParams(url.split('?')[1]));
}

function lastListParams(fetchMock: ReturnType<typeof buildFetchMock>) {
  const calls = listParamsCalls(fetchMock);
  return calls.length > 0 ? calls[calls.length - 1] : null;
}

function buildPaginatedFetch({
  appointments = [],
  total = appointments.length,
  page = 1,
  pageSize = 20,
}: {
  appointments?: unknown[];
  total?: number;
  page?: number;
  pageSize?: number;
} = {}) {
  const fetchMock = buildFetchMock();
  fetchMock.mockImplementation((url: string) => {
    if (url.startsWith('/api/admin/appointments')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            appointments,
            pagination: {
              total,
              page,
              pageSize,
              totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
            },
          }),
      });
    }
    return buildFetchMock()(url);
  });
  return fetchMock;
}

describe('/appointments list pagination', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => false);
    searchParamsRef.value = new URLSearchParams();
    replaceMock.mockClear();
  });

  async function renderList(fetchMock: ReturnType<typeof buildFetchMock>) {
    global.fetch = fetchMock;
    const user = userEvent.setup();
    render(<AppointmentsPage />);
    await screen.findByRole('option', { name: 'Limpieza' });
    return user;
  }

  it('sends page, pageSize and the canonical sort in list mode', async () => {
    const fetchMock = buildPaginatedFetch({
      appointments: [BASE_APPOINTMENT],
      total: 1,
    });
    await renderList(fetchMock);

    await waitFor(() => expect(lastListParams(fetchMock)).not.toBeNull());
    const params = lastListParams(fetchMock)!;
    expect(params.get('page')).toBe('1');
    expect(params.get('pageSize')).toBe('20');
    expect(params.get('sort')).toBe('start_at');
    expect(params.get('sortDir')).toBe('asc');
  });

  it('forwards the list filters to the server', async () => {
    const fetchMock = buildPaginatedFetch({
      appointments: [BASE_APPOINTMENT],
      total: 100,
    });
    const user = await renderList(fetchMock);
    const serviceSelect = screen.getByRole('combobox', { name: 'Servicio' }) as HTMLSelectElement;
    const providerSelect = screen.getByRole('combobox', { name: 'Proveedor' }) as HTMLSelectElement;
    const patientInput = screen.getByRole('combobox', { name: 'Paciente' });

    await user.selectOptions(serviceSelect, SERVICE_ID);
    await user.selectOptions(providerSelect, PROVIDER_ID);
    await user.click(patientInput);
    await user.type(patientInput, 'Pac');
    const patientOption = await screen.findByRole(
      'option',
      { name: 'Paciente A' },
      { timeout: 3000 }
    );
    await user.click(within(patientOption).getByRole('button'));

    await waitFor(() => {
      const params = lastListParams(fetchMock)!;
      expect(params.get('serviceId')).toBe(SERVICE_ID);
      expect(params.get('patientId')).toBe(PATIENT_ID);
      expect(params.get('providerId')).toBe(PROVIDER_ID);
    });
  });

  it('sends the date range as start/end only when both bounds are set', async () => {
    const fetchMock = buildPaginatedFetch({
      appointments: [BASE_APPOINTMENT],
      total: 100,
    });
    global.fetch = fetchMock;
    const { container } = render(<AppointmentsPage />);
    await screen.findByRole('option', { name: 'Limpieza' });

    const [fromInput, toInput] = Array.from(
      container.querySelectorAll('input[type="date"]')
    ) as HTMLInputElement[];

    fireEvent.change(fromInput, { target: { value: '2026-09-01' } });
    fireEvent.change(toInput, { target: { value: '2026-09-30' } });

    await waitFor(() => {
      const params = lastListParams(fetchMock)!;
      expect(params.get('start')).toBe('2026-09-01T00:00:00.000Z');
      expect(params.get('end')).toBe('2026-09-30T23:59:59.999Z');
    });
  });

  it('resets the page to 1 and drops page from the URL when a filter changes', async () => {
    searchParamsRef.value = new URLSearchParams('page=3');
    const fetchMock = buildPaginatedFetch({
      appointments: [BASE_APPOINTMENT],
      total: 100,
      page: 3,
    });
    const user = await renderList(fetchMock);

    await waitFor(() =>
      expect(lastListParams(fetchMock)!.get('page')).toBe('3')
    );

    await user.selectOptions(screen.getByRole('combobox', { name: 'Servicio' }), SERVICE_ID);

    await waitFor(() => {
      const params = lastListParams(fetchMock)!;
      expect(params.get('page')).toBe('1');
      expect(params.get('serviceId')).toBe(SERVICE_ID);
    });
    expect(replaceMock).toHaveBeenCalledWith('/appointments');
  });

  it('resets the page to 1 when the sort field changes', async () => {
    searchParamsRef.value = new URLSearchParams('page=3');
    const fetchMock = buildPaginatedFetch({
      appointments: [BASE_APPOINTMENT],
      total: 100,
      page: 3,
    });
    const user = await renderList(fetchMock);

    await waitFor(() =>
      expect(lastListParams(fetchMock)!.get('page')).toBe('3')
    );

    await user.click(screen.getByRole('button', { name: 'Fin' }));

    await waitFor(() => {
      const params = lastListParams(fetchMock)!;
      expect(params.get('page')).toBe('1');
      expect(params.get('sort')).toBe('end_at');
    });
    expect(replaceMock).toHaveBeenCalledWith('/appointments');
  });

  it('initializes the page from ?page=2 and requests page 2', async () => {
    searchParamsRef.value = new URLSearchParams('page=2');
    const fetchMock = buildPaginatedFetch({
      appointments: [BASE_APPOINTMENT],
      total: 100,
      page: 2,
    });
    await renderList(fetchMock);

    await waitFor(() =>
      expect(lastListParams(fetchMock)!.get('page')).toBe('2')
    );
    expect(
      await screen.findByText('Página 2 de 5 (100 resultados)')
    ).toBeInTheDocument();
  });

  it('writes ?page=3 with router.replace when advancing a page', async () => {
    searchParamsRef.value = new URLSearchParams('page=2');
    const fetchMock = buildPaginatedFetch({
      appointments: [BASE_APPOINTMENT],
      total: 100,
      page: 2,
    });
    const user = await renderList(fetchMock);

    await user.click(
      await screen.findByRole('button', { name: 'Ir a la página siguiente' })
    );

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith('/appointments?page=3')
    );
    await waitFor(() =>
      expect(lastListParams(fetchMock)!.get('page')).toBe('3')
    );
  });

  it('does not rewrite the URL when the first page action is at its bound', async () => {
    const fetchMock = buildPaginatedFetch({
      appointments: [BASE_APPOINTMENT],
      total: 100,
      page: 1,
    });
    const user = await renderList(fetchMock);

    const firstButton = await screen.findByRole('button', {
      name: 'Ir a la primera página',
    });
    expect(firstButton).toBeDisabled();
    await user.click(firstButton);

    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('disables next/last on the last page', async () => {
    searchParamsRef.value = new URLSearchParams('page=5');
    const fetchMock = buildPaginatedFetch({
      appointments: [BASE_APPOINTMENT],
      total: 100,
      page: 5,
    });
    await renderList(fetchMock);

    expect(
      await screen.findByRole('button', { name: 'Ir a la página siguiente' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Ir a la última página' })
    ).toBeDisabled();
  });

  it('shows the out-of-range empty state and keeps pagination visible', async () => {
    searchParamsRef.value = new URLSearchParams('page=9');
    const fetchMock = buildPaginatedFetch({
      appointments: [],
      total: 5,
      page: 9,
    });
    await renderList(fetchMock);

    expect(
      await screen.findByText('No hay citas en esta página.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Paginación de citas' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ir a la primera página' })
    ).toBeEnabled();
    expect(screen.queryAllByRole('row')).toHaveLength(0);
  });

  it('shows the no-appointments empty state when there is no data at all', async () => {
    const fetchMock = buildPaginatedFetch({ appointments: [], total: 0 });
    await renderList(fetchMock);

    expect(
      await screen.findByText('No hay citas registradas.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('shows the no-matches empty state when filters are active', async () => {
    const fetchMock = buildPaginatedFetch({ appointments: [], total: 0 });
    const user = await renderList(fetchMock);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Servicio' }), SERVICE_ID);

    expect(
      await screen.findByText('No hay citas que coincidan con los filtros.')
    ).toBeInTheDocument();
  });

  it('preserves the calendar providerId/serviceId when changing page', async () => {
    searchParamsRef.value = new URLSearchParams(
      'page=2&providerId=prov-a&serviceId=service-1'
    );
    const fetchMock = buildPaginatedFetch({
      appointments: [BASE_APPOINTMENT],
      total: 100,
      page: 2,
    });
    const user = await renderList(fetchMock);

    await user.click(
      await screen.findByRole('button', { name: 'Ir a la página siguiente' })
    );

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        '/appointments?page=3&providerId=prov-a&serviceId=service-1'
      )
    );
  });

  it('preserves the page when toggling Lista <-> Calendario without filter changes', async () => {
    searchParamsRef.value = new URLSearchParams('page=2');
    const fetchMock = buildPaginatedFetch({
      appointments: [BASE_APPOINTMENT],
      total: 100,
      page: 2,
    });
    const user = await renderList(fetchMock);

    await screen.findByText('Página 2 de 5 (100 resultados)');
    const replaceCallsBefore = replaceMock.mock.calls.length;

    await user.click(screen.getByRole('button', { name: /^Calendario$/ }));
    await waitFor(
      () => {
        expect(screen.getAllByTestId('weekday-label')).toHaveLength(7);
      },
      { timeout: 10000 }
    );
    await user.click(screen.getByRole('button', { name: /^Lista$/ }));

    await waitFor(() =>
      expect(lastListParams(fetchMock)!.get('page')).toBe('2')
    );
    expect(
      await screen.findByText('Página 2 de 5 (100 resultados)')
    ).toBeInTheDocument();
    expect(replaceMock.mock.calls.length).toBe(replaceCallsBefore);
  });
});

// ---------------------------------------------------------------------------
// Filtro de paciente con autocompletado en la lista (issue #169).
// ---------------------------------------------------------------------------
const SEARCH_CATALOG = [
  { id: PATIENT_ID, fullName: 'Paciente A' },
  { id: 'patient-z', fullName: 'Paciente Z' },
];

function buildPatientSearchFetch({
  appointments = [BASE_APPOINTMENT],
  total = appointments.length,
  page = 1,
}: {
  appointments?: unknown[];
  total?: number;
  page?: number;
} = {}) {
  const ok = (body: unknown) =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  return vi.fn().mockImplementation((url: string) => {
    if (url.startsWith('/api/admin/appointments')) {
      return ok({
        appointments,
        pagination: {
          total,
          page,
          pageSize: 20,
          totalPages: Math.ceil(total / 20),
        },
      });
    }
    if (url.startsWith('/api/admin/patients?')) {
      const q = (
        new URLSearchParams(url.split('?')[1]).get('q') ?? ''
      ).toLowerCase();
      const matches = SEARCH_CATALOG.filter((patient) =>
        patient.fullName.toLowerCase().includes(q)
      );
      return ok({
        patients: matches,
        page: 1,
        pageSize: 20,
        total: matches.length,
        totalPages: 1,
      });
    }
    if (url === '/api/admin/patients') return ok({ patients: SEARCH_CATALOG });
    if (url === '/api/admin/providers') {
      return ok({ providers: [{ id: PROVIDER_ID, name: 'Dra. Ana', color: '#1f77b4' }] });
    }
    if (url === '/api/admin/services') {
      return ok({ services: [{ id: SERVICE_ID, name: 'Limpieza' }] });
    }
    return ok({});
  });
}

async function selectPatientSuggestion(
  user: ReturnType<typeof userEvent.setup>,
  query: string,
  name: string
) {
  const input = screen.getByRole('combobox', { name: 'Paciente' });
  await user.click(input);
  await user.type(input, query);
  const option = await screen.findByRole('option', { name }, { timeout: 3000 });
  await user.click(within(option).getByRole('button'));
}

describe('/appointments patient autocomplete filter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => false);
    searchParamsRef.value = new URLSearchParams();
    replaceMock.mockClear();
  });

  it('3.1 seleccionar una sugerencia envía patientId y solicita la página 1', async () => {
    searchParamsRef.value = new URLSearchParams('page=3');
    const fetchMock = buildPatientSearchFetch({ total: 100, page: 3 });
    global.fetch = fetchMock;
    const user = userEvent.setup();
    render(<AppointmentsPage />);

    await waitFor(() => expect(lastListParams(fetchMock)!.get('page')).toBe('3'));

    await selectPatientSuggestion(user, 'Pac', 'Paciente A');

    await waitFor(() => {
      const params = lastListParams(fetchMock)!;
      expect(params.get('patientId')).toBe(PATIENT_ID);
      expect(params.get('page')).toBe('1');
    });
    expect(screen.getByRole('combobox', { name: 'Paciente' })).toHaveValue(
      'Paciente A'
    );
  });

  it('3.2 la limpieza con ✕ quita patientId y deja el campo vacío', async () => {
    const fetchMock = buildPatientSearchFetch();
    global.fetch = fetchMock;
    const user = userEvent.setup();
    render(<AppointmentsPage />);
    await screen.findByRole('option', { name: 'Limpieza' });

    await selectPatientSuggestion(user, 'Pac', 'Paciente A');
    await waitFor(() =>
      expect(lastListParams(fetchMock)!.get('patientId')).toBe(PATIENT_ID)
    );

    await user.click(screen.getByRole('button', { name: 'Limpiar paciente' }));

    await waitFor(() => {
      expect(lastListParams(fetchMock)!.get('patientId')).toBeNull();
    });
    expect(screen.getByRole('combobox', { name: 'Paciente' })).toHaveValue('');
  });

  it('3.2 "Limpiar filtros" quita patientId y deja el campo vacío', async () => {
    const fetchMock = buildPatientSearchFetch();
    global.fetch = fetchMock;
    const user = userEvent.setup();
    render(<AppointmentsPage />);
    await screen.findByRole('option', { name: 'Limpieza' });

    await selectPatientSuggestion(user, 'Pac', 'Paciente A');
    await waitFor(() =>
      expect(lastListParams(fetchMock)!.get('patientId')).toBe(PATIENT_ID)
    );

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    await waitFor(() => {
      expect(lastListParams(fetchMock)!.get('patientId')).toBeNull();
    });
    expect(screen.getByRole('combobox', { name: 'Paciente' })).toHaveValue('');
  });

  it('3.3 el formulario de cita conserva el catálogo completo', async () => {
    const fetchMock = buildPatientSearchFetch();
    global.fetch = fetchMock;
    const user = userEvent.setup();
    render(<AppointmentsPage />);
    await screen.findByRole('option', { name: 'Limpieza' });

    await user.click(screen.getByRole('button', { name: 'Nueva cita' }));

    const formSelect = screen.getByDisplayValue('Sin paciente') as HTMLSelectElement;
    expect(
      within(formSelect).getByRole('option', { name: 'Paciente A' })
    ).toBeInTheDocument();
    expect(
      within(formSelect).getByRole('option', { name: 'Paciente Z' })
    ).toBeInTheDocument();
  });

  it('3.7 combina el paciente con servicio, proveedor y rango de fechas', async () => {
    const fetchMock = buildPatientSearchFetch({ total: 100 });
    global.fetch = fetchMock;
    const user = userEvent.setup();
    const { container } = render(<AppointmentsPage />);
    await screen.findByRole('option', { name: 'Limpieza' });

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Servicio' }),
      SERVICE_ID
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Proveedor' }),
      PROVIDER_ID
    );
    const [fromInput, toInput] = Array.from(
      container.querySelectorAll('input[type="date"]')
    ) as HTMLInputElement[];
    fireEvent.change(fromInput, { target: { value: '2026-09-01' } });
    fireEvent.change(toInput, { target: { value: '2026-09-30' } });

    await selectPatientSuggestion(user, 'Pac', 'Paciente A');

    await waitFor(() => {
      const params = lastListParams(fetchMock)!;
      expect(params.get('patientId')).toBe(PATIENT_ID);
      expect(params.get('serviceId')).toBe(SERVICE_ID);
      expect(params.get('providerId')).toBe(PROVIDER_ID);
      expect(params.get('start')).toBe('2026-09-01T00:00:00.000Z');
      expect(params.get('end')).toBe('2026-09-30T23:59:59.999Z');
      expect(params.get('page')).toBe('1');
    });
  });

  it('3.7 limpiar el paciente no altera los demás filtros', async () => {
    const fetchMock = buildPatientSearchFetch({ total: 100 });
    global.fetch = fetchMock;
    const user = userEvent.setup();
    render(<AppointmentsPage />);
    await screen.findByRole('option', { name: 'Limpieza' });

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Servicio' }),
      SERVICE_ID
    );
    await selectPatientSuggestion(user, 'Pac', 'Paciente A');
    await waitFor(() =>
      expect(lastListParams(fetchMock)!.get('patientId')).toBe(PATIENT_ID)
    );

    await user.click(screen.getByRole('button', { name: 'Limpiar paciente' }));

    await waitFor(() => {
      const params = lastListParams(fetchMock)!;
      expect(params.get('patientId')).toBeNull();
      expect(params.get('serviceId')).toBe(SERVICE_ID);
    });
    expect(screen.getByRole('combobox', { name: 'Servicio' })).toHaveValue(
      SERVICE_ID
    );
  });

  it('3.7 cambiar Lista ↔ Calendario conserva el filtro de paciente', async () => {
    const fetchMock = buildPatientSearchFetch();
    global.fetch = fetchMock;
    const user = userEvent.setup();
    render(<AppointmentsPage />);
    await screen.findByRole('option', { name: 'Limpieza' });

    await selectPatientSuggestion(user, 'Pac', 'Paciente A');
    await waitFor(() =>
      expect(lastListParams(fetchMock)!.get('patientId')).toBe(PATIENT_ID)
    );

    await user.click(screen.getByRole('button', { name: /^Calendario$/ }));
    await waitFor(
      () => {
        expect(screen.getAllByTestId('weekday-label')).toHaveLength(7);
      },
      { timeout: 10000 }
    );
    await user.click(screen.getByRole('button', { name: /^Lista$/ }));

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Paciente' })).toHaveValue(
        'Paciente A'
      );
      expect(lastListParams(fetchMock)!.get('patientId')).toBe(PATIENT_ID);
    });
  });
});
