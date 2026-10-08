import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TimezoneSettingsForm } from '../TimezoneSettingsForm';

/**
 * El formulario guarda la preferencia vía `PUT /api/admin/settings/timezone`.
 * Se mockea `fetch` en el límite (HTTP), no la lógica de validación ni el
 * estado del formulario.
 */
describe('TimezoneSettingsForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('muestra la zona horaria vigente', () => {
    render(<TimezoneSettingsForm initialTimezone="America/Mexico_City" />);

    expect(screen.getByTestId('current-timezone')).toHaveTextContent(
      'America/Mexico_City'
    );
  });

  it('rechaza una zona inválida sin llamar a la API ni sobrescribir la vigente', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<TimezoneSettingsForm initialTimezone="America/Mexico_City" />);

    await userEvent.selectOptions(
      screen.getByLabelText('Zona horaria'),
      '__custom__'
    );
    await userEvent.type(
      screen.getByLabelText('Otra zona horaria (IANA)'),
      'Nowhere/Invalid'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no es válida/i);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('current-timezone')).toHaveTextContent(
      'America/Mexico_City'
    );
  });

  it('guarda una zona válida vía API y confirma el cambio', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ timezone: 'America/New_York' })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<TimezoneSettingsForm initialTimezone="America/Mexico_City" />);

    await userEvent.selectOptions(
      screen.getByLabelText('Zona horaria'),
      'America/New_York'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('/api/admin/settings/timezone');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({
      timezone: 'America/New_York',
    });

    expect(await screen.findByRole('status')).toHaveTextContent(/actualizada/i);
    expect(screen.getByTestId('current-timezone')).toHaveTextContent(
      'America/New_York'
    );
  });

  it('muestra el error del servidor sin sobrescribir la zona vigente', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ error: 'invalid_request' }, { status: 400 })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<TimezoneSettingsForm initialTimezone="America/Mexico_City" />);

    await userEvent.selectOptions(
      screen.getByLabelText('Zona horaria'),
      'Europe/Madrid'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByTestId('current-timezone')).toHaveTextContent(
      'America/Mexico_City'
    );
  });
});
