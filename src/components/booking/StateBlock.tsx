'use client';

type StateBlockProps = {
  state: 'loading' | 'empty' | 'error';
  message?: string;
  onRetry?: () => void;
};

export function StateBlock({ state, message, onRetry }: StateBlockProps) {
  if (state === 'loading') {
    return (
      <div
        data-testid="state-loading"
        className="animate-pulse space-y-3 rounded-lg bg-gray-100 p-6"
      >
        <div className="h-4 w-3/4 rounded bg-gray-200" />
        <div className="h-4 w-1/2 rounded bg-gray-200" />
        <div className="h-4 w-2/3 rounded bg-gray-200" />
      </div>
    );
  }

  if (state === 'empty') {
    return (
      <p data-testid="state-empty" className="text-gray-600">
        {message ?? 'No hay opciones disponibles.'}
      </p>
    );
  }

  return (
    <div data-testid="state-error" className="rounded-lg bg-red-50 p-4">
      <p className="text-red-700">{message ?? 'Ocurrió un error.'}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-sm font-medium text-red-700 underline"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}
