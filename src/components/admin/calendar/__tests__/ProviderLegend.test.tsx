import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProviderLegend } from '../ProviderLegend';

const PROVIDERS = [
  { id: 'p1', name: 'Dra. Ana', color: '#1f77b4' },
  { id: 'p2', name: 'Dr. Beto', color: null },
];

function entry(name: string | RegExp) {
  return screen.getByRole('button', { name });
}

describe('ProviderLegend', () => {
  it('renderiza una entrada por proveedor con su swatch y color', () => {
    render(
      <ProviderLegend providers={PROVIDERS} selectedIds={[]} onToggle={vi.fn()} />
    );

    expect(screen.getByText('Dra. Ana')).toBeInTheDocument();
    expect(screen.getByText('Dr. Beto')).toBeInTheDocument();

    const swatches = screen.getAllByTestId('legend-swatch');
    expect(swatches).toHaveLength(2);
    expect(swatches[0]).toHaveStyle({ backgroundColor: '#1f77b4' });
    expect(swatches[1]).toHaveStyle({ backgroundColor: '#64748b' });
  });

  it('llama onToggle con el id de la entrada activada y solo con el id', async () => {
    const onToggle = vi.fn();
    render(
      <ProviderLegend providers={PROVIDERS} selectedIds={['p1']} onToggle={onToggle} />
    );

    await userEvent.click(entry('Dr. Beto'));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('p2');
  });

  it('con selectedIds=[] marca todas las entradas y comunica que se muestran todos', () => {
    render(
      <ProviderLegend providers={PROVIDERS} selectedIds={[]} onToggle={vi.fn()} />
    );

    expect(entry('Dra. Ana')).toHaveAttribute('aria-pressed', 'true');
    expect(entry('Dr. Beto')).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByText('Mostrando todos los proveedores')
    ).toBeInTheDocument();
  });

  it('marca aria-pressed según la selección y no encoge el universo', () => {
    render(
      <ProviderLegend providers={PROVIDERS} selectedIds={['p2']} onToggle={vi.fn()} />
    );

    expect(entry('Dra. Ana')).toHaveAttribute('aria-pressed', 'false');
    expect(entry('Dr. Beto')).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.queryByText('Mostrando todos los proveedores')
    ).not.toBeInTheDocument();
  });

  it('atenúa solo el swatch y mantiene la etiqueta legible en una entrada inactiva', () => {
    render(
      <ProviderLegend providers={PROVIDERS} selectedIds={['p2']} onToggle={vi.fn()} />
    );

    const inactive = entry('Dra. Ana');
    expect(inactive).toHaveAttribute('aria-pressed', 'false');
    expect(
      within(inactive).getByTestId('legend-swatch').className
    ).toContain('opacity-40');
    expect(inactive.className).toContain('text-gray-500');

    const active = entry('Dr. Beto');
    expect(active.className).toContain('text-gray-700');
    expect(active.className).toContain('font-medium');
  });

  it('no renderiza nada cuando no hay proveedores', () => {
    const { container } = render(
      <ProviderLegend providers={[]} selectedIds={[]} onToggle={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
    expect(
      screen.queryByText('Mostrando todos los proveedores')
    ).not.toBeInTheDocument();
  });

  it('tolera ids desconocidos sin alterar las entradas existentes', () => {
    render(
      <ProviderLegend
        providers={PROVIDERS}
        selectedIds={['p1', 'desconocido']}
        onToggle={vi.fn()}
      />
    );

    expect(entry('Dra. Ana')).toHaveAttribute('aria-pressed', 'true');
    expect(entry('Dr. Beto')).toHaveAttribute('aria-pressed', 'false');
  });

  it('es operable por teclado con Enter y Espacio y refleja el estado aplicado', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { rerender } = render(
      <ProviderLegend providers={PROVIDERS} selectedIds={['p1']} onToggle={onToggle} />
    );

    entry('Dr. Beto').focus();
    await user.keyboard('{Enter}');
    expect(onToggle).toHaveBeenCalledWith('p2');

    rerender(
      <ProviderLegend
        providers={PROVIDERS}
        selectedIds={['p1', 'p2']}
        onToggle={onToggle}
      />
    );
    expect(entry('Dr. Beto')).toHaveAttribute('aria-pressed', 'true');

    entry('Dr. Beto').focus();
    await user.keyboard(' ');
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(onToggle).toHaveBeenLastCalledWith('p2');
  });
});
