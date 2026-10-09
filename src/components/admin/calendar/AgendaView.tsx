import { useMemo, useRef } from 'react';
import { CLINIC_TZ, clinicDayKey, getCalendarGrid } from '@/lib/admin/timezone';
import type { CalendarBlock } from '@/lib/admin/timezone';
import { statusLabel } from '@/lib/admin/appointment-labels';

type AgendaViewProps = {
  year: number;
  month: number;
  blocksByDay: Record<string, CalendarBlock[]>;
  /** Zona del observador para el día actual; default: zona de la clínica. */
  timeZone?: string;
  onSelectBlock: (id: string) => void;
  onSelectPatient?: (patientId: string) => void;
};

// Mismos estados atenuados que `DayCell` y `DayAppointmentsModal`.
const DIMMED_STATUSES = new Set(['cancelled', 'no_show']);

// Título legible del día a partir de la clave `YYYY-MM-DD`. Se arma la fecha
// con Date.UTC sobre las partes del wall-date y se formatea con `timeZone:
// 'UTC'` para que el día no se corra por la zona horaria del navegador (mismo
// criterio que el modal de citas del día).
const DAY_TITLE_FORMATTER = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('es-MX', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatDayTitle(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  return DAY_TITLE_FORMATTER.format(new Date(Date.UTC(year, month - 1, day)));
}

function formatMonthLabel(year: number, month: number): string {
  return MONTH_LABEL_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1)));
}

export function AgendaView({
  year,
  month,
  blocksByDay,
  timeZone = CLINIC_TZ,
  onSelectBlock,
  onSelectPatient,
}: AgendaViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Días del mes visible en orden ascendente. Se reutiliza `getCalendarGrid`
  // (lógica de día de pared ya probada) y se descartan los días de padding.
  const dayKeys = useMemo(
    () =>
      getCalendarGrid(year, month, timeZone)
        .filter((cell) => cell.inMonth && cell.dayKey !== null)
        .map((cell) => cell.dayKey as string),
    [year, month, timeZone]
  );

  // "Hoy" solo desplaza: si el día actual no pertenece al mes visible, el
  // elemento no existe y el handler no hace nada.
  function scrollToToday() {
    const container = scrollRef.current;
    if (!container) return;
    const todayKey = clinicDayKey(new Date().toISOString(), timeZone);
    const target = container.querySelector<HTMLElement>(
      `[data-day-key="${todayKey}"]`
    );
    if (target) {
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold capitalize text-gray-700">
          {formatMonthLabel(year, month)}
        </span>
        <button
          type="button"
          onClick={scrollToToday}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Hoy
        </button>
      </div>
      <div
        ref={scrollRef}
        data-testid="agenda-scroll"
        className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto"
      >
        {dayKeys.map((dayKey) => {
          // Orden defensivo por hora de inicio: `groupAppointmentsByDay` ya
          // ordena, pero la agenda no confía en el orden recibido.
          const dayBlocks = [...(blocksByDay[dayKey] ?? [])].sort((a, b) =>
            a.startLabel.localeCompare(b.startLabel)
          );
          return (
            <section
              key={dayKey}
              data-testid="agenda-day"
              data-day-key={dayKey}
              aria-labelledby={`agenda-day-${dayKey}`}
              className="scroll-mt-2"
            >
              <h3
                id={`agenda-day-${dayKey}`}
                className="sticky top-0 z-10 bg-white py-1 text-sm font-semibold capitalize text-gray-900"
              >
                {formatDayTitle(dayKey)}
              </h3>
              {dayBlocks.length === 0 ? (
                <p className="px-2 py-2 text-sm text-gray-500">Sin citas</p>
              ) : (
                <div className="mt-1 flex flex-col gap-2">
                  {dayBlocks.map((block) => (
                    <div
                      key={block.id}
                      data-testid="agenda-appointment"
                      role="button"
                      tabIndex={0}
                      aria-label={`${block.startLabel} ${block.label}`}
                      onClick={() => onSelectBlock(block.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelectBlock(block.id);
                        }
                      }}
                      className={[
                        'flex cursor-pointer flex-col gap-1 rounded border border-gray-200 p-2 text-left hover:bg-gray-50 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3',
                        DIMMED_STATUSES.has(block.status) ? 'opacity-50' : '',
                      ].join(' ')}
                    >
                      <span className="font-medium text-gray-900">
                        {block.startLabel}
                        {block.endLabel ? `–${block.endLabel}` : ''}
                      </span>
                      <span className="text-sm text-gray-800">
                        {block.patientId && onSelectPatient ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelectPatient(block.patientId!);
                            }}
                            className="font-semibold text-blue-600 hover:underline"
                            aria-label={`Ver expediente de ${block.patientName}`}
                          >
                            {block.patientName}
                          </button>
                        ) : (
                          <span>{block.patientName}</span>
                        )}
                      </span>
                      <span className="text-xs text-gray-500">
                        {block.serviceName}
                        {block.providerName ? ` · ${block.providerName}` : ''}
                      </span>
                      <span className="text-xs font-medium text-gray-600 sm:ml-auto">
                        {statusLabel(block.status)}
                      </span>
                      {block.notes ? (
                        <span className="text-xs text-gray-600 sm:basis-full">
                          {block.notes}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
