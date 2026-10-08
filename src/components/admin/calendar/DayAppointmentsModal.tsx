'use client';

import { useEffect, useId, useRef } from 'react';
import type { CalendarBlock } from '@/lib/admin/timezone';
import { statusLabel } from '@/lib/admin/appointment-labels';

type DayAppointmentsModalProps = {
  dayKey: string;
  blocks: CalendarBlock[];
  onClose: () => void;
  onSelectBlock: (id: string) => void;
  onSelectPatient?: (patientId: string) => void;
};

// Título legible del día a partir de la clave `YYYY-MM-DD`. Se arma la fecha
// con Date.UTC sobre las partes del wall-date y se formatea con `timeZone:
// 'UTC'` para que el día no se corra por la zona horaria del navegador.
const DAY_TITLE_FORMATTER = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatDayTitle(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  return DAY_TITLE_FORMATTER.format(new Date(Date.UTC(year, month - 1, day)));
}

// Selector de los elementos enfocables dentro del panel, para la trampa de
// foco simple con Tab (sin dependencias adicionales).
const FOCUSABLE_SELECTOR = 'button, [tabindex]:not([tabindex="-1"])';

export function DayAppointmentsModal({
  dayKey,
  blocks,
  onClose,
  onSelectBlock,
  onSelectPatient,
}: DayAppointmentsModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Orden defensivo por hora de inicio: `groupAppointmentsByDay` ya ordena,
  // pero el modal no confía en el orden del arreglo que recibe.
  const sortedBlocks = [...blocks].sort((a, b) =>
    a.startLabel.localeCompare(b.startLabel)
  );

  // Escape cierra el modal desde cualquier parte del documento.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Primer se cierra el modal y luego se dispara la acción: un solo modal a la
  // vez en la página.
  function handleSelectBlock(id: string) {
    onClose();
    onSelectBlock(id);
  }

  function handleSelectPatient(patientId: string) {
    onClose();
    onSelectPatient?.(patientId);
  }

  // Trampa de foco simple: al ciclar con Tab, el foco se queda en el panel.
  function handlePanelKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handlePanelKeyDown}
        className="flex h-full w-full flex-col bg-white sm:h-auto sm:max-w-lg sm:rounded-lg"
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 p-4">
          <h2
            id={titleId}
            className="text-lg font-semibold capitalize text-gray-900"
          >
            {formatDayTitle(dayKey)}
          </h2>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-2">
            {sortedBlocks.map((block) => (
              <div
                key={block.id}
                role="button"
                tabIndex={0}
                aria-label={`${block.startLabel} ${block.label}`}
                onClick={() => handleSelectBlock(block.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleSelectBlock(block.id);
                  }
                }}
                className="cursor-pointer rounded border border-gray-200 p-2 text-left hover:bg-gray-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-gray-900">
                    {block.startLabel}
                  </span>
                  <span className="text-xs font-medium text-gray-600">
                    {statusLabel(block.status)}
                  </span>
                </div>
                <div className="mt-0.5 text-sm text-gray-800">
                  {block.patientId && onSelectPatient ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleSelectPatient(block.patientId!);
                      }}
                      className="font-semibold text-blue-600 hover:underline"
                      aria-label={`Ver expediente de ${block.patientName}`}
                    >
                      {block.patientName}
                    </button>
                  ) : (
                    <span>{block.patientName}</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  <span>{block.serviceName}</span>
                  {block.providerName ? (
                    <span>
                      {' · '}
                      {block.providerName}
                    </span>
                  ) : null}
                </div>
                {block.notes ? (
                  <p className="mt-1 text-xs text-gray-600">{block.notes}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
