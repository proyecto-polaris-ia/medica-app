import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PatientsPage from './page';

const patients = [
  {
    id: 'pat-email',
    fullName: 'María García',
    phoneE164: null,
    email: 'maria@example.com',
    notes: null,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  },
];

describe('/patients email contact UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (url.toString() === '/api/admin/patients' && !init?.method) {
        return Response.json({ patients });
      }
      if (url.toString() === '/api/admin/patients' && init?.method === 'POST') {
        return Response.json({ patient: patients[0] }, { status: 201 });
      }
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;
    window.alert = vi.fn();
  });

  it('shows email-only patients without rendering a missing phone as a value', async () => {
    render(<PatientsPage />);

    await waitFor(() => {
      expect(screen.getByText('maria@example.com')).toBeInTheDocument();
    });
    expect(screen.getAllByText('-')).toHaveLength(2);
  });

  it('submits an email-only patient with a null phone', async () => {
    const user = userEvent.setup();
    render(<PatientsPage />);
    await screen.findByText('maria@example.com');

    await user.click(screen.getByRole('button', { name: 'Nuevo paciente' }));
    await user.type(screen.getByLabelText('Nombre completo'), 'Ana Pérez');
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
    await user.click(screen.getByRole('button', { name: 'Crear paciente' }));

    await waitFor(() => {
      const postCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([url, init]) => url === '/api/admin/patients' && init?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      expect(JSON.parse(postCall![1].body)).toMatchObject({
        fullName: 'Ana Pérez', phoneE164: null, email: 'ana@example.com',
      });
    });
  });
});
