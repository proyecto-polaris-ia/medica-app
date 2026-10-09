import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BusinessHoursPage from './page';

// Mismos convenios de mock que app/(admin)/appointments/page.test.tsx:
// `next/navigation` con referencias hoisted para poder cambiar la URL entre
// casos, y un `fetch` propio para las dos peticiones de `loadData()`.
const { replaceMock, searchParamsRef } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  searchParamsRef: { value: new URLSearchParams() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParamsRef.value,
}));

const PROVIDER_A = { id: 'prov-a', name: 'Dra. Ana' };
const PROVIDER_B = { id: 'prov-b', name: 'Dr. Beto' };
const PROVIDER_C = { id: 'prov-c', name: 'Dra. Caro' };

const HOURS = [
  { id: 'bh-a1', providerId: 'prov-a', dayOfWeek: 1, startTime: '08:00', endTime: '12:00' },
  { id: 'bh-a2', providerId: 'prov-a', dayOfWeek: 3, startTime: '09:00', endTime: '13:00' },
  { id: 'bh-b1', providerId: 'prov-b', dayOfWeek: 2, startTime: '10:00', endTime: '14:00' },
];

function ok(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

function buildFetchMock({
  hours = HOURS,
  providers = [PROVIDER_A, PROVIDER_B, PROVIDER_C],
}: {
  hours?: unknown[];
  providers?: unknown[];
} = {}) {
  return vi.fn().mockImplementation((url: string) => {
    if (url === '/api/admin/business-hours') return ok({ businessHours: hours });
    if (url === '/api/admin/providers') return ok({ providers });
    return ok({});
  });
}

function providerSelect(): HTMLSelectElement {
  return screen.getByRole('combobox', { name: 'Proveedor' }) as HTMLSelectElement;
}

function dataRowCount(): number {
  return within(screen.getByRole('table')).getAllByRole('row').length - 1;
}

function businessHoursCalls(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter((call) => call[0] === '/api/admin/business-hours')
    .length;
}

// Espera a que la tabla inicial esté renderizada con los horarios esperados.
async function renderLoaded(
  fetchMock = buildFetchMock(),
  expectedRows = HOURS.length
) {
  global.fetch = fetchMock;
  render(<BusinessHoursPage />);
  await waitFor(() => {
    expect(dataRowCount()).toBe(expectedRows);
  });
  return fetchMock;
}

describe('/business-hours provider filter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => false);
    searchParamsRef.value = new URLSearchParams();
    replaceMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1.1 muestra el panel de filtros con "Todos" por defecto y la tabla completa', async () => {
    await renderLoaded();

    expect(screen.getByText('Filtros')).toBeInTheDocument();
    expect(providerSelect()).toHaveValue('');
    expect(
      within(providerSelect()).getByRole('option', { name: 'Todos' })
    ).toBeInTheDocument();
    expect(
      within(providerSelect()).getByRole('option', { name: 'Dra. Ana' })
    ).toBeInTheDocument();
    expect(
      within(providerSelect()).getByRole('option', { name: 'Dr. Beto' })
    ).toBeInTheDocument();
    expect(dataRowCount()).toBe(3);
  });

  it('1.2 seleccionar un proveedor filtra sus horarios y "Todos" restaura la lista', async () => {
    const fetchMock = await renderLoaded();
    const user = userEvent.setup();

    await user.selectOptions(providerSelect(), 'prov-a');

    await waitFor(() => {
      expect(dataRowCount()).toBe(2);
    });
    expect(within(screen.getByRole('table')).getAllByText('Dra. Ana')).toHaveLength(2);
    expect(
      within(screen.getByRole('table')).queryByText('Dr. Beto')
    ).not.toBeInTheDocument();

    await user.selectOptions(providerSelect(), '');

    await waitFor(() => {
      expect(dataRowCount()).toBe(3);
    });
    expect(within(screen.getByRole('table')).getByText('Dr. Beto')).toBeInTheDocument();

    // "El filtro no cambia la petición al endpoint": solo la carga inicial.
    expect(businessHoursCalls(fetchMock)).toBe(1);
  });

  it('1.3 "Limpiar filtro" solo aparece con filtro y devuelve a "Todos" sin alterar los datos', async () => {
    const fetchMock = await renderLoaded();
    const user = userEvent.setup();

    expect(
      screen.queryByRole('button', { name: 'Limpiar filtro' })
    ).not.toBeInTheDocument();

    await user.selectOptions(providerSelect(), 'prov-a');
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Limpiar filtro' })
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Limpiar filtro' }));

    await waitFor(() => {
      expect(providerSelect()).toHaveValue('');
      expect(dataRowCount()).toBe(3);
    });
    expect(
      screen.queryByRole('button', { name: 'Limpiar filtro' })
    ).not.toBeInTheDocument();
    // Limpiar conserva el conjunto cargado: no hay nueva petición.
    expect(businessHoursCalls(fetchMock)).toBe(1);
  });

  it('1.4 seleccionar escribe ?providerId= con replace y limpiar lo quita', async () => {
    await renderLoaded();
    const user = userEvent.setup();

    await user.selectOptions(providerSelect(), 'prov-a');

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/business-hours?providerId=prov-a');
    });

    await user.click(screen.getByRole('button', { name: 'Limpiar filtro' }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenLastCalledWith('/business-hours');
    });
  });

  it('1.4 el deep link ?providerId= inicializa el selector y filtra la tabla', async () => {
    searchParamsRef.value = new URLSearchParams('providerId=prov-a');

    await renderLoaded(buildFetchMock(), 2);

    await waitFor(() => {
      expect(providerSelect()).toHaveValue('prov-a');
    });
    expect(dataRowCount()).toBe(2);
    expect(
      within(screen.getByRole('table')).queryByText('Dr. Beto')
    ).not.toBeInTheDocument();
  });

  it('1.4 un providerId desconocido cae en "Todos" sin romper la vista', async () => {
    searchParamsRef.value = new URLSearchParams('providerId=prov-inexistente');

    await renderLoaded();

    expect(providerSelect()).toHaveValue('');
    expect(dataRowCount()).toBe(3);
  });

  it('1.5 el filtro sobrevive a la edición que recarga los datos', async () => {
    const fetchMock = await renderLoaded();
    const user = userEvent.setup();

    await user.selectOptions(providerSelect(), 'prov-a');
    await waitFor(() => {
      expect(dataRowCount()).toBe(2);
    });

    const editButton = within(screen.getByRole('table')).getAllByRole('button', {
      name: 'Editar',
    })[0];
    await user.click(editButton);
    expect(screen.getByText('Editar horario')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(businessHoursCalls(fetchMock)).toBe(2);
    });
    expect(providerSelect()).toHaveValue('prov-a');
    await waitFor(() => {
      expect(dataRowCount()).toBe(2);
    });
  });

  it('1.5 el filtro sobrevive a la eliminación que recarga los datos', async () => {
    const fetchMock = await renderLoaded();
    const user = userEvent.setup();
    window.confirm = vi.fn(() => true);

    await user.selectOptions(providerSelect(), 'prov-a');
    await waitFor(() => {
      expect(dataRowCount()).toBe(2);
    });

    const deleteButton = within(screen.getByRole('table')).getAllByRole('button', {
      name: 'Eliminar',
    })[0];
    await user.click(deleteButton);

    await waitFor(() => {
      expect(businessHoursCalls(fetchMock)).toBe(2);
    });
    expect(providerSelect()).toHaveValue('prov-a');
    await waitFor(() => {
      expect(dataRowCount()).toBe(2);
    });
  });

  it('1.6 un proveedor sin horarios muestra el estado vacío propio', async () => {
    await renderLoaded();
    const user = userEvent.setup();

    await user.selectOptions(providerSelect(), 'prov-c');

    await waitFor(() => {
      expect(
        screen.getByText('No hay horarios registrados para este proveedor.')
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('No hay horarios registrados.')).not.toBeInTheDocument();
  });

  it('1.6 una lista sin horarios conserva el mensaje general', async () => {
    global.fetch = buildFetchMock({ hours: [] });
    render(<BusinessHoursPage />);

    await waitFor(() => {
      expect(screen.getByText('No hay horarios registrados.')).toBeInTheDocument();
    });
  });
});
