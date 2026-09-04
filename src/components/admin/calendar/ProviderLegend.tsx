import { FALLBACK_COLOR } from '@/lib/admin/timezone';

type LegendProvider = {
  id: string;
  name: string;
  color: string | null;
};

type ProviderLegendProps = {
  providers: LegendProvider[];
};

export function ProviderLegend({ providers }: ProviderLegendProps) {
  if (providers.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium text-gray-700">Proveedores:</span>
      {providers.map((provider) => (
        <div key={provider.id} className="flex items-center gap-1.5">
          <span
            data-testid="legend-swatch"
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: provider.color || FALLBACK_COLOR }}
          />
          <span className="text-sm text-gray-700">{provider.name}</span>
        </div>
      ))}
    </div>
  );
}
