import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PatientSearchInput, type PatientOption } from '../PatientSearchInput';

// ---------------------------------------------------------------------------
// Fixtures y utilidades
// ---------------------------------------------------------------------------

const MARIA = { id: 'pat-maria', fullName: 'María García', phoneE164: '+525511112222' };
const MARTA = { id: 'pat-marta', fullName: 'Marta López', phoneE164: null };
const JUAN = { id: 'pat-juan', fullName: 'Juan Pérez', phoneE164: '+525599998888' };

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function patientResponse(patients: unknown[]) {
  return jsonResponse({
    patients,
    page: 1,
    pageSize: 20,
    total: patients.length,
    totalPages: patients.length > 0 ? 1 : 0,
  });
}

// URLs solicitadas al mock de `fetch` (primer argumento de cada llamada).
function fetchedUrls(): string[] {
  return (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(
    (call) => String(call[0])
  );
}

// Componente controlado de prueba: simula a la página manteniendo el `value`
// externo, de modo que el efecto de sincronización (D17) se ejerza de verdad.
function Harness({
  onChange,
  initial = null,
  label,
}: {
  onChange?: (selection: PatientOption | null) => void;
  initial?: PatientOption | null;
  label?: string;
}) {
  const [value, setValue] = useState<PatientOption | null>(initial);
  return (
    <PatientSearchInput
      value={value}
      label={label}
      onChange={(selection) => {
        setValue(selection);
        onChange?.(selection);
      }}
    />
  );
}

async function typeAndSettle(
  input: HTMLElement,
  text: string
): Promise<void> {
  await userEvent.type(input, text);
  await act(async () => {
    vi.advanceTimersByTime(300);
  });
}

describe('PatientSearchInput', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1.1 renderiza un campo vacío con label "Paciente" asociada y sin listbox', () => {
    render(<PatientSearchInput value={null} onChange={vi.fn()} />);

    const input = screen.getByLabelText('Paciente');
    expect(input).toHaveValue('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('1.2 no consulta con 1 carácter y sí consulta con 2 tras el debounce', async () => {
    global.fetch = vi.fn().mockResolvedValue(patientResponse([MARIA])) as unknown as typeof fetch;
    render(<PatientSearchInput value={null} onChange={vi.fn()} />);
    const input = screen.getByLabelText('Paciente');

    await userEvent.type(input, 'm');
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(fetchedUrls().some((url) => url.includes('?q='))).toBe(false);

    await userEvent.type(input, 'a');
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(fetchedUrls()).toContain('/api/admin/patients?q=ma');
    });
  });

  it('1.3 teclear "mar" sin pausas produce una sola consulta con q=mar', async () => {
    global.fetch = vi.fn().mockResolvedValue(patientResponse([MARIA])) as unknown as typeof fetch;
    render(<PatientSearchInput value={null} onChange={vi.fn()} />);
    const input = screen.getByLabelText('Paciente');

    await userEvent.type(input, 'mar');
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      const searchCalls = fetchedUrls().filter((url) => url.includes('?q='));
      expect(searchCalls).toHaveLength(1);
      expect(searchCalls[0]).toBe('/api/admin/patients?q=mar');
    });
  });

  it('1.4 descarta la respuesta obsoleta y conserva la vigente', async () => {
    const stale = deferred<Response>();
    const fresh = deferred<Response>();
    global.fetch = vi
      .fn()
      .mockImplementationOnce(() => stale.promise)
      .mockImplementationOnce(() => fresh.promise) as unknown as typeof fetch;

    render(<PatientSearchInput value={null} onChange={vi.fn()} />);
    const input = screen.getByLabelText('Paciente');

    await typeAndSettle(input, 'ma');
    await typeAndSettle(input, 'r');

    await act(async () => {
      fresh.resolve(patientResponse([MARIA]));
      await fresh.promise;
    });
    await act(async () => {
      stale.resolve(patientResponse([MARTA]));
      await stale.promise;
    });

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'María García' })).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('option', { name: 'Marta López' })
    ).not.toBeInTheDocument();
  });

  it('1.5 seleccionar una sugerencia emite onChange una vez, muestra el nombre y cierra el panel', async () => {
    global.fetch = vi.fn().mockResolvedValue(patientResponse([MARIA])) as unknown as typeof fetch;
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByLabelText('Paciente');

    await typeAndSettle(input, 'mar');

    const option = await screen.findByRole('option', { name: 'María García' });
    await userEvent.click(within(option).getByRole('button'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ id: MARIA.id, name: MARIA.fullName });
    expect(input).toHaveValue('María García');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('1.6 sin coincidencias no hay listbox', async () => {
    global.fetch = vi.fn().mockResolvedValue(patientResponse([])) as unknown as typeof fetch;
    render(<Harness onChange={vi.fn()} />);
    const input = screen.getByLabelText('Paciente');

    await typeAndSettle(input, 'zz');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('1.6 perder el foco cierra el panel', async () => {
    global.fetch = vi.fn().mockResolvedValue(patientResponse([MARIA])) as unknown as typeof fetch;
    render(<Harness onChange={vi.fn()} />);
    const input = screen.getByLabelText('Paciente');

    await typeAndSettle(input, 'mar');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    await act(async () => {
      input.blur();
    });

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  it('1.6 Escape cierra el panel sin cambiar la selección', async () => {
    global.fetch = vi.fn().mockResolvedValue(patientResponse([MARIA])) as unknown as typeof fetch;
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByLabelText('Paciente');

    await typeAndSettle(input, 'mar');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('1.7 navega con teclado y expone los roles/atributos ARIA', async () => {
    global.fetch = vi.fn().mockResolvedValue(patientResponse([MARIA, MARTA])) as unknown as typeof fetch;
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByLabelText('Paciente');

    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-expanded', 'false');

    await typeAndSettle(input, 'mar');

    const listbox = await screen.findByRole('listbox');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input.getAttribute('aria-controls')).toBe(listbox.id);

    await userEvent.keyboard('{ArrowDown}');
    const first = screen.getByRole('option', { name: 'María García' });
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(input.getAttribute('aria-activedescendant')).toBe(first.id);

    await userEvent.keyboard('{ArrowDown}');
    const second = screen.getByRole('option', { name: 'Marta López' });
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(first).toHaveAttribute('aria-selected', 'false');

    await userEvent.keyboard('{ArrowUp}');
    expect(first).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith({ id: MARIA.id, name: MARIA.fullName });
  });

  it('1.7 Enter sin opción activa no selecciona', async () => {
    global.fetch = vi.fn().mockResolvedValue(patientResponse([MARIA])) as unknown as typeof fetch;
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByLabelText('Paciente');

    await typeAndSettle(input, 'mar');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    await userEvent.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('1.8 la limpieza con ✕ emite null y vacía el campo', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} initial={{ id: MARIA.id, name: MARIA.fullName }} />);
    const input = screen.getByLabelText('Paciente');
    expect(input).toHaveValue('María García');

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar paciente' }));

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(input).toHaveValue('');
  });

  it('1.8 vaciar el texto limpia el filtro aplicado', async () => {
    global.fetch = vi.fn().mockResolvedValue(patientResponse([MARIA])) as unknown as typeof fetch;
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByLabelText('Paciente');

    await typeAndSettle(input, 'mar');
    const option = await screen.findByRole('option', { name: 'María García' });
    await userEvent.click(within(option).getByRole('button'));
    expect(onChange).toHaveBeenLastCalledWith({ id: MARIA.id, name: MARIA.fullName });

    await userEvent.clear(input);

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(input).toHaveValue('');
  });

  it('1.8 editar el texto tras una selección limpia el filtro y busca el texto nuevo', async () => {
    global.fetch = vi.fn().mockResolvedValue(patientResponse([MARIA])) as unknown as typeof fetch;
    const onChange = vi.fn();
    render(<Harness onChange={onChange} initial={{ id: MARIA.id, name: MARIA.fullName }} />);
    const input = screen.getByLabelText('Paciente');

    await userEvent.type(input, 'x');

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(null);
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(fetchedUrls()).toContain(
        `/api/admin/patients?q=${encodeURIComponent('María Garcíax')}`
      );
    });
  });

  it('1.9 resalta el fragmento coincidente conservando el nombre accesible', async () => {
    global.fetch = vi.fn().mockResolvedValue(patientResponse([MARIA])) as unknown as typeof fetch;
    render(<PatientSearchInput value={null} onChange={vi.fn()} />);
    const input = screen.getByLabelText('Paciente');

    await typeAndSettle(input, 'mar');

    const option = await screen.findByRole('option', { name: 'María García' });
    expect(option).toHaveAccessibleName('María García');
    const highlighted = within(option).getByText('Mar');
    expect(highlighted.className).toContain('font-semibold');
  });

  it('1.9 una coincidencia por teléfono se muestra en texto plano sin error', async () => {
    global.fetch = vi.fn().mockResolvedValue(patientResponse([JUAN])) as unknown as typeof fetch;
    render(<PatientSearchInput value={null} onChange={vi.fn()} />);
    const input = screen.getByLabelText('Paciente');

    await typeAndSettle(input, '551');

    const option = await screen.findByRole('option', { name: 'Juan Pérez' });
    expect(option).toHaveTextContent('Juan Pérez');
    expect(within(option).queryByText('551')).not.toBeInTheDocument();
  });

  it('1.10 la sincronización externa vacía el campo cuando el padre pasa null', () => {
    const { rerender } = render(
      <PatientSearchInput
        value={{ id: MARIA.id, name: MARIA.fullName }}
        onChange={vi.fn()}
      />
    );
    const input = screen.getByLabelText('Paciente');
    expect(input).toHaveValue('María García');

    rerender(<PatientSearchInput value={null} onChange={vi.fn()} />);

    expect(input).toHaveValue('');
  });

  it('1.10 un 401 muestra el mensaje de sesión y no abre el panel', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ error: 'unauthorized' }, { ok: false, status: 401 })
      ) as unknown as typeof fetch;
    render(<PatientSearchInput value={null} onChange={vi.fn()} />);
    const input = screen.getByLabelText('Paciente');

    await typeAndSettle(input, 'mar');

    expect(await screen.findByText(/sesión/i)).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('1.11 funciona montado de forma aislada y notifica la selección por su interfaz pública', async () => {
    global.fetch = vi.fn().mockResolvedValue(patientResponse([MARIA])) as unknown as typeof fetch;
    const onSelect = vi.fn();

    render(<PatientSearchInput value={null} onChange={onSelect} label="Paciente" />);
    const input = screen.getByLabelText('Paciente');
    await typeAndSettle(input, 'mar');
    const option = await screen.findByRole('option', { name: 'María García' });
    await userEvent.click(within(option).getByRole('button'));

    expect(onSelect).toHaveBeenCalledWith({ id: MARIA.id, name: MARIA.fullName });
  });

  describe('2.8 bordes', () => {
    it('texto de solo espacios no consulta', async () => {
      global.fetch = vi.fn() as unknown as typeof fetch;
      render(<Harness onChange={vi.fn()} />);
      const input = screen.getByLabelText('Paciente');

      await typeAndSettle(input, '   ');

      expect(fetchedUrls().some((url) => url.includes('?q='))).toBe(false);
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('exactamente 2 caracteres consulta', async () => {
      global.fetch = vi.fn().mockResolvedValue(patientResponse([MARIA])) as unknown as typeof fetch;
      render(<Harness onChange={vi.fn()} />);
      const input = screen.getByLabelText('Paciente');

      await typeAndSettle(input, 'ma');

      await waitFor(() => {
        expect(fetchedUrls()).toContain('/api/admin/patients?q=ma');
      });
    });

    it('borrar de 2 a 1 caracteres cierra el panel y limpia las sugerencias', async () => {
      global.fetch = vi.fn().mockResolvedValue(patientResponse([MARIA])) as unknown as typeof fetch;
      render(<Harness onChange={vi.fn()} />);
      const input = screen.getByLabelText('Paciente');

      await typeAndSettle(input, 'ma');
      expect(await screen.findByRole('listbox')).toBeInTheDocument();

      await userEvent.type(input, '{Backspace}');

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
      expect(screen.queryByRole('option')).not.toBeInTheDocument();
    });

    it('Escape con el panel cerrado no altera el valor', async () => {
      const onChange = vi.fn();
      render(<Harness onChange={onChange} initial={{ id: MARIA.id, name: MARIA.fullName }} />);
      const input = screen.getByLabelText('Paciente');
      input.focus();

      await userEvent.keyboard('{Escape}');

      expect(input).toHaveValue('María García');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('una ráfaga que termina en el mismo término produce una sola consulta', async () => {
      global.fetch = vi.fn().mockResolvedValue(patientResponse([MARIA])) as unknown as typeof fetch;
      render(<Harness onChange={vi.fn()} />);
      const input = screen.getByLabelText('Paciente');

      await userEvent.type(input, 'marta');
      await userEvent.type(input, '{Backspace}{Backspace}');
      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        const searchCalls = fetchedUrls().filter((url) => url.includes('?q='));
        expect(searchCalls).toHaveLength(1);
        expect(searchCalls[0]).toBe('/api/admin/patients?q=mar');
      });
    });
  });
});
