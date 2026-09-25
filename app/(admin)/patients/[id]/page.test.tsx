import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PatientRecordPage from './page';

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const VISIT_ID = '660e8400-e29b-41d4-a716-446655440000';

const BASE_PATIENT = {
  id: PATIENT_ID,
  fullName: 'Juan Pérez',
  phoneE164: '+5215512345678',
  email: 'juan@example.com',
  notes: null,
  birthDate: null,
  sex: null,
  address: null,
  occupation: null,
  referralSource: null,
  secondaryPhone: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  emergencyContactRelationship: null,
  createdAt: '2026-09-01T10:00:00Z',
  updatedAt: '2026-09-01T10:00:00Z',
};

const BASE_RECORD = {
  patient: BASE_PATIENT,
  upcomingAppointments: [],
  attendedAppointments: [],
};

const EMPTY_HISTORY = {
  patientId: PATIENT_ID,
  allergies: [],
  systemicConditions: [],
  medications: [],
  pregnancyStatus: null,
  coagulationDisorders: null,
  anticoagulants: null,
  surgeries: null,
  infectiousDiseases: null,
  smoking: null,
  alcohol: null,
  dentalHistory: null,
  oralHabits: [],
  clinicalNotes: null,
  createdAt: '2026-09-01T10:00:00Z',
  updatedAt: '2026-09-01T10:00:00Z',
};

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: PATIENT_ID }),
}));

function buildFetchMock(overrides: {
  record?: Record<string, unknown>;
  history?: Record<string, unknown>;
  visits?: Record<string, unknown>[];
} = {}) {
  const record = overrides.record ?? BASE_RECORD;
  const history = overrides.history ?? EMPTY_HISTORY;
  const visits = overrides.visits ?? [];

  return vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
    const urlString = url.toString();

    if (urlString === `/api/admin/patients/${PATIENT_ID}/record` && !init?.method) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ record }) });
    }

    if (urlString === `/api/admin/patients/${PATIENT_ID}/medical-history` && !init?.method) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ medicalHistory: history }) });
    }

    if (urlString === `/api/admin/patients/${PATIENT_ID}/clinical-visits` && !init?.method) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ clinicalVisits: visits }) });
    }

    if (urlString === `/api/admin/patients/${PATIENT_ID}/clinical-visits` && init?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            clinicalVisit: {
              id: VISIT_ID,
              patientId: PATIENT_ID,
              subjective: 'Dolor de muela',
              objective: null,
              assessment: null,
              plan: null,
              treatment: null,
              notes: null,
              createdAt: '2026-09-02T10:00:00Z',
              updatedAt: '2026-09-02T10:00:00Z',
            },
          }),
      });
    }

    if (urlString === `/api/admin/patients/${PATIENT_ID}` && init?.method === 'PATCH') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ patient: { ...BASE_PATIENT, ...JSON.parse(init.body as string) } }) });
    }

    if (urlString === `/api/admin/patients/${PATIENT_ID}/medical-history` && init?.method === 'PUT') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ medicalHistory: { ...history, ...JSON.parse(init.body as string) } }) });
    }

    return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('Not found') });
  });
}

describe('/patients/[id] clinical record UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
  });

  it('renders tabs Datos, Historia, Consultas and Citas', async () => {
    global.fetch = buildFetchMock();
    render(<PatientRecordPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Datos' })).toBeInTheDocument();
    });

    expect(screen.getByRole('tab', { name: 'Historia' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Consultas' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Citas' })).toBeInTheDocument();
  });

  it('shows a red warning badge when the patient has allergies', async () => {
    const user = userEvent.setup();
    global.fetch = buildFetchMock({
      history: { ...EMPTY_HISTORY, allergies: ['penicilina'] },
    });
    render(<PatientRecordPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Historia' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Historia' }));

    await waitFor(() => {
      expect(screen.getByText(/advertencia/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Alergias registradas')).toBeInTheDocument();
  });

  it('shows a red warning badge when the patient has systemic conditions', async () => {
    const user = userEvent.setup();
    global.fetch = buildFetchMock({
      history: { ...EMPTY_HISTORY, systemicConditions: ['diabetes'] },
    });
    render(<PatientRecordPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Historia' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Historia' }));

    await waitFor(() => {
      expect(screen.getByText(/advertencia/i)).toBeInTheDocument();
    });
  });

  it('does not show a warning badge when there are no allergies or systemic conditions', async () => {
    const user = userEvent.setup();
    global.fetch = buildFetchMock({ history: EMPTY_HISTORY });
    render(<PatientRecordPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Historia' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Historia' }));

    expect(screen.queryByText(/advertencia/i)).not.toBeInTheDocument();
  });

  it('renders placeholders for empty ficha fields in the Datos tab', async () => {
    const user = userEvent.setup();
    global.fetch = buildFetchMock();
    render(<PatientRecordPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Datos' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Datos' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Fecha de nacimiento')).toBeInTheDocument();
    });

    const birthDateInput = screen.getByLabelText('Fecha de nacimiento') as HTMLInputElement;
    expect(birthDateInput.value).toBe('');

    const addressInput = screen.getByLabelText('Dirección') as HTMLInputElement;
    expect(addressInput.value).toBe('');

    const occupationInput = screen.getByLabelText('Ocupación') as HTMLInputElement;
    expect(occupationInput.value).toBe('');
  });

  it('persists ficha changes through PATCH when saving the Datos tab', async () => {
    const user = userEvent.setup();
    const fetchMock = buildFetchMock();
    global.fetch = fetchMock;
    render(<PatientRecordPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Datos' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Datos' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Dirección')).toBeInTheDocument();
    });

    await user.clear(screen.getByLabelText('Dirección'));
    await user.type(screen.getByLabelText('Dirección'), 'Av. Reforma 123');

    await user.click(screen.getByRole('button', { name: /guardar datos/i }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === `/api/admin/patients/${PATIENT_ID}` && init?.method === 'PATCH'
      );
      expect(patchCall).toBeDefined();
      expect(JSON.parse(patchCall![1].body as string)).toMatchObject({
        address: 'Av. Reforma 123',
      });
    });
  });

  it('persists medical history changes through PUT when saving the Historia tab', async () => {
    const user = userEvent.setup();
    const fetchMock = buildFetchMock();
    global.fetch = fetchMock;
    render(<PatientRecordPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Historia' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Historia' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Alergias')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Alergias'), 'Penicilina');

    await user.click(screen.getByRole('button', { name: /guardar historia/i }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === `/api/admin/patients/${PATIENT_ID}/medical-history` && init?.method === 'PUT'
      );
      expect(putCall).toBeDefined();
      expect(JSON.parse(putCall![1].body as string)).toMatchObject({
        allergies: ['Penicilina'],
      });
    });
  });

  it('lists clinical visits in the Consultas tab and allows creating a new one', async () => {
    const user = userEvent.setup();
    const fetchMock = buildFetchMock({
      visits: [
        {
          id: VISIT_ID,
          patientId: PATIENT_ID,
          subjective: 'Dolor persistente',
          objective: 'Caries profunda',
          assessment: 'Tratamiento de conducto',
          plan: 'Endodoncia',
          treatment: null,
          notes: null,
          createdAt: '2026-09-02T10:00:00Z',
          updatedAt: '2026-09-02T10:00:00Z',
        },
      ],
    });
    global.fetch = fetchMock;
    render(<PatientRecordPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Consultas' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Consultas' }));

    await waitFor(() => {
      expect(screen.getByText('Dolor persistente')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /nueva consulta/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Subjetivo')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Subjetivo'), 'Dolor de muela');
    await user.click(screen.getByRole('button', { name: /guardar consulta/i }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === `/api/admin/patients/${PATIENT_ID}/clinical-visits` && init?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      expect(JSON.parse(postCall![1].body as string)).toMatchObject({
        subjective: 'Dolor de muela',
      });
    });
  });

  it('keeps the Citas tab using the existing record endpoint', async () => {
    const user = userEvent.setup();
    const fetchMock = buildFetchMock({
      record: {
        ...BASE_RECORD,
        upcomingAppointments: [
          {
            id: 'appt-1',
            patientId: PATIENT_ID,
            serviceId: 'svc-1',
            providerId: 'prov-1',
            startAt: '2026-09-10T14:00:00Z',
            endAt: '2026-09-10T14:30:00Z',
            status: 'confirmed',
            notes: null,
            serviceName: 'Limpieza',
            providerName: 'Dra. Ana',
          },
        ],
      },
    });
    global.fetch = fetchMock;
    render(<PatientRecordPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Citas' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Citas' }));

    await waitFor(() => {
      expect(screen.getByText('Limpieza')).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(`/api/admin/patients/${PATIENT_ID}/record`);
  });
});
