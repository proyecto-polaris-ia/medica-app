import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingWizard } from './BookingWizard';

vi.mock('./TurnstileWidget', () => ({
  TurnstileWidget: ({ onToken }: { onToken: (token: string) => void }) => (
    <div data-testid="turnstile-widget">
      <button type="button" onClick={() => onToken('mock-captcha-token')}>
        Complete CAPTCHA
      </button>
    </div>
  ),
}));

const service = { id: 'svc-1', name: 'Consulta', durationMinutes: 30 };
const provider = { id: 'pro-1', name: 'Dra. Ana López' };
const slot = {
  startAt: '2026-09-10T14:00:00.000Z',
  endAt: '2026-09-10T14:30:00.000Z',
};

describe('BookingWizard integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn(async (url: string | URL) => {
      const path = url.toString();

      if (path.includes('/api/booking/services')) {
        return Response.json({ services: [service] });
      }

      if (path.includes('/api/booking/providers')) {
        return Response.json({ providers: [provider] });
      }

      if (path.includes('/api/booking/slots')) {
        return Response.json({ slots: [slot] });
      }

      if (path.includes('/api/booking/book')) {
        return Response.json(
          {
            status: 'booked',
            confirmation: {
              patientName: 'María García',
              startAt: slot.startAt,
              endAt: slot.endAt,
            },
          },
          { status: 201 }
        );
      }

      return new Response('Not found', { status: 404 });
    }) as typeof fetch;
  });

  it('walks through the full public booking flow', async () => {
    render(<BookingWizard mode="public" siteKey="site-key" />);

    await waitFor(() => {
      expect(screen.getByText(service.name)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText(service.name));

    await waitFor(() => {
      expect(screen.getByText(provider.name)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText(provider.name));

    const dateInput = await screen.findByLabelText('Fecha');
    await userEvent.type(dateInput, '2026-09-10');

    const slotButton = await screen.findByText(
      /\d{1,2}:\d{2}\s[ap]\.m\.\s*–\s*\d{1,2}:\d{2}\s[ap]\.m\./i
    );
    await userEvent.click(slotButton);

    const phoneInput = await screen.findByPlaceholderText('+5215512345678');
    await userEvent.type(phoneInput, '+5215512345678');

    const nameInput = await screen.findByPlaceholderText('María García');
    await userEvent.type(nameInput, 'María García');

    await userEvent.click(screen.getByText('Complete CAPTCHA'));

    await userEvent.click(screen.getByText('Confirmar reserva'));

    await waitFor(() => {
      expect(screen.getByText(/Reserva confirmada/i)).toBeInTheDocument();
    });
  });

  it('shows a conflict with the next available slot in public mode', async () => {
    global.fetch = vi.fn(async (url: string | URL) => {
      const path = url.toString();

      if (path.includes('/api/booking/services')) {
        return Response.json({ services: [service] });
      }

      if (path.includes('/api/booking/providers')) {
        return Response.json({ providers: [provider] });
      }

      if (path.includes('/api/booking/slots')) {
        return Response.json({ slots: [slot] });
      }

      if (path.includes('/api/booking/book')) {
        return Response.json(
          {
            status: 'conflict',
            message: 'El horario ya no está disponible.',
            nextAvailable: {
              startAt: '2026-09-10T15:00:00.000Z',
              endAt: '2026-09-10T15:30:00.000Z',
            },
          },
          { status: 409 }
        );
      }

      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    render(<BookingWizard mode="public" siteKey="site-key" />);

    await waitFor(() => {
      expect(screen.getByText(service.name)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText(service.name));

    await waitFor(() => {
      expect(screen.getByText(provider.name)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText(provider.name));

    const dateInput = await screen.findByLabelText('Fecha');
    await userEvent.type(dateInput, '2026-09-10');

    const slotButton = await screen.findByText(
      /\d{1,2}:\d{2}\s[ap]\.m\.\s*–\s*\d{1,2}:\d{2}\s[ap]\.m\./i
    );
    await userEvent.click(slotButton);

    const phoneInput = await screen.findByPlaceholderText('+5215512345678');
    await userEvent.type(phoneInput, '+5215512345678');

    const nameInput = await screen.findByPlaceholderText('María García');
    await userEvent.type(nameInput, 'María García');

    await userEvent.click(screen.getByText('Complete CAPTCHA'));

    await userEvent.click(screen.getByText('Confirmar reserva'));

    await waitFor(() => {
      expect(
        screen.getByText(/El horario ya no está disponible\./i)
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Reservar.*\d{1,2}:\d{2}\s[ap]\.m\./i)
    ).toBeInTheDocument();
  });

  it('forwards notes in the request body', async () => {
    let requestBody: Record<string, unknown> | null = null;

    global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = url.toString();

      if (path.includes('/api/booking/services')) {
        return Response.json({ services: [service] });
      }

      if (path.includes('/api/booking/providers')) {
        return Response.json({ providers: [provider] });
      }

      if (path.includes('/api/booking/slots')) {
        return Response.json({ slots: [slot] });
      }

      if (path.includes('/api/booking/book')) {
        requestBody = init?.body
          ? JSON.parse(init.body as string)
          : null;
        return Response.json(
          {
            status: 'booked',
            confirmation: {
              patientName: 'María García',
              startAt: slot.startAt,
              endAt: slot.endAt,
            },
          },
          { status: 201 }
        );
      }

      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    render(<BookingWizard mode="public" siteKey="site-key" />);

    await waitFor(() => {
      expect(screen.getByText(service.name)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText(service.name));

    await waitFor(() => {
      expect(screen.getByText(provider.name)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText(provider.name));

    const dateInput = await screen.findByLabelText('Fecha');
    await userEvent.type(dateInput, '2026-09-10');

    const slotButton = await screen.findByText(
      /\d{1,2}:\d{2}\s[ap]\.m\.\s*–\s*\d{1,2}:\d{2}\s[ap]\.m\./i
    );
    await userEvent.click(slotButton);

    const phoneInput = await screen.findByPlaceholderText('+5215512345678');
    await userEvent.type(phoneInput, '+5215512345678');

    const nameInput = await screen.findByPlaceholderText('María García');
    await userEvent.type(nameInput, 'María García');

    await userEvent.type(
      screen.getByLabelText('Notas de la cita'),
      'Prefiero mañana'
    );

    await userEvent.click(screen.getByText('Complete CAPTCHA'));
    await userEvent.click(screen.getByText('Confirmar reserva'));

    await waitFor(() => {
      expect(requestBody).not.toBeNull();
    });

    expect(requestBody).toMatchObject({ notes: 'Prefiero mañana' });
  });

  it('uses the admin endpoint in internal mode', async () => {
    const adminFetch = vi.fn(async (url: string | URL) => {
      const path = url.toString();

      // Catalog endpoints are shared/public regardless of mode.
      if (path.includes('/api/booking/services')) {
        return Response.json({ services: [service] });
      }

      if (path.includes('/api/booking/providers')) {
        return Response.json({ providers: [provider] });
      }

      if (path.includes('/api/booking/slots')) {
        return Response.json({ slots: [slot] });
      }

      // The write (book) is the only admin-specific call in internal mode.
      if (path.includes('/api/admin/booking/book')) {
        return Response.json(
          {
            status: 'booked',
            confirmation: {
              patientName: 'María García',
              startAt: slot.startAt,
              endAt: slot.endAt,
            },
          },
          { status: 201 }
        );
      }

      if (path.includes('/api/admin/patients')) {
        return Response.json({
          patients: [
            {
              id: 'pat-1',
              fullName: 'María García',
              phoneE164: '+5215512345678',
            },
          ],
        });
      }

      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    global.fetch = adminFetch;

    render(<BookingWizard mode="internal" />);

    await waitFor(() => {
      expect(screen.getByText(service.name)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText(service.name));

    await waitFor(() => {
      expect(screen.getByText(provider.name)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText(provider.name));

    const dateInput = await screen.findByLabelText('Fecha');
    await userEvent.type(dateInput, '2026-09-10');

    const slotButton = await screen.findByText(
      /\d{1,2}:\d{2}\s[ap]\.m\.\s*–\s*\d{1,2}:\d{2}\s[ap]\.m\./i
    );
    await userEvent.click(slotButton);

    const search = screen.getByPlaceholderText(
      'Buscar paciente por nombre o teléfono'
    );
    await userEvent.type(search, 'maria');

    const item = await screen.findByText('María García');
    await userEvent.click(item);

    await userEvent.click(screen.getByText('Confirmar reserva'));

    await waitFor(() => {
      expect(adminFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/booking/book'),
        expect.any(Object)
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Reserva confirmada/i)).toBeInTheDocument();
    });
  });
});
