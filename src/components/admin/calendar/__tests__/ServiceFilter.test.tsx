import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServiceFilter } from '../ServiceFilter';

const SERVICES = [
  { id: 'service-1', name: 'Limpieza' },
  { id: 'service-2', name: 'Ortodoncia' },
  { id: 'service-3', name: 'Revisión' },
];

function entry(name: string | RegExp) {
  return screen.getByRole('button', { name });
}

describe('ServiceFilter', () => {
  it('llama onToggle con el id de la entrada activada y solo con el id', async () => {
    const onToggle = vi.fn();
    render(
      <ServiceFilter
        services={SERVICES}
        selectedIds={['service-1']}
        onToggle={onToggle}
      />
    );

    await userEvent.click(entry('Ortodoncia'));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('service-2');
  });

  it('con selectedIds=[] marca todas las entradas y comunica que se muestran todos', () => {
    render(
      <ServiceFilter services={SERVICES} selectedIds={[]} onToggle={vi.fn()} />
    );

    expect(entry('Limpieza')).toHaveAttribute('aria-pressed', 'true');
    expect(entry('Ortodoncia')).toHaveAttribute('aria-pressed', 'true');
    expect(entry('Revisión')).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByText('Mostrando todos los servicios')
    ).toBeInTheDocument();
  });

  it('marca aria-pressed según la selección y no encoge el universo', () => {
    render(
      <ServiceFilter
        services={SERVICES}
        selectedIds={['service-2']}
        onToggle={vi.fn()}
      />
    );

    expect(entry('Limpieza')).toHaveAttribute('aria-pressed', 'false');
    expect(entry('Ortodoncia')).toHaveAttribute('aria-pressed', 'true');
    expect(entry('Revisión')).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.queryByText('Mostrando todos los servicios')
    ).not.toBeInTheDocument();
  });

  it('no renderiza nada cuando no hay servicios', () => {
    const { container } = render(
      <ServiceFilter services={[]} selectedIds={[]} onToggle={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
    expect(
      screen.queryByText('Mostrando todos los servicios')
    ).not.toBeInTheDocument();
  });

  it('las entradas son solo nombre: sin swatch, sin color y con las clases exactas', () => {
    const { container } = render(
      <ServiceFilter
        services={SERVICES}
        selectedIds={['service-2']}
        onToggle={vi.fn()}
      />
    );

    expect(screen.queryByTestId('legend-swatch')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[style]')).toHaveLength(0);

    const active = entry('Ortodoncia');
    expect(within(active).queryByTestId('legend-swatch')).not.toBeInTheDocument();
    expect(active).not.toHaveAttribute('style');
    expect(active.className).toContain('text-gray-700');
    expect(active.className).toContain('font-medium');
    expect(active.className).toContain('border-gray-300');
    expect(active).toHaveTextContent('Ortodoncia');

    const inactive = entry('Limpieza');
    expect(inactive.className).toContain('text-gray-500');
    expect(inactive.className).toContain('border-transparent');
    expect(inactive.className).toContain('bg-transparent');
    expect(inactive).toHaveTextContent('Limpieza');
  });

  it('etiqueta el control con "Servicios:" y usa el contenedor flex-wrap', () => {
    const { container } = render(
      <ServiceFilter services={SERVICES} selectedIds={[]} onToggle={vi.fn()} />
    );

    expect(screen.getByText('Servicios:')).toBeInTheDocument();
    expect(container.firstElementChild?.className).toContain('flex-wrap');
    expect(container.firstElementChild?.className).toContain('mt-4');
  });

  it('tolera ids desconocidos sin alterar las entradas existentes', () => {
    render(
      <ServiceFilter
        services={SERVICES}
        selectedIds={['service-1', 'desconocido']}
        onToggle={vi.fn()}
      />
    );

    expect(entry('Limpieza')).toHaveAttribute('aria-pressed', 'true');
    expect(entry('Ortodoncia')).toHaveAttribute('aria-pressed', 'false');
    expect(entry('Revisión')).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.queryByText('Mostrando todos los servicios')
    ).not.toBeInTheDocument();
  });

  it('con varios ids deja presionadas solo esas entradas', () => {
    render(
      <ServiceFilter
        services={SERVICES}
        selectedIds={['service-1', 'service-3']}
        onToggle={vi.fn()}
      />
    );

    expect(entry('Limpieza')).toHaveAttribute('aria-pressed', 'true');
    expect(entry('Ortodoncia')).toHaveAttribute('aria-pressed', 'false');
    expect(entry('Revisión')).toHaveAttribute('aria-pressed', 'true');
  });

  it('con selectedIds cubriendo todos los ids no muestra el texto de "todos"', () => {
    render(
      <ServiceFilter
        services={SERVICES}
        selectedIds={['service-1', 'service-2', 'service-3']}
        onToggle={vi.fn()}
      />
    );

    expect(
      screen.queryByText('Mostrando todos los servicios')
    ).not.toBeInTheDocument();
    expect(entry('Limpieza')).toHaveAttribute('aria-pressed', 'true');
    expect(entry('Ortodoncia')).toHaveAttribute('aria-pressed', 'true');
    expect(entry('Revisión')).toHaveAttribute('aria-pressed', 'true');
  });

  it('es operable por teclado con Enter y Espacio y refleja el estado aplicado', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { rerender } = render(
      <ServiceFilter
        services={SERVICES}
        selectedIds={['service-1']}
        onToggle={onToggle}
      />
    );

    entry('Ortodoncia').focus();
    await user.keyboard('{Enter}');
    expect(onToggle).toHaveBeenCalledWith('service-2');

    rerender(
      <ServiceFilter
        services={SERVICES}
        selectedIds={['service-1', 'service-2']}
        onToggle={onToggle}
      />
    );
    expect(entry('Ortodoncia')).toHaveAttribute('aria-pressed', 'true');

    entry('Ortodoncia').focus();
    await user.keyboard(' ');
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(onToggle).toHaveBeenLastCalledWith('service-2');
  });
});
