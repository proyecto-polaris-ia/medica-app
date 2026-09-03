'use client';

import { StateBlock } from './StateBlock';
import type { Provider } from './wizard-state';

export function ProviderStep({
  providers,
  loading,
  error,
  onSelect,
  onRetry,
}: {
  providers: Provider[];
  loading: boolean;
  error: string | null;
  onSelect: (provider: Provider) => void;
  onRetry: () => void;
}) {
  if (loading) {
    return <StateBlock state="loading" />;
  }

  if (error) {
    return <StateBlock state="error" message={error} onRetry={onRetry} />;
  }

  if (providers.length === 0) {
    return (
      <StateBlock
        state="empty"
        message="No hay especialistas disponibles."
        onRetry={onRetry}
      />
    );
  }

  return (
    <ul className="space-y-3" role="listbox" aria-label="Especialistas">
      {providers.map((provider) => (
        <li key={provider.id}>
          <button
            type="button"
            onClick={() => onSelect(provider)}
            className="w-full rounded-lg border border-gray-200 p-4 text-left hover:border-blue-500 hover:bg-blue-50"
          >
            {provider.name}
          </button>
        </li>
      ))}
    </ul>
  );
}
