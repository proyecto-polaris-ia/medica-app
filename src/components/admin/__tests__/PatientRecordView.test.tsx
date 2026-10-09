import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Patient } from '@/lib/admin/types';
import { PatientRecordView } from '../PatientRecordView';

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PAGE_SIZE = 10;

const { replaceMock, searchParamsRef } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  searchParamsRef: { value: new URLSearchParams() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParamsRef.value,
  usePathname: () => `/patients/${PATIENT_ID}`,
}));

const PATIENT: Patient = {
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

type SectionData = { rows: unknown[]; total?: number };

type FetchCall = { variant: 'upcoming' | 'attended'; page: number; pageSize: number };

/**
 * Filas de cita con `serviceName` distinguishable por sección: así las
 * aserciones pueden apuntar a la tabla correcta sin ambigüedad.
 */
function makeRows(prefix: string, count: number, total?: number): SectionData {
  return {
    rows: Array.from({ length: count }, (_, index) => ({
      id: `${prefix}-${index + 1}`,
      patientId: PATIENT_ID,
      serviceId: 'svc-1',
      providerId: 'prov-1',
      startAt: '2026-09-10T14:00:00Z',
      endAt: '2026-09-10T14:30:00Z',
      status: 'confirmed',
      notes: null,
      createdAt: '2026-09-01T10:00:00Z',
      updatedAt: '2026-09-01T10:00:00Z',
      serviceName: `${prefix} ${index + 1}`,
      providerName: 'Dra. Ana',
    })),
    total,
  };
}

function serverSection(data: SectionData, page: number, pageSize: number) {
  const total = data.total ?? data.rows.length;
  const start = (page - 1) * pageSize;
  return {
    appointments: data.rows.slice(start, start + pageSize),
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

type FetchConfig = {
  upcoming: SectionData;
  attended: SectionData;
  /** Número de respuestas fallidas iniciales para la sección de futuras. */
  upcomingFailures?: number;
  /** Resolución manual que retrasa la primera respuesta de futuras. */
  upcomingGate?: Promise<void>;
};

function installFetchMock(config: FetchConfig) {
  const calls: FetchCall[] = [];
  let upcomingFailuresLeft = config.upcomingFailures ?? 0;

  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const raw = input.toString();
    const url = new URL(raw, 'http://localhost');
    const variant: 'upcoming' | 'attended' = url.pathname.endsWith('/upcoming')
      ? 'upcoming'
      : 'attended';
    const page = Number(url.searchParams.get('page') ?? '1');
    const pageSize = Number(url.searchParams.get('pageSize') ?? String(PAGE_SIZE));
    calls.push({ variant, page, pageSize });

    if (variant === 'upcoming' && config.upcomingGate) {
      await config.upcomingGate;
    }
    if (variant === 'upcoming' && upcomingFailuresLeft > 0) {
      upcomingFailuresLeft -= 1;
      return new Response('boom', { status: 500 });
    }

    const data = variant === 'upcoming' ? config.upcoming : config.attended;
    return Response.json(serverSection(data, page, pageSize));
  });

  global.fetch = mock as unknown as typeof fetch;
  return { mock, calls };
}

function callsFor(calls: FetchCall[], variant: 'upcoming' | 'attended') {
  return calls.filter((call) => call.variant === variant);
}

function section(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: title });
  return heading.closest('section') as HTMLElement;
}

function renderView(props: { syncUrl?: boolean } = {}) {
  return render(<PatientRecordView patient={PATIENT} {...props} />);
}

describe('PatientRecordView — secciones de citas paginadas', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    replaceMock.mockClear();
    searchParamsRef.value = new URLSearchParams();
  });

  it('renderiza las filas de cada endpoint en su propia sección', async () => {
    installFetchMock({
      upcoming: makeRows('Cita futura', 12),
      attended: makeRows('Cita asistida', 3),
    });
    renderView();

    const upcoming = section('Citas futuras');
    expect(await within(upcoming).findByText('Cita futura 1')).toBeInTheDocument();
    expect(within(upcoming).getByText('Cita futura 10')).toBeInTheDocument();
    // La primera página trae como máximo pageSize filas.
    expect(within(upcoming).queryByText('Cita futura 11')).not.toBeInTheDocument();

    const attended = section('Citas asistidas');
    expect(await within(attended).findByText('Cita asistida 1')).toBeInTheDocument();
    expect(within(attended).getByText('Cita asistida 3')).toBeInTheDocument();

    expect(within(upcoming).getByText('Página 1 de 2 (12 resultados)')).toBeInTheDocument();
    expect(within(attended).getByText('Página 1 de 1 (3 resultados)')).toBeInTheDocument();
  });

  it('mantiene la paginación independiente entre secciones', async () => {
    const { calls } = installFetchMock({
      upcoming: makeRows('Cita futura', 25),
      attended: makeRows('Cita asistida', 25),
    });
    const user = userEvent.setup();
    renderView();

    const upcoming = section('Citas futuras');
    const attended = section('Citas asistidas');
    expect(await within(upcoming).findByText('Cita futura 1')).toBeInTheDocument();
    expect(await within(attended).findByText('Cita asistida 1')).toBeInTheDocument();

    await user.click(
      within(upcoming).getByRole('button', { name: 'Ir a la página siguiente' })
    );

    expect(await within(upcoming).findByText('Cita futura 11')).toBeInTheDocument();

    const upcomingCalls = callsFor(calls, 'upcoming');
    expect(upcomingCalls.map((call) => call.page)).toEqual([1, 2]);
    // La sección de asistidas no se vuelve a consultar ni cambia de página.
    const attendedCalls = callsFor(calls, 'attended');
    expect(attendedCalls.map((call) => call.page)).toEqual([1]);
    expect(within(attended).getByText('Cita asistida 1')).toBeInTheDocument();
    expect(within(attended).getByText('Página 1 de 3 (25 resultados)')).toBeInTheDocument();
  });

  it('muestra el skeleton solo en la sección que carga', async () => {
    const gate = deferred<void>();
    installFetchMock({
      upcoming: makeRows('Cita futura', 2),
      attended: makeRows('Cita asistida', 2),
      upcomingGate: gate.promise,
    });
    renderView();

    const upcoming = section('Citas futuras');
    const attended = section('Citas asistidas');

    expect(within(upcoming).getByTestId('appointments-skeleton')).toBeInTheDocument();
    // La carga de una sección no bloquea a la otra.
    expect(await within(attended).findByText('Cita asistida 1')).toBeInTheDocument();

    await act(async () => {
      gate.resolve();
    });

    expect(await within(upcoming).findByText('Cita futura 1')).toBeInTheDocument();
    expect(within(upcoming).queryByTestId('appointments-skeleton')).not.toBeInTheDocument();
  });

  it('muestra los mensajes de vacío y omite la paginación sin resultados', async () => {
    installFetchMock({
      upcoming: { rows: [], total: 0 },
      attended: { rows: [], total: 0 },
    });
    renderView();

    expect(
      await screen.findByText('No hay citas futuras para este paciente.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('No hay citas asistidas registradas para este paciente.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('muestra estado vacío y conserva la paginación en una página fuera de rango', async () => {
    searchParamsRef.value = new URLSearchParams('upcomingPage=9');
    installFetchMock({
      upcoming: { rows: [], total: 5 },
      attended: makeRows('Cita asistida', 1),
    });
    renderView({ syncUrl: true });

    const upcoming = section('Citas futuras');
    expect(
      await within(upcoming).findByText('No hay citas futuras para este paciente.')
    ).toBeInTheDocument();
    expect(
      within(upcoming).getByText('Página 9 de 1 (5 resultados)')
    ).toBeInTheDocument();
    expect(
      within(upcoming).getByRole('button', { name: 'Ir a la primera página' })
    ).toBeEnabled();
  });

  it('muestra el error de una sección con reintento sin bloquear a la otra', async () => {
    const { calls } = installFetchMock({
      upcoming: makeRows('Cita futura', 1),
      attended: makeRows('Cita asistida', 1),
      upcomingFailures: 1,
    });
    const user = userEvent.setup();
    renderView();

    const upcoming = section('Citas futuras');
    const attended = section('Citas asistidas');

    expect(
      await within(upcoming).findByText('Error al cargar las citas futuras.')
    ).toBeInTheDocument();
    expect(within(attended).getByText('Cita asistida 1')).toBeInTheDocument();

    await user.click(
      within(upcoming).getByRole('button', { name: 'Intentar de nuevo' })
    );

    expect(await within(upcoming).findByText('Cita futura 1')).toBeInTheDocument();
    expect(callsFor(calls, 'upcoming').length).toBe(2);
  });

  describe('sincronización con la URL', () => {
    it('refleja el cambio de página en la URL sin reescribirla al montar', async () => {
      installFetchMock({
        upcoming: makeRows('Cita futura', 25),
        attended: makeRows('Cita asistida', 25),
      });
      const user = userEvent.setup();
      renderView({ syncUrl: true });

      expect(await screen.findByText('Cita futura 1')).toBeInTheDocument();
      expect(replaceMock).not.toHaveBeenCalled();

      await user.click(
        within(section('Citas futuras')).getByRole('button', {
          name: 'Ir a la página siguiente',
        })
      );

      await waitFor(() =>
        expect(replaceMock).toHaveBeenCalledWith(
          `/patients/${PATIENT_ID}?upcomingPage=2`
        )
      );
    });

    it('compone ambos parámetros sin pisarse entre secciones', async () => {
      installFetchMock({
        upcoming: makeRows('Cita futura', 25),
        attended: makeRows('Cita asistida', 25),
      });
      const user = userEvent.setup();
      renderView({ syncUrl: true });

      expect(await screen.findByText('Cita futura 1')).toBeInTheDocument();
      expect(await screen.findByText('Cita asistida 1')).toBeInTheDocument();

      await user.click(
        within(section('Citas futuras')).getByRole('button', {
          name: 'Ir a la página siguiente',
        })
      );
      await user.click(
        within(section('Citas asistidas')).getByRole('button', {
          name: 'Ir a la página siguiente',
        })
      );

      await waitFor(() =>
        expect(replaceMock).toHaveBeenLastCalledWith(
          `/patients/${PATIENT_ID}?upcomingPage=2&attendedPage=2`
        )
      );
    });

    it('omite el parámetro al volver a la página 1 y conserva otros parámetros', async () => {
      searchParamsRef.value = new URLSearchParams('tab=plans&upcomingPage=2');
      installFetchMock({
        upcoming: makeRows('Cita futura', 25),
        attended: makeRows('Cita asistida', 25),
      });
      const user = userEvent.setup();
      renderView({ syncUrl: true });

      expect(await screen.findByText('Cita futura 11')).toBeInTheDocument();

      await user.click(
        within(section('Citas futuras')).getByRole('button', {
          name: 'Ir a la página anterior',
        })
      );

      await waitFor(() =>
        expect(replaceMock).toHaveBeenCalledWith(`/patients/${PATIENT_ID}?tab=plans`)
      );
    });

    it('deep link: inicializa cada sección desde la URL antes del primer fetch', async () => {
      searchParamsRef.value = new URLSearchParams(
        'upcomingPage=2&attendedPage=3'
      );
      const { calls } = installFetchMock({
        upcoming: makeRows('Cita futura', 30, 30),
        attended: makeRows('Cita asistida', 30, 30),
      });
      renderView({ syncUrl: true });

      expect(await screen.findByText('Cita futura 11')).toBeInTheDocument();
      expect(await screen.findByText('Cita asistida 21')).toBeInTheDocument();

      const upcomingCalls = callsFor(calls, 'upcoming');
      const attendedCalls = callsFor(calls, 'attended');
      expect(upcomingCalls.map((call) => call.page)).toEqual([2]);
      expect(attendedCalls.map((call) => call.page)).toEqual([3]);
      expect(replaceMock).not.toHaveBeenCalled();
    });

    it('trata los parámetros inválidos o no numéricos como página 1', async () => {
      searchParamsRef.value = new URLSearchParams('upcomingPage=abc&attendedPage=0');
      const { calls } = installFetchMock({
        upcoming: makeRows('Cita futura', 25),
        attended: makeRows('Cita asistida', 25),
      });
      renderView({ syncUrl: true });

      await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(2));

      expect(callsFor(calls, 'upcoming').map((call) => call.page)).toEqual([1]);
      expect(callsFor(calls, 'attended').map((call) => call.page)).toEqual([1]);
    });

    it('no lee la URL ni escribe parámetros en modo modal (estado local)', async () => {
      searchParamsRef.value = new URLSearchParams('upcomingPage=5&attendedPage=4');
      const { calls } = installFetchMock({
        upcoming: makeRows('Cita futura', 30, 30),
        attended: makeRows('Cita asistida', 30, 30),
      });
      renderView();

      expect(await screen.findByText('Cita futura 1')).toBeInTheDocument();
      expect(await screen.findByText('Cita asistida 1')).toBeInTheDocument();

      expect(callsFor(calls, 'upcoming').map((call) => call.page)).toEqual([1]);
      expect(callsFor(calls, 'attended').map((call) => call.page)).toEqual([1]);
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });
});
