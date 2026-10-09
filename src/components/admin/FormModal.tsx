import { ReactNode } from 'react';

type FormModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';

const sizeClasses: Record<FormModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-6xl',
  full: 'max-w-full',
};

export function FormModal({
  title,
  children,
  onClose,
  onSubmit,
  submitLabel,
  isSubmitting,
  size = 'md',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  isSubmitting: boolean;
  size?: FormModalSize;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`w-full ${sizeClasses[size]} rounded-lg bg-white p-6 shadow-lg`}>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">{title}</h2>
        <div className="space-y-4">{children}</div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          {submitLabel && (
            <button
              type="button"
              onClick={onSubmit}
              disabled={isSubmitting}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Guardando...' : submitLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
