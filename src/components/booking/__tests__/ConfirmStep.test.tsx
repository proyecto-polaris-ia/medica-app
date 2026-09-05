import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmStep } from '../ConfirmStep';

const service = { id: 'svc-1', name: 'Consulta', durationMinutes: 30 };
const provider = { id: 'pro-1', name: 'Dra. Ana López' };
const slot = {
  start_at: new Date('2026-09-10T14:00:00.000Z'),
  end_at: new Date('2026-09-10T14:30:00.000Z'),
};

describe('ConfirmStep public mode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.turnstile = {
      render: vi.fn((_element, options) => {
        options.callback('token-123');
        return 'widget-id';
      }),
      ready: vi.fn((cb: () => void) => cb()),
    } as unknown as typeof window.turnstile;
  });

  it('keeps submit disabled without a captcha token', () => {
    window.turnstile = {
      render: vi.fn().mockReturnValue('widget-id'),
      ready: vi.fn((cb: () => void) => cb()),
    } as unknown as typeof window.turnstile;

    render(
      <ConfirmStep
        mode="public"
        service={service}
        provider={provider}
        slot={slot}
        onConfirm={vi.fn()}
        onBack={vi.fn()}
        loading={false}
        error={null}
        siteKey="site-key"
      />
    );

    expect(screen.getByText('Confirmar reserva')).toBeDisabled();
  });

  it('enables submit after a captcha token is received and contact is valid', async () => {
    render(
      <ConfirmStep
        mode="public"
        service={service}
        provider={provider}
        slot={slot}
        onConfirm={vi.fn()}
        onBack={vi.fn()}
        loading={false}
        error={null}
        siteKey="site-key"
      />
    );

    await userEvent.type(
      screen.getByPlaceholderText('+5215512345678'),
      '+5215512345678'
    );
    await userEvent.type(
      screen.getByPlaceholderText('María García'),
      'María García'
    );

    await waitFor(() => {
      expect(screen.getByText('Confirmar reserva')).not.toBeDisabled();
    });
  });

  it('shows a message when the site key is missing', () => {
    render(
      <ConfirmStep
        mode="public"
        service={service}
        provider={provider}
        slot={slot}
        onConfirm={vi.fn()}
        onBack={vi.fn()}
        loading={false}
        error={null}
        siteKey=""
      />
    );

    expect(
      screen.getByText(/no está habilitada en este momento/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Confirmar reserva')).toBeDisabled();
  });

  it('shows a notes textarea with label and placeholder', () => {
    render(
      <ConfirmStep
        mode="public"
        service={service}
        provider={provider}
        slot={slot}
        onConfirm={vi.fn()}
        onBack={vi.fn()}
        loading={false}
        error={null}
        siteKey="site-key"
      />
    );

    const textarea = screen.getByLabelText('Notas de la cita');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveAttribute(
      'placeholder',
      '¿Quieres agregar algo más para tener en consideración para tu cita?'
    );
    expect(textarea).toHaveAttribute('maxLength', '1000');
  });

  it('includes notes in the confirm payload', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmStep
        mode="public"
        service={service}
        provider={provider}
        slot={slot}
        onConfirm={onConfirm}
        onBack={vi.fn()}
        loading={false}
        error={null}
        siteKey="site-key"
      />
    );

    await userEvent.type(
      screen.getByPlaceholderText('+5215512345678'),
      '+5215512345678'
    );
    await userEvent.type(
      screen.getByPlaceholderText('María García'),
      'María García'
    );
    await userEvent.type(
      screen.getByLabelText('Notas de la cita'),
      'Prefiero horario de la mañana'
    );

    await userEvent.click(screen.getByText('Confirmar reserva'));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ notes: 'Prefiero horario de la mañana' })
      );
    });
  });
});

describe('ConfirmStep internal mode', () => {
  const patients = [
    { id: 'pat-1', fullName: 'María García', phoneE164: '+5215512345678' },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue(
      Response.json({ patients })
    ) as typeof fetch;
  });

  it('shows patient search and free text fields', () => {
    render(
      <ConfirmStep
        mode="internal"
        service={service}
        provider={provider}
        slot={slot}
        onConfirm={vi.fn()}
        onBack={vi.fn()}
        loading={false}
        error={null}
      />
    );

    expect(
      screen.getByPlaceholderText('Buscar paciente por nombre o teléfono')
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('+5215512345678')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('María García')).toBeInTheDocument();
  });

  it('fills patient data read-only when a patient is selected', async () => {
    render(
      <ConfirmStep
        mode="internal"
        service={service}
        provider={provider}
        slot={slot}
        onConfirm={vi.fn()}
        onBack={vi.fn()}
        loading={false}
        error={null}
      />
    );

    const search = screen.getByPlaceholderText(
      'Buscar paciente por nombre o teléfono'
    );
    await userEvent.type(search, 'maria');

    const item = await screen.findByText('María García');
    await userEvent.click(item);

    await waitFor(() => {
      expect(screen.getByDisplayValue('+5215512345678')).toBeInTheDocument();
      expect(screen.getByDisplayValue('María García')).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('+5215512345678')).toBeDisabled();
    expect(screen.getByDisplayValue('María García')).toBeDisabled();
  });

  it('emits patientId when a patient is selected', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmStep
        mode="internal"
        service={service}
        provider={provider}
        slot={slot}
        onConfirm={onConfirm}
        onBack={vi.fn()}
        loading={false}
        error={null}
      />
    );

    const search = screen.getByPlaceholderText(
      'Buscar paciente por nombre o teléfono'
    );
    await userEvent.type(search, 'maria');

    const item = await screen.findByText('María García');
    await userEvent.click(item);

    const button = screen.getByText('Confirmar reserva');
    await userEvent.click(button);

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ patientId: 'pat-1' })
      );
    });
  });
});
