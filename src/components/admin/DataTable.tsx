import { ReactNode } from 'react';

export type Column<T> = {
  header: ReactNode;
  cell: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  onEdit: (row: T) => void;
  onDelete: (row: T) => void;
  onView?: (row: T) => void;
};

export function DataTable<T>({ columns, rows, onEdit, onDelete, onView }: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col, index) => (
              <th
                key={index}
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                {col.header}
              </th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="hover:bg-gray-50">
              {columns.map((col, colIndex) => (
                <td key={colIndex} className="px-4 py-3 text-sm text-gray-900">
                  {col.cell(row)}
                </td>
              ))}
              <td className="px-4 py-3 text-right text-sm font-medium">
                {onView && (
                  <button
                    onClick={() => onView(row)}
                    className="mr-3 text-green-600 hover:text-green-900"
                  >
                    Ver
                  </button>
                )}
                <button
                  onClick={() => onEdit(row)}
                  className="mr-3 text-blue-600 hover:text-blue-900"
                >
                  Editar
                </button>
                <button
                  onClick={() => onDelete(row)}
                  className="text-red-600 hover:text-red-900"
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
