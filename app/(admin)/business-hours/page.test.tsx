import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BusinessHoursPage from './page';

const { replaceMock, searchParamsRef } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  searchParamsRef: { value: new URLSearchParams() },
}));

// `useRouter` devuelve un objeto estable: la carga de datos vive en un
// `useEffect` que depende de `router`, así que un objeto nuevo por render
// dispararía refetches infinitos.
const routerMock = {
  replace: replaceMock,
  push: vi.fn(),
  refresh: vi.fn(),
};

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  useSearchParams: () => searchParamsRef.value,
}));

const PROVIDER_A = '550e8400-e29b-41d4-a716-446655440001';
const PROVIDER_B = '550e8400-e29b-41d4-a716-446655440002';

const PROVIDERS = [
  { id: PROVIDER_A, name: 'Dra. Ana' },
  { id: PROVIDER_B, name: 'Dr. Beto' },
];

type PaginationMeta = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type BusinessHour = {
  id: string;
  providerId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

function hour(
  id: string,
  providerId: string,
  startTime: string,
  dayOfWeek = 1
): BusinessHour {
  return { id, providerId, dayOfWeek, startTime, endTime: '18:00' };
}

function makeHours(count: number, providerId = PROVIDER_A): BusinessHour[] {
  return Array.from({ length: count }, (_, index) =>
    hour(`hour-${index}`, providerId, '09:00')
  );
}

// Respuesta paginada estándar: el totalPages se deriva del pageSize de la
// convención del endpoint (default 20).
function paginated(
  businessHours: BusinessHour[],
  page: number,
  total: number,
  pageSize = 20
): { businessHours: BusinessHour[]; pagination: PaginationMeta } {
  return {
    businessHours,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    },
  };
}

function okJson(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

/**
 * Mock de fetch que resuelve la lista de horarios según los parámetros de la
 * petición y sirve el catálogo de proveedores que alimenta el `select` del
 * filtro (y el del formulario).
 */
function buildFetchMock(
  handler: (params: URLSearchParams) => {
    businessHours: BusinessHour[];
    pagination: PaginationMeta;
  }
) {
  return vi.fn().mockImplementation((url: string) => {
    if (url === '/api/admin/providers') {
      return okJson({ providers: PROVIDERS });
    }
    if (url === '/api/admin/business-hours' || url.startsWith('/api/admin/business-hours?')) {
      const params = new URLSearchParams(url.split('?')[1] ?? '');
      return okJson(handler(params));
    }
    return okJson({});
  });
}

function hoursRequests(fetchMock: ReturnType<typeof buildFetchMock>) {
  return fetchMock.mock.calls
    .map((call) => call[0] as string)
    .filter(
      (url) =>
        url === '/api/admin/business-hours' ||
        url.startsWith('/api/admin/business-hours?')
    )
    .map((url) => new URLSearchParams(url.split('?')[1] ?? ''));
}

function lastHoursParams(fetchMock: ReturnType<typeof buildFetchMock>) {
  const requests = hoursRequests(fetchMock);
  return requests.length > 0 ? requests[requests.length - 1] : null;
}

function requestedPage(params: URLSearchParams): number {
  const raw = params.get('page');
  return raw === null ? 1 : Number(raw);
}

describe('/business-hours pagination and filter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => false);
    searchParamsRef.value = new URLSearchParams();
    replaceMock.mockClear();
  });

  it('renders the pagination control with the server metadata and bounds the DOM to pageSize', async () => {
    const fetchMock = buildFetchMock((params) =>
      paginated(makeHours(20), requestedPage(params), 25)
    );
    global.fetch = fetchMock;

    render(<BusinessHoursPage />);

    expect(screen.getByText('Cargando...')).toBeInTheDocument();

    expect(
      await screen.findByText('Página 1 de 2 (25 resultados)')
    ).toBeInTheDocument();
    // Encabezado + 20 filas: el DOM nunca contiene el catálogo completo.
    expect(screen.getAllByRole('row')).toHaveLength(21);

    const params = lastHoursParams(fetchMock)!;
    expect(params.has('page')).toBe(false);
    expect(params.has('providerId')).toBe(false);
    expect(screen.queryByRole('combobox', { name: /tamaño/i })).not.toBeInTheDocument();
  });

  it('advances to the next page, refetches page=2 and preserves the active filter', async () => {
    searchParamsRef.value = new URLSearchParams(`providerId=${PROVIDER_A}`);
    const fetchMock = buildFetchMock((params) => {
      const page = requestedPage(params);
      return page === 2
        ? paginated([hour('page-2', PROVIDER_A, '13:00')], 2, 25)
        : paginated([hour('page-1', PROVIDER_A, '09:00')], 1, 25);
    });
    global.fetch = fetchMock;
    const user = userEvent.setup();

    render(<BusinessHoursPage />);

    await screen.findByText('09:00');
    await user.click(
      screen.getByRole('button', { name: 'Ir a la página siguiente' })
    );

    expect(await screen.findByText('13:00')).toBeInTheDocument();

    const params = lastHoursParams(fetchMock)!;
    expect(params.get('page')).toBe('2');
    expect(params.get('providerId')).toBe(PROVIDER_A);
    expect(replaceMock).toHaveBeenCalledWith(
      `/business-hours?page=2&providerId=${PROVIDER_A}`
    );
    expect(screen.getByText('Página 2 de 2 (25 resultados)')).toBeInTheDocument();
  });

  it('initializes page and filter from a deep link and omits page=1 when returning to the first page', async () => {
    searchParamsRef.value = new URLSearchParams(`page=2&providerId=${PROVIDER_A}`);
    const fetchMock = buildFetchMock((params) =>
      paginated([hour(`h-${requestedPage(params)}`, PROVIDER_A, '09:00')], requestedPage(params), 45)
    );
    global.fetch = fetchMock;
    const user = userEvent.setup();

    render(<BusinessHoursPage />);

    expect(
      await screen.findByText('Página 2 de 3 (45 resultados)')
    ).toBeInTheDocument();
    expect(
      (screen.getByRole('combobox', { name: 'Proveedor' }) as HTMLSelectElement).value
    ).toBe(PROVIDER_A);
    const deepLinkParams = lastHoursParams(fetchMock)!;
    expect(deepLinkParams.get('page')).toBe('2');
    expect(deepLinkParams.get('providerId')).toBe(PROVIDER_A);

    await user.click(
      screen.getByRole('button', { name: 'Ir a la primera página' })
    );

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        `/business-hours?providerId=${PROVIDER_A}`
      )
    );
  });

  it('does not rewrite the URL nor refetch when activating an already-active page bound', async () => {
    searchParamsRef.value = new URLSearchParams('page=3');
    const fetchMock = buildFetchMock((params) =>
      paginated([hour(`h-${requestedPage(params)}`, PROVIDER_A, '09:00')], requestedPage(params), 45)
    );
    global.fetch = fetchMock;
    const user = userEvent.setup();

    render(<BusinessHoursPage />);

    await screen.findByText('Página 3 de 3 (45 resultados)');
    const callsBefore = hoursRequests(fetchMock).length;

    await user.click(
      screen.getByRole('button', { name: 'Ir a la página siguiente' })
    );
    await user.click(
      screen.getByRole('button', { name: 'Ir a la última página' })
    );

    expect(replaceMock).not.toHaveBeenCalled();
    expect(hoursRequests(fetchMock)).toHaveLength(callsBefore);
  });

  it('resets to page 1 and drops page from the URL when the provider filter changes', async () => {
    searchParamsRef.value = new URLSearchParams('page=3');
    const fetchMock = buildFetchMock((params) => {
      const providerId = params.get('providerId');
      if (providerId === PROVIDER_B) {
        return paginated([hour('filtered', PROVIDER_B, '15:00')], requestedPage(params), 1);
      }
      return paginated(makeHours(20), requestedPage(params), 100);
    });
    global.fetch = fetchMock;
    const user = userEvent.setup();

    render(<BusinessHoursPage />);

    await screen.findByText('Página 3 de 5 (100 resultados)');

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Proveedor' }),
      PROVIDER_B
    );

    expect(await screen.findByText('15:00')).toBeInTheDocument();
    await waitFor(() => {
      const params = lastHoursParams(fetchMock)!;
      expect(params.get('page')).toBeNull();
      expect(params.get('providerId')).toBe(PROVIDER_B);
    });
    expect(replaceMock).toHaveBeenCalledWith(
      `/business-hours?providerId=${PROVIDER_B}`
    );
  });

  it('"Limpiar filtro" resets to page 1 and removes providerId', async () => {
    searchParamsRef.value = new URLSearchParams(`page=2&providerId=${PROVIDER_A}`);
    const fetchMock = buildFetchMock((params) => {
      const providerId = params.get('providerId');
      const rows = providerId ? [hour('filtered', providerId, '09:00')] : makeHours(20);
      return paginated(rows, requestedPage(params), providerId ? 25 : 100);
    });
    global.fetch = fetchMock;
    const user = userEvent.setup();

    render(<BusinessHoursPage />);

    await screen.findByText('Página 2 de 2 (25 resultados)');
    const clearButton = screen.getByRole('button', { name: 'Limpiar filtro' });
    await user.click(clearButton);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/business-hours'));
    await waitFor(() => {
      const params = lastHoursParams(fetchMock)!;
      expect(params.get('providerId')).toBeNull();
      expect(params.get('page')).toBeNull();
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Limpiar filtro' })
      ).not.toBeInTheDocument()
    );
  });

  it('offers "Todos" plus every provider and shows "Limpiar filtro" only with an active filter', async () => {
    const fetchMock = buildFetchMock((params) =>
      paginated([hour('h1', PROVIDER_A, '09:00')], requestedPage(params), 1)
    );
    global.fetch = fetchMock;
    const user = userEvent.setup();

    render(<BusinessHoursPage />);

    const select = (await screen.findByRole('combobox', {
      name: 'Proveedor',
    })) as HTMLSelectElement;
    await screen.findByRole('option', { name: 'Dr. Beto' });
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      '',
      PROVIDER_A,
      PROVIDER_B,
    ]);
    expect(screen.getByRole('option', { name: 'Todos' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Limpiar filtro' })
    ).not.toBeInTheDocument();

    await user.selectOptions(select, PROVIDER_A);

    expect(
      await screen.findByRole('button', { name: 'Limpiar filtro' })
    ).toBeInTheDocument();
  });

  it('keeps the current catalog empty message when there is no filter', async () => {
    const fetchMock = buildFetchMock(() => paginated([], 1, 0));
    global.fetch = fetchMock;

    render(<BusinessHoursPage />);

    expect(await screen.findByText('No hay horarios registrados.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Limpiar filtro' })
    ).not.toBeInTheDocument();
  });

  it('shows a filter-specific empty message with an action when the filter has no matches', async () => {
    searchParamsRef.value = new URLSearchParams(`providerId=${PROVIDER_A}`);
    const fetchMock = buildFetchMock(() => paginated([], 1, 0));
    global.fetch = fetchMock;

    render(<BusinessHoursPage />);

    expect(
      await screen.findByText('No hay horarios que coincidan con el filtro.')
    ).toBeInTheDocument();
    expect(screen.queryByText('No hay horarios registrados.')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Limpiar filtro' })
    ).toBeInTheDocument();
  });

  it('normalizes an out-of-range deep link to the last page without an error state', async () => {
    searchParamsRef.value = new URLSearchParams('page=99');
    const fetchMock = buildFetchMock((params) => {
      const page = requestedPage(params);
      if (page === 99) {
        return paginated([], 99, 5);
      }
      return paginated(makeHours(5), page, 5);
    });
    global.fetch = fetchMock;

    render(<BusinessHoursPage />);

    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(6));
    expect(screen.queryByText('Error al cargar horarios')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Intentar de nuevo' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Paginación de horarios' })
    ).toBeInTheDocument();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/business-hours'));
    const requestedPages = hoursRequests(fetchMock).map((params) => params.get('page'));
    expect(requestedPages).toContain('99');
    expect(requestedPages).toContain(null);
  });

  it('keeps loading and error states and retries the current page + filter combination', async () => {
    searchParamsRef.value = new URLSearchParams(`page=2&providerId=${PROVIDER_A}`);
    let attempt = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/admin/providers') {
        return okJson({ providers: PROVIDERS });
      }
      if (url === '/api/admin/business-hours' || url.startsWith('/api/admin/business-hours?')) {
        attempt += 1;
        if (attempt === 1) {
          return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
        }
        const params = new URLSearchParams(url.split('?')[1] ?? '');
        return okJson(paginated([hour('page-2', PROVIDER_A, '13:00')], requestedPage(params), 25));
      }
      return okJson({});
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const user = userEvent.setup();

    render(<BusinessHoursPage />);

    expect(screen.getByText('Cargando...')).toBeInTheDocument();
    await screen.findByText('Error al cargar horarios');

    await user.click(screen.getByRole('button', { name: 'Intentar de nuevo' }));

    expect(await screen.findByText('13:00')).toBeInTheDocument();
    const requests = hoursRequests(fetchMock as ReturnType<typeof buildFetchMock>);
    expect(requests).toHaveLength(2);
    expect(requests[0].get('page')).toBe('2');
    expect(requests[1].get('page')).toBe('2');
    expect(requests[1].get('providerId')).toBe(PROVIDER_A);
  });
});
