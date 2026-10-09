import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormModal } from './FormModal';

function renderModal(props: { size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full' } = {}) {
  return render(
    <FormModal
      title="Título del modal"
      onClose={vi.fn()}
      onSubmit={vi.fn()}
      submitLabel="Guardar"
      isSubmitting={false}
      {...props}
    >
      <span>contenido</span>
    </FormModal>
  );
}

function containerOf(title: string) {
  const heading = screen.getByText(title);
  const container = heading.closest('div');
  if (!container) throw new Error('No se encontró el contenedor del modal');
  return container;
}

describe('FormModal', () => {
  it('renders the container with max-w-lg by default when no size is provided', () => {
    renderModal();

    expect(containerOf('Título del modal')).toHaveClass('max-w-lg');
  });

  it('renders the container with max-w-4xl when size is "xl"', () => {
    renderModal({ size: 'xl' });

    expect(containerOf('Título del modal')).toHaveClass('max-w-4xl');
  });

  it('renders the container with max-w-md when size is "sm"', () => {
    renderModal({ size: 'sm' });

    expect(containerOf('Título del modal')).toHaveClass('max-w-md');
  });

  it('renders the container with max-w-full when size is "full"', () => {
    renderModal({ size: 'full' });

    expect(containerOf('Título del modal')).toHaveClass('max-w-full');
  });

  it('still renders title, children and action buttons', () => {
    renderModal({ size: 'xl' });

    expect(screen.getByText('Título del modal')).toBeInTheDocument();
    expect(screen.getByText('contenido')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
  });
});
