'use client';

const steps = [
  'Servicio',
  'Especialista',
  'Horario',
  'Confirmar',
  'Resultado',
];

export function StepIndicator({ current }: { current: number }) {
  return (
    <nav aria-label="Progreso" className="mb-6">
      <ol className="flex justify-between">
        {steps.map((label, index) => {
          const number = index + 1;
          const active = number === current;
          const completed = number < current;

          return (
            <li key={label} className="flex flex-1 flex-col items-center">
              <span
                className={[
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold',
                  active
                    ? 'bg-blue-600 text-white'
                    : completed
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-200 text-gray-600',
                ].join(' ')}
              >
                {number}
              </span>
              <span className="mt-1 hidden text-xs sm:inline">{label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
