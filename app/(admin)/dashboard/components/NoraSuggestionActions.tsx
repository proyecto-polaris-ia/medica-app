'use client';

/**
 * Controles de confirmación humana por sugerencia (change
 * `nora-agenda-productiva`, Fase 2, design.md §6).
 *
 * Llama a las server actions y muestra el resultado de la decisión. El doble
 * click es idempotente-safe por dos vías: guarda local (`busy`) mientras la
 * acción está en vuelo y guarda optimista en la base (`WHERE status='proposed'`).
 */

import { useRef, useState, useTransition } from 'react';
import { acceptSuggestionAction, rejectSuggestionAction } from '../nora-actions';

type Decision =
  | 'idle'
  | 'applied'
  | 'rejected'
  | 'expired'
  | 'conflict'
  | 'invalid_status'
  | 'already_decided'
  | 'not_found'
  | 'error';

const DECISION_MESSAGES: Record<Exclude<Decision, 'idle'>, string> = {
  applied: 'Reacomodo aplicado. La cita se movió al hueco sugerido.',
  rejected: 'Sugerencia rechazada. La cita no se movió.',
  expired:
    'La cita cambió de horario desde la propuesta; la sugerencia expiró y no se aplicó.',
  conflict:
    'El horario ya está ocupado. No se aplicó el reacomodo; la cita sigue igual.',
  invalid_status: 'La cita no puede reprogramarse en su estado actual.',
  already_decided: 'Esta sugerencia ya fue decidida.',
  not_found: 'La sugerencia ya no existe.',
  error: 'No se pudo procesar la decisión. Intenta de nuevo.',
};

export function NoraSuggestionActions({
  suggestionId,
}: {
  suggestionId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [decision, setDecision] = useState<Decision>('idle');
  const busy = useRef(false);

  const decide = (accept: boolean) => {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      try {
        if (accept) {
          const result = await acceptSuggestionAction(suggestionId);
          setDecision(result.ok ? 'applied' : result.reason);
        } else {
          const result = await rejectSuggestionAction(suggestionId);
          setDecision(result.ok ? 'rejected' : result.reason);
        }
      } catch {
        setDecision('error');
      } finally {
        busy.current = false;
      }
    });
  };

  const decided = decision !== 'idle';

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => decide(true)}
          disabled={pending || decided}
          className="rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Aceptar
        </button>
        <button
          type="button"
          onClick={() => decide(false)}
          disabled={pending || decided}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Rechazar
        </button>
      </div>
      {pending ? (
        <p className="text-xs text-gray-500">Procesando decisión…</p>
      ) : null}
      {decided ? (
        <p role="status" className="text-xs font-medium text-gray-700">
          {DECISION_MESSAGES[decision as Exclude<Decision, 'idle'>]}
        </p>
      ) : null}
    </div>
  );
}
