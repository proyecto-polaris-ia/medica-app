'use client';

import { StateBlock } from './StateBlock';
import type { Slot } from './wizard-state';

const timeFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function ResultStep({
  confirmation,
  conflict,
  onAcceptNext,
  onDecline,
}: {
  confirmation: Record<string, unknown> | null;
  conflict: { message: string; nextAvailable: Slot | null } | null;
  onAcceptNext: () => void;
  onDecline: () => void;
}) {
  if (confirmation) {
    const startAt = new Date(confirmation.startAt as string);
    const endAt = new Date(confirmation.endAt as string);
    return (
      <div className="rounded-lg bg-green-50 p-6 text-center">
        <h3 className="text-lg font-semibold text-green-800">
          ¡Reserva confirmada!
        </h3>
        <p className="mt-2 text-green-700">
          {confirmation.patientName as string}
        </p>
        <p className="text-green-700">
          {timeFormatter.format(startAt)} – {timeFormatter.format(endAt)}
        </p>
      </div>
    );
  }

  if (conflict) {
    return (
      <div className="space-y-4 rounded-lg bg-yellow-50 p-6">
        <h3 className="text-lg font-semibold text-yellow-800">
          El horario ya no está disponible
        </h3>
        <p className="text-yellow-700">{conflict.message}</p>

        {conflict.nextAvailable ? (
          <div>
            <p className="text-sm text-gray-700">Próximo horario disponible:</p>
            <button
              type="button"
              onClick={onAcceptNext}
              className="mt-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
            >
              Reservar{' '}
              {timeFormatter.format(conflict.nextAvailable.start_at)}
            </button>
          </div>
        ) : (
          <StateBlock
            state="empty"
            message="Sin horarios en los próximos 30 días."
          />
        )}

        <button
          type="button"
          onClick={onDecline}
          className="text-sm text-gray-600 underline"
        >
          Elegir otro horario
        </button>
      </div>
    );
  }

  return null;
}
