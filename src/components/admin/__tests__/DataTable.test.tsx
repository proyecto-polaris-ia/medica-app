import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable } from '../DataTable';

type Row = { id: string; name: string };

const COLUMNS = [{ header: 'Nombre', cell: (row: Row) => row.name }];
const ROWS: Row[] = [{ id: '1', name: 'Dra. García' }];

describe('DataTable', () => {
  it('renders Ver button when onView is provided', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onView={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Ver' })).toBeInTheDocument();
  });

  it('does not render Ver button when onView is omitted', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: 'Ver' })).not.toBeInTheDocument();
  });

  it('calls onView with the row when Ver is clicked', async () => {
    const onView = vi.fn();
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onView={onView}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));

    expect(onView).toHaveBeenCalledWith(ROWS[0]);
  });
});
