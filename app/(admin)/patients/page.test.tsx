import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PatientsPage from './page';

const { replaceMock, searchParamsRef } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  searchParamsRef: { value: new URLSearchParams() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParamsRef.value,
}));

const PLACEHOLDER = 'Buscar paciente por nombre, teléfono o correo';
const SUGGESTIONS_LABEL = 'Sugerencias de pacientes';

type PatientRow = {
  id: string;
  fullName: string;
  phoneE164: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

function makePatient(
  overrides: Partial<PatientRow> & { id: string; fullName: string }
): PatientRow {
  return {
    phoneE164: null,
    email: null,
    notes: null,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    ...overrides,
  };
}

const CRUD_PATIENTS: PatientRow[] = [
  makePatient({ id: 'pat-email', fullName: 'María García', email: 'maria@example.com' }),
];

function makeManyPatients(count: number): PatientRow[] {
  return Array.from({ length: count }, (_, index) =>
    makePatient({
      id: `pac-${index + 1}`,
      fullName: `Paciente ${String(index + 1).padStart(2, '0')}`,
      phoneE164: `+521550000${String(index + 1).padStart(4, '0')}`,
    })
  );
}

function apiResponse(patients: PatientRow[], page: number, pageSize: number) {
  const total = patients.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  return {
    patients: patients.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    totalPages,
  };
}

let currentPatients: PatientRow[] = CRUD_PATIENTS;
let fetchMock: ReturnType<typeof vi.fn>;

function installFetchMock() {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? 'GET';
    if (url.startsWith('/api/admin/patients')) {
      if (method === 'GET') {
        const parsed = new URL(url, 'http://localhost');
        const q = (parsed.searchParams.get('q') ?? '').trim().toLowerCase();
        const page = Number(parsed.searchParams.get('page') ?? '1');
        const pageSize = Number(parsed.searchParams.get('pageSize') ?? '20');
        const filtered = q
          ? currentPatients.filter((patient) =>
              [patient.fullName, patient.phoneE164, patient.email].some(
                (value) => value != null && value.toLowerCase().includes(q)
              )
            )
          : currentPatients;
        return Response.json(apiResponse(filtered, page, pageSize));
      }
      if (method === 'POST') {
        return Response.json({ patient: currentPatients[0] }, { status: 201 });
      }
      if (method === 'PATCH') {
        return Response.json({ patient: currentPatients[0] });
      }
      if (method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
    }
    return new Response('Not found', { status: 404 });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
}

function listCalls() {
  return fetchMock.mock.calls.filter(([, init]) => !(init as RequestInit | undefined)?.method);
}

function listUrls(): string[] {
  return listCalls().map(([url]) => url.toString());
}

function searchInput() {
  return screen.getByPlaceholderText(PLACEHOLDER);
}

// Con una búsqueda activa el nombre también aparece en la lista de
// sugerencias; la tabla se consulta por separado.
function table() {
  return screen.getByRole('table');
}

async function renderWithInitialLoad() {
  render(<PatientsPage />);
  await screen.findByText(CRUD_PATIENTS[0].fullName);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  replaceMock.mockReset();
  // La navegación del cliente actualizaría `searchParams`: reproducirlo hace
  // significativo el guard de reescritura redundante de la página.
  replaceMock.mockImplementation((url: string) => {
    const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
    searchParamsRef.value = new URLSearchParams(query);
  });
  searchParamsRef.value = new URLSearchParams();
  currentPatients = CRUD_PATIENTS;
  installFetchMock();
  window.alert = vi.fn();
  window.confirm = vi.fn(() => true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('/patients CRUD regression', () => {
  it('shows email-only patients without rendering a missing phone as a value', async () => {
    await renderWithInitialLoad();

    expect(screen.getByText('maria@example.com')).toBeInTheDocument();
    expect(screen.getAllByText('-')).toHaveLength(2);
  });

  it('links each patient to the patient record page', async () => {
    render(<PatientsPage />);

    const link = await screen.findByRole('link', { name: /Ver expediente de María García/ });
    expect(link).toHaveAttribute('href', '/patients/pat-email');
  });

  it('submits an email-only patient with a null phone', async () => {
    const user = userEvent.setup();
    await renderWithInitialLoad();

    await user.click(screen.getByRole('button', { name: 'Nuevo paciente' }));
    await user.type(screen.getByLabelText('Nombre completo'), 'Ana Pérez');
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
    await user.click(screen.getByRole('button', { name: 'Crear paciente' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) => url === '/api/admin/patients' && init?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      expect(JSON.parse(postCall![1].body)).toMatchObject({
        fullName: 'Ana Pérez',
        phoneE164: null,
        email: 'ana@example.com',
      });
    });
  });
});

describe('/patients search debounce', () => {
  it('does not query the server when the text stays below the minimum', async () => {
    await renderWithInitialLoad();
    fetchMock.mockClear();

    fireEvent.change(searchInput(), { target: { value: 'M' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(listCalls()).toHaveLength(0);
  });

  it('queries once after a 300 ms pause with two or more characters', async () => {
    await renderWithInitialLoad();
    fetchMock.mockClear();

    fireEvent.change(searchInput(), { target: { value: 'ma' } });
    expect(listCalls()).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(listCalls()).toHaveLength(1);
    });
    expect(listUrls()[0]).toContain('q=ma');
  });

  it('collapses rapid typing into a single request', async () => {
    await renderWithInitialLoad();
    fetchMock.mockClear();

    const input = searchInput();
    fireEvent.change(input, { target: { value: 'm' } });
    fireEvent.change(input, { target: { value: 'ma' } });
    fireEvent.change(input, { target: { value: 'mar' } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(listCalls()).toHaveLength(1);
    });
    expect(listUrls()[0]).toContain('q=mar');
  });
});

describe('/patients suggestions', () => {
  const SUGGESTION_PATIENTS: PatientRow[] = [
    makePatient({ id: 'ana-1', fullName: 'Ana López', phoneE164: '+5215511111111' }),
    makePatient({ id: 'ana-2', fullName: 'Ana María Ruiz', phoneE164: '+5215522222222' }),
  ];

  it('renders suggestions with name and phone after the debounce', async () => {
    currentPatients = SUGGESTION_PATIENTS;
    render(<PatientsPage />);
    await screen.findByText('Ana López');

    fireEvent.change(searchInput(), { target: { value: 'ana' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    const list = await screen.findByLabelText(SUGGESTIONS_LABEL);
    expect(within(list).getByText('Ana López')).toBeInTheDocument();
    expect(within(list).getByText('+5215511111111')).toBeInTheDocument();
    expect(within(list).getByText('Ana María Ruiz')).toBeInTheDocument();
  });

  it('does not render suggestions when there are no matches', async () => {
    await renderWithInitialLoad();

    fireEvent.change(searchInput(), { target: { value: 'zzzz' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    await screen.findByText('Sin coincidencias para esta búsqueda.');
    expect(screen.queryByLabelText(SUGGESTIONS_LABEL)).not.toBeInTheDocument();
  });

  it('selecting a suggestion shows only that patient', async () => {
    const user = userEvent.setup();
    currentPatients = SUGGESTION_PATIENTS;
    render(<PatientsPage />);
    await screen.findByText('Ana López');

    fireEvent.change(searchInput(), { target: { value: 'ana' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    const list = await screen.findByLabelText(SUGGESTIONS_LABEL);
    await user.click(within(list).getByRole('button', { name: /Ana López/ }));

    await waitFor(() => {
      expect(screen.queryByText('Ana María Ruiz')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Ana López')).toBeInTheDocument();
    expect(screen.queryByLabelText(SUGGESTIONS_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument();
  });
});

describe('/patients clearing the search', () => {
  it('restores the full paginated list and resets the query', async () => {
    const user = userEvent.setup();
    currentPatients = [
      makePatient({ id: 'ana-1', fullName: 'Ana López', phoneE164: '+5215511111111' }),
      makePatient({ id: 'juan-1', fullName: 'Juan Pérez', phoneE164: '+5215533333333' }),
    ];
    render(<PatientsPage />);
    await screen.findByText('Ana López');

    fireEvent.change(searchInput(), { target: { value: 'ana' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    await waitFor(() => {
      expect(screen.queryByText('Juan Pérez')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));

    await waitFor(() => {
      expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    });
    expect(searchInput()).toHaveValue('');
    expect(replaceMock).toHaveBeenCalledWith('/patients');
  });
});

describe('/patients pagination', () => {
  it('disables previous on the first page and shows the page indicator', async () => {
    currentPatients = makeManyPatients(25);
    render(<PatientsPage />);
    await screen.findByText('Paciente 01');

    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
  });

  it('requests the next page and disables next on the last page', async () => {
    const user = userEvent.setup();
    currentPatients = makeManyPatients(25);
    render(<PatientsPage />);
    await screen.findByText('Paciente 01');
    fetchMock.mockClear();

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));

    await screen.findByText('Paciente 21');
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeEnabled();
    expect(listUrls().some((url) => url.includes('page=2'))).toBe(true);
  });

  it('keeps the active search when moving between pages', async () => {
    const user = userEvent.setup();
    currentPatients = makeManyPatients(25);
    render(<PatientsPage />);
    await screen.findByText('Paciente 01');

    fireEvent.change(searchInput(), { target: { value: 'paciente' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    await waitFor(() => {
      expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
    });
    fetchMock.mockClear();

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));

    await within(table()).findByText('Paciente 21');
    await waitFor(() => {
      expect(listUrls().some((url) => url.includes('q=paciente') && url.includes('page=2'))).toBe(
        true
      );
    });
  });

  it('returns to the previous page', async () => {
    const user = userEvent.setup();
    currentPatients = makeManyPatients(25);
    render(<PatientsPage />);
    await screen.findByText('Paciente 01');

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByText('Paciente 21');

    await user.click(screen.getByRole('button', { name: 'Anterior' }));

    await screen.findByText('Paciente 01');
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
  });
});

describe('/patients stale responses', () => {
  it('discards a slow response that resolves after a newer query', async () => {
    const deferred: Array<{ q: string; resolve: (response: Response) => void }> = [];
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      const parsed = new URL(url, 'http://localhost');
      const q = parsed.searchParams.get('q');
      if (!q) {
        return Promise.resolve(
          Response.json(
            apiResponse([makePatient({ id: 'p-1', fullName: 'Paciente 01' })], 1, 20)
          )
        );
      }
      return new Promise<Response>((resolve) => {
        deferred.push({ q, resolve });
      });
    }) as unknown as typeof fetch;

    render(<PatientsPage />);
    await screen.findByText('Paciente 01');

    fireEvent.change(searchInput(), { target: { value: 'aa' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    await waitFor(() => {
      expect(deferred).toHaveLength(1);
    });

    fireEvent.change(searchInput(), { target: { value: 'bb' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    await waitFor(() => {
      expect(deferred).toHaveLength(2);
    });

    await act(async () => {
      deferred[1].resolve(
        Response.json(apiResponse([makePatient({ id: 'p-bb', fullName: 'Paciente BB' })], 1, 20))
      );
    });
    await screen.findByRole('table');
    await within(table()).findByText('Paciente BB');

    await act(async () => {
      deferred[0].resolve(
        Response.json(apiResponse([makePatient({ id: 'p-aa', fullName: 'Paciente AA' })], 1, 20))
      );
    });

    expect(within(table()).queryByText('Paciente AA')).not.toBeInTheDocument();
    expect(within(table()).getByText('Paciente BB')).toBeInTheDocument();
  });
});

describe('/patients URL sync', () => {
  it('writes the search and page to the URL with router.replace', async () => {
    const user = userEvent.setup();
    currentPatients = makeManyPatients(25);
    render(<PatientsPage />);
    await screen.findByText('Paciente 01');

    fireEvent.change(searchInput(), { target: { value: 'paciente' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/patients?q=paciente');
    });

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/patients?q=paciente&page=2');
    });
  });

  it('restores the search input and page from the URL on mount', async () => {
    searchParamsRef.value = new URLSearchParams('q=paciente&page=2');
    currentPatients = makeManyPatients(25);
    render(<PatientsPage />);

    expect(searchInput()).toHaveValue('paciente');
    await screen.findByRole('table');
    await within(table()).findByText('Paciente 21');
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
  });

  it('normalizes an out-of-range page without showing an error', async () => {
    searchParamsRef.value = new URLSearchParams('page=99');
    currentPatients = makeManyPatients(25);
    render(<PatientsPage />);

    await screen.findByText('Paciente 21');
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
    expect(screen.queryByText('Error al cargar pacientes')).not.toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith('/patients?page=2');
  });
});

describe('/patients empty states', () => {
  it('shows a search-specific message when the filtered list is empty', async () => {
    await renderWithInitialLoad();

    fireEvent.change(searchInput(), { target: { value: 'zzzz' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    await screen.findByText('Sin coincidencias para esta búsqueda.');
    expect(screen.queryByText('No hay pacientes registrados.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Limpiar búsqueda' })).toBeInTheDocument();
  });

  it('clears the search from the no-results state and restores the paginated list', async () => {
    const user = userEvent.setup();
    currentPatients = makeManyPatients(25);
    render(<PatientsPage />);
    await screen.findByText('Paciente 01');

    fireEvent.change(searchInput(), { target: { value: 'zzzz' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    await screen.findByText('Sin coincidencias para esta búsqueda.');
    expect(screen.queryByText('No hay pacientes registrados.')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fetchMock.mockClear();

    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));

    await within(table()).findByText('Paciente 01');
    expect(searchInput()).toHaveValue('');
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
    expect(within(table()).queryByText('Paciente 21')).not.toBeInTheDocument();
    expect(screen.queryByText('Sin coincidencias para esta búsqueda.')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(SUGGESTIONS_LABEL)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/patients');
    });
    const restoredUrls = listUrls();
    expect(restoredUrls.some((url) => url.includes('q='))).toBe(false);
    expect(restoredUrls.some((url) => url.includes('page=1'))).toBe(true);
  });

  it('shows the no-patients message when the registry is empty', async () => {
    currentPatients = [];
    render(<PatientsPage />);

    await screen.findByText('No hay pacientes registrados.');
    expect(screen.queryByText('Sin coincidencias para esta búsqueda.')).not.toBeInTheDocument();
  });
});

describe('/patients loading and error states', () => {
  it('shows the loading state while the request is in flight and not the empty state', async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    global.fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        })
    ) as unknown as typeof fetch;

    render(<PatientsPage />);

    expect(screen.getByText('Cargando...')).toBeInTheDocument();
    expect(screen.queryByText('No hay pacientes registrados.')).not.toBeInTheDocument();

    await act(async () => {
      resolveRequest!(
        Response.json(apiResponse(CRUD_PATIENTS, 1, 20))
      );
    });

    expect(await screen.findByText('María García')).toBeInTheDocument();
  });

  it('shows the error state and retries the same query', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    let firstUrl = '';
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) {
        attempts += 1;
        if (attempts === 1) {
          firstUrl = input.toString();
          return new Response('boom', { status: 500 });
        }
        const parsed = new URL(input.toString(), 'http://localhost');
        const page = Number(parsed.searchParams.get('page') ?? '1');
        const pageSize = Number(parsed.searchParams.get('pageSize') ?? '20');
        return Response.json(apiResponse(currentPatients, page, pageSize));
      }
      return new Response('Not found', { status: 404 });
    });

    render(<PatientsPage />);
    await screen.findByText('Error al cargar pacientes');

    await user.click(screen.getByRole('button', { name: 'Intentar de nuevo' }));

    await screen.findByText('María García');
    expect(screen.queryByText('Error al cargar pacientes')).not.toBeInTheDocument();
    expect(attempts).toBe(2);
    expect(firstUrl).toContain('page=1');
    expect(fetchMock.mock.calls[1][0].toString()).toContain('page=1');
  });
});
