import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingWizard } from './BookingWizard';

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

  it('walks through the full booking flow', async () => {
    render(<BookingWizard />);

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

    await userEvent.click(screen.getByText('Confirmar reserva'));

    await waitFor(() => {
      expect(screen.getByText(/Reserva confirmada/i)).toBeInTheDocument();
    });
  });

  it('shows a conflict with the next available slot', async () => {
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

    render(<BookingWizard />);

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
});
