type FilterService = {
  id: string;
  name: string;
};

type ServiceFilterProps = {
  services: FilterService[];
  selectedIds: string[];
  onToggle: (id: string) => void;
};

// Entrada activa: borde y etiqueta con contraste pleno.
const ACTIVE_ENTRY_CLASSES =
  'inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm font-medium text-gray-700 transition hover:bg-gray-50';

// Entrada inactiva: atenuada pero legible (text-gray-500 sobre blanco ≈ AA).
const INACTIVE_ENTRY_CLASSES =
  'inline-flex items-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-gray-500 transition hover:bg-gray-50';

// Control de alternancia multi-selección de servicios del calendario. Espejo
// del contrato de `ProviderLegend` (aria-pressed, `[]` = todos), pero **sin
// swatch**: `Service` no tiene color (design.md §1, opción C; D5).
export function ServiceFilter({
  services,
  selectedIds,
  onToggle,
}: ServiceFilterProps) {
  if (services.length === 0) return null;

  // `[]` significa "todos": una sola representación del estado sin filtro.
  const showAll = selectedIds.length === 0;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium text-gray-700">Servicios:</span>
      {services.map((service) => {
        const isSelected = selectedIds.includes(service.id);
        const isActive = showAll || isSelected;
        const entryClasses = isActive
          ? ACTIVE_ENTRY_CLASSES
          : INACTIVE_ENTRY_CLASSES;
        return (
          <button
            key={service.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onToggle(service.id)}
            className={entryClasses}
          >
            <span>{service.name}</span>
          </button>
        );
      })}
      {showAll && (
        <span className="text-sm font-medium text-gray-700">
          Mostrando todos los servicios
        </span>
      )}
    </div>
  );
}
