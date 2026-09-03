'use client';

import { StateBlock } from './StateBlock';
import type { Service } from './wizard-state';

export function ServiceStep({
  services,
  loading,
  error,
  onSelect,
  onRetry,
}: {
  services: Service[];
  loading: boolean;
  error: string | null;
  onSelect: (service: Service) => void;
  onRetry: () => void;
}) {
  if (loading) {
    return <StateBlock state="loading" />;
  }

  if (error) {
    return <StateBlock state="error" message={error} onRetry={onRetry} />;
  }

  if (services.length === 0) {
    return (
      <StateBlock
        state="empty"
        message="No hay servicios disponibles."
        onRetry={onRetry}
      />
    );
  }

  return (
    <ul className="space-y-3" role="listbox" aria-label="Servicios">
      {services.map((service) => (
        <li key={service.id}>
          <button
            type="button"
            onClick={() => onSelect(service)}
            className="w-full rounded-lg border border-gray-200 p-4 text-left hover:border-blue-500 hover:bg-blue-50"
          >
            <div className="font-medium">{service.name}</div>
            <div className="text-sm text-gray-600">
              {service.durationMinutes} minutos
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
