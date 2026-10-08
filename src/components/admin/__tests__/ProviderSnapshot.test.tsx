import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProviderSnapshot } from '../ProviderSnapshot';
import { TimezoneProvider } from '../TimezoneProvider';
import type { ProviderSnapshot as SnapshotType } from '@/lib/admin/types';

function buildSnapshot(overrides?: Partial<SnapshotType>): SnapshotType {
  return {
    provider: { id: '1', name: 'Dra. García', color: null, createdAt: '', updatedAt: '' },
    upcoming: [],
    today: [],
    recentClients: [],
    clientsHref: '/appointments?providerId=1',
    ...overrides,
  };
}

describe('ProviderSnapshot', () => {
  it('renders the provider name as the header', () => {
    render(<ProviderSnapshot snapshot={buildSnapshot()} />);
    expect(screen.getByRole('heading', { name: 'Dra. García' })).toBeInTheDocument();
  });

  it('lists upcoming appointments sorted by start time', () => {
    const snapshot = buildSnapshot({
      upcoming: [
        {
          id: 'b',
          patientId: 'p2',
          patientName: 'María López',
          serviceName: 'Limpieza',
          startAt: '2026-09-05T14:00:00.000Z',
          endAt: '2026-09-05T14:30:00.000Z',
          status: 'confirmed',
        },
        {
          id: 'a',
          patientId: 'p1',
          patientName: 'Juan Pérez',
          serviceName: 'Limpieza',
          startAt: '2026-09-10T14:00:00.000Z',
          endAt: '2026-09-10T14:30:00.000Z',
          status: 'confirmed',
        },
      ],
    });

    render(<ProviderSnapshot snapshot={snapshot} />);

    const items = screen.getAllByText(/Juan Pérez|María López/);
    expect(items[0]).toHaveTextContent('María López');
    expect(items[1]).toHaveTextContent('Juan Pérez');
  });

  it('shows an empty state when there are no upcoming appointments', () => {
    render(<ProviderSnapshot snapshot={buildSnapshot()} />);
    expect(screen.getByText('No hay citas próximas.')).toBeInTheDocument();
  });

  it('shows today appointments and their details', () => {
    const snapshot = buildSnapshot({
      today: [
        {
          id: 'c',
          patientId: 'p1',
          patientName: 'Juan Pérez',
          serviceName: 'Limpieza',
          startAt: '2026-09-03T14:00:00.000Z',
          endAt: '2026-09-03T14:30:00.000Z',
          status: 'confirmed',
        },
      ],
    });

    render(<ProviderSnapshot snapshot={snapshot} />);
    expect(screen.getByText('Agenda de hoy')).toBeInTheDocument();
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
  });

  it('renders recent clients with counts and a link to the full list', () => {
    const snapshot = buildSnapshot({
      recentClients: [
        { id: 'p1', fullName: 'Juan Pérez', count: 2 },
        { id: 'p2', fullName: 'María López', count: 1 },
      ],
    });

    render(<ProviderSnapshot snapshot={snapshot} />);
    expect(screen.getByText('Clientes recientes (2)')).toBeInTheDocument();
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    expect(screen.getByText('2 citas')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver listado completo' })).toHaveAttribute(
      'href',
      '/appointments?providerId=1'
    );
  });

  it('renders appointment times in the viewer timezone, not the clinic timezone', () => {
    const snapshot = buildSnapshot({
      upcoming: [
        {
          id: 'a',
          patientId: 'p1',
          patientName: 'Juan Pérez',
          serviceName: 'Limpieza',
          startAt: '2026-09-05T14:00:00.000Z',
          endAt: '2026-09-05T14:30:00.000Z',
          status: 'confirmed',
        },
      ],
    });

    render(
      <TimezoneProvider timezone="America/Los_Angeles">
        <ProviderSnapshot snapshot={snapshot} />
      </TimezoneProvider>
    );

    // 14:00Z = 07:00 en America/Los_Angeles (PDT, UTC-7); en la clínica serían 08:00.
    expect(screen.getByText(/7:00/)).toBeInTheDocument();
    expect(screen.queryByText(/8:00/)).not.toBeInTheDocument();
  });
});
