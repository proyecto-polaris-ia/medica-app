type PaginationProps = {
  /** Página activa (1-based). */
  page: number;
  /** Filas por página; `totalPages` se calcula a partir de él. */
  pageSize: number;
  /** Total de filas del conjunto filtrado (no solo de la página). */
  total: number;
  /** Navegación controlada: el consumidor decide qué hacer con la página. */
  onPageChange: (page: number) => void;
  /** Etiqueta accesible del `<nav>`; el consumidor la ajusta a su dominio. */
  ariaLabel?: string;
};

const ACTION_CLASS =
  'rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Control de paginación presentacional y reutilizable (design §1.5, D12).
 * No conoce el dominio de citas ni lee estado global o la URL: todo entra por
 * props. Con una sola página no muestra acciones de navegación; con `total = 0`
 * no renderiza nada (design §1.8).
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  ariaLabel = 'Paginación',
}: PaginationProps) {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;

  // Sin filas no hay nada que paginar.
  if (total <= 0 || totalPages <= 0) return null;

  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages;
  // Una sola página no muestra acciones; si la página activa quedó fuera de
  // rango se conservan para poder regresar a una página con filas (design §1.8).
  const showControls = totalPages > 1 || page > totalPages;

  return (
    <nav
      aria-label={ariaLabel}
      className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row"
    >
      {showControls && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Ir a la primera página"
            className={ACTION_CLASS}
            disabled={isFirstPage}
            onClick={() => onPageChange(1)}
          >
            Primera
          </button>
          <button
            type="button"
            aria-label="Ir a la página anterior"
            className={ACTION_CLASS}
            disabled={isFirstPage}
            onClick={() => onPageChange(page - 1)}
          >
            Anterior
          </button>
        </div>
      )}
      <p aria-current="page" className="text-sm text-gray-600">
        Página {page} de {totalPages} ({total} resultados)
      </p>
      {showControls && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Ir a la página siguiente"
            className={ACTION_CLASS}
            disabled={isLastPage}
            onClick={() => onPageChange(page + 1)}
          >
            Siguiente
          </button>
          <button
            type="button"
            aria-label="Ir a la última página"
            className={ACTION_CLASS}
            disabled={isLastPage}
            onClick={() => onPageChange(totalPages)}
          >
            Última
          </button>
        </div>
      )}
    </nav>
  );
}
