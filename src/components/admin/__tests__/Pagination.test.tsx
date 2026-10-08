import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from '../Pagination';

function renderPagination(
  props: Partial<Parameters<typeof Pagination>[0]> = {}
) {
  return render(
    <Pagination
      page={1}
      pageSize={20}
      total={0}
      onPageChange={vi.fn()}
      ariaLabel="Paginación de citas"
      {...props}
    />
  );
}

describe('Pagination', () => {
  it('renders the "Página X de Y" indicator with the total results', () => {
    renderPagination({ page: 2, total: 100 });

    expect(
      screen.getByText('Página 2 de 5 (100 resultados)')
    ).toBeInTheDocument();
  });

  it('computes totalPages from total and pageSize (different pageSize)', () => {
    renderPagination({ page: 1, pageSize: 7, total: 21 });

    expect(screen.getByText('Página 1 de 3 (21 resultados)')).toBeInTheDocument();
  });

  it('renders nothing when total is 0', () => {
    renderPagination({ page: 1, total: 0 });

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('does not render navigation controls with a single page', () => {
    renderPagination({ page: 1, total: 20 });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Página 1 de 1 (20 resultados)')).toBeInTheDocument();
  });

  it('renders the four navigation actions when there is more than one page', () => {
    renderPagination({ page: 2, total: 100 });

    expect(
      screen.getByRole('button', { name: 'Ir a la primera página' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ir a la página anterior' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ir a la página siguiente' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ir a la última página' })
    ).toBeInTheDocument();
  });

  it('disables first/previous on the first page and keeps next/last enabled', () => {
    renderPagination({ page: 1, total: 100 });

    expect(
      screen.getByRole('button', { name: 'Ir a la primera página' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Ir a la página anterior' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Ir a la página siguiente' })
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Ir a la última página' })
    ).toBeEnabled();
  });

  it('disables next/last on the last page and keeps first/previous enabled', () => {
    renderPagination({ page: 5, total: 100 });

    expect(
      screen.getByRole('button', { name: 'Ir a la primera página' })
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Ir a la página anterior' })
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Ir a la página siguiente' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Ir a la última página' })
    ).toBeDisabled();
  });

  it('keeps every action enabled on a middle page', () => {
    renderPagination({ page: 3, total: 100 });

    expect(
      screen.getByRole('button', { name: 'Ir a la primera página' })
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Ir a la página anterior' })
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Ir a la página siguiente' })
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Ir a la última página' })
    ).toBeEnabled();
  });

  it('calls onPageChange with the right page for each action', async () => {
    const onPageChange = vi.fn();
    renderPagination({ page: 3, total: 100, onPageChange });
    const user = userEvent.setup();

    await user.click(
      screen.getByRole('button', { name: 'Ir a la primera página' })
    );
    await user.click(
      screen.getByRole('button', { name: 'Ir a la página anterior' })
    );
    await user.click(
      screen.getByRole('button', { name: 'Ir a la página siguiente' })
    );
    await user.click(
      screen.getByRole('button', { name: 'Ir a la última página' })
    );

    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 2);
    expect(onPageChange).toHaveBeenNthCalledWith(3, 4);
    expect(onPageChange).toHaveBeenNthCalledWith(4, 5);
  });

  it('marks the current page indicator with aria-current', () => {
    renderPagination({ page: 2, total: 100 });

    expect(
      screen.getByText('Página 2 de 5 (100 resultados)')
    ).toHaveAttribute('aria-current', 'page');
  });

  it('exposes the container as a labelled navigation region', () => {
    renderPagination({ page: 2, total: 100 });

    expect(
      screen.getByRole('navigation', { name: 'Paginación de citas' })
    ).toBeInTheDocument();
  });

  it('renders native keyboard-operable buttons', () => {
    renderPagination({ page: 2, total: 100 });

    for (const button of screen.getAllByRole('button')) {
      expect(button.tagName).toBe('BUTTON');
      expect(button).toHaveAttribute('type', 'button');
    }
  });

  it('keeps controls visible when the active page is beyond the total', () => {
    // Página fuera de rango con resultados existentes (design §1.8): se
    // conservan las acciones para poder regresar a una página con filas.
    renderPagination({ page: 9, total: 5 });

    expect(
      screen.getByRole('button', { name: 'Ir a la primera página' })
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Ir a la última página' })
    ).toBeDisabled();
    expect(screen.getByText('Página 9 de 1 (5 resultados)')).toBeInTheDocument();
  });
});
