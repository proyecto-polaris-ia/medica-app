'use client';

import type { ReactNode } from 'react';

export function StepShell({
  title,
  children,
  onBack,
  onNext,
  nextDisabled,
  nextLabel,
}: {
  title: string;
  children: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
      <div className="flex justify-between pt-4">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
          >
            Atrás
          </button>
        ) : (
          <span />
        )}
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:bg-gray-300"
          >
            {nextLabel ?? 'Siguiente'}
          </button>
        )}
      </div>
    </div>
  );
}
