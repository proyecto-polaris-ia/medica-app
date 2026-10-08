import { FALLBACK_COLOR } from '@/lib/admin/timezone';

type LegendProvider = {
  id: string;
  name: string;
  color: string | null;
};

type ProviderLegendProps = {
  providers: LegendProvider[];
  selectedIds: string[];
  onToggle: (id: string) => void;
};

// Entrada activa: borde y etiqueta con contraste pleno.
const ACTIVE_ENTRY_CLASSES =
  'inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm font-medium text-gray-700 transition hover:bg-gray-50';

// Entrada inactiva: atenuada pero legible (text-gray-500 sobre blanco ≈ AA).
const INACTIVE_ENTRY_CLASSES =
  'inline-flex items-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-gray-500 transition hover:bg-gray-50';

export function ProviderLegend({
  providers,
  selectedIds,
  onToggle,
}: ProviderLegendProps) {
  if (providers.length === 0) return null;

  // `[]` significa "todos": una sola representación del estado sin filtro.
  const showAll = selectedIds.length === 0;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium text-gray-700">Proveedores:</span>
      {providers.map((provider) => {
        const isActive = showAll || selectedIds.includes(provider.id);
        return (
          <button
            key={provider.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onToggle(provider.id)}
            className={isActive ? ACTIVE_ENTRY_CLASSES : INACTIVE_ENTRY_CLASSES}
          >
            <span
              data-testid="legend-swatch"
              className={[
                'inline-block h-3 w-3 rounded-full',
                isActive ? '' : 'opacity-40',
              ].join(' ')}
              style={{ backgroundColor: provider.color || FALLBACK_COLOR }}
            />
            <span>{provider.name}</span>
          </button>
        );
      })}
      {showAll && (
        <span className="text-sm font-medium text-gray-700">
          Mostrando todos los proveedores
        </span>
      )}
    </div>
  );
}
