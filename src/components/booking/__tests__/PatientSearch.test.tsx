import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PatientSearch } from '../PatientSearch';

const patients = [
  { id: 'pat-1', fullName: 'María García', phoneE164: '+5215512345678' },
  { id: 'pat-2', fullName: 'Juan Pérez', phoneE164: '+5215587654321' },
];

describe('PatientSearch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a search input', () => {
    render(<PatientSearch onSelect={vi.fn()} />);

    expect(
      screen.getByPlaceholderText('Buscar paciente por nombre, teléfono o correo')
    ).toBeInTheDocument();
  });

  it('fetches results after a debounce', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      Response.json({ patients })
    ) as typeof fetch;
    const onSelect = vi.fn();

    render(<PatientSearch onSelect={onSelect} />);

    const input = screen.getByPlaceholderText(
      'Buscar paciente por nombre, teléfono o correo'
    );
    await userEvent.type(input, 'maria');

    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/patients?q=maria'
      );
    });

    await waitFor(() => {
      expect(screen.getByText('María García')).toBeInTheDocument();
    });
  });

  it('emits the selected patient', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      Response.json({ patients })
    ) as typeof fetch;
    const onSelect = vi.fn();

    render(<PatientSearch onSelect={onSelect} />);

    const input = screen.getByPlaceholderText(
      'Buscar paciente por nombre, teléfono o correo'
    );
    await userEvent.type(input, 'maria');
    vi.advanceTimersByTime(300);

    const item = await screen.findByText('María García');
    await userEvent.click(item);

    expect(onSelect).toHaveBeenCalledWith(patients[0]);
  });

  it('shows an error on 401', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
    ) as typeof fetch;

    render(<PatientSearch onSelect={vi.fn()} />);

    const input = screen.getByPlaceholderText(
      'Buscar paciente por nombre, teléfono o correo'
    );
    await userEvent.type(input, 'x');
    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(screen.getByText(/sesión/i)).toBeInTheDocument();
    });
  });
});

it('shows an email when an internal patient has no phone', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  global.fetch = vi.fn().mockResolvedValue(Response.json({ patients: [{ id: 'email-1', fullName: 'Correo', phoneE164: null, email: 'correo@example.com' }] })) as typeof fetch;
  render(<PatientSearch onSelect={vi.fn()} />);
  await userEvent.type(screen.getByPlaceholderText('Buscar paciente por nombre, teléfono o correo'), 'correo');
  vi.advanceTimersByTime(300);
  expect(await screen.findByText('correo@example.com')).toBeInTheDocument();
  vi.useRealTimers();
});
