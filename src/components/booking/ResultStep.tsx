'use client';

import Link from 'next/link';
import { StateBlock } from './StateBlock';
import type { Slot } from './wizard-state';

const timeFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatGoogleCalendarDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function generateGoogleCalendarUrl(
  title: string,
  startAt: Date,
  endAt: Date,
  description?: string
): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${formatGoogleCalendarDate(startAt)}/${formatGoogleCalendarDate(endAt)}`,
    ...(description && { details: description }),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function generateIcsContent(
  title: string,
  startAt: Date,
  endAt: Date,
  description?: string
): string {
  const formatDate = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Medica App//EN',
    'BEGIN:VEVENT',
    `DTSTART:${formatDate(startAt)}`,
    `DTEND:${formatDate(endAt)}`,
    `SUMMARY:${title}`,
    ...(description ? [`DESCRIPTION:${description}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n');
}

function downloadIcs(
  title: string,
  startAt: Date,
  endAt: Date,
  description?: string
): void {
  const content = generateIcsContent(title, startAt, endAt, description);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'cita.ics';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

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
    const patientName = confirmation.patientName as string;
    const serviceName = confirmation.serviceName as string | undefined;
    const title = serviceName ? `Cita: ${serviceName}` : 'Cita médica';
    const description = `Paciente: ${patientName}`;
    
    const googleCalendarUrl = generateGoogleCalendarUrl(
      title,
      startAt,
      endAt,
      description
    );

    return (
      <div className="space-y-4 rounded-lg bg-green-50 p-6 text-center">
        <h3 className="text-lg font-semibold text-green-800">
          ¡Reserva confirmada!
        </h3>
        <p className="text-green-700">{patientName}</p>
        <p className="text-green-700">
          {timeFormatter.format(startAt)} – {timeFormatter.format(endAt)}
        </p>

        <div className="flex flex-col items-center gap-3 pt-2">
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-green-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span className="text-sm font-medium text-green-800">
              Agregar al calendario
            </span>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <a
              href={googleCalendarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-green-700 shadow-sm ring-1 ring-green-300 hover:bg-green-100"
            >
              Google Calendar
            </a>
            <button
              type="button"
              onClick={() => downloadIcs(title, startAt, endAt, description)}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-green-700 shadow-sm ring-1 ring-green-300 hover:bg-green-100"
            >
              Descargar .ics
            </button>
          </div>
        </div>

        <div className="pt-4">
          <Link
            href="/booking"
            className="inline-flex items-center gap-2 text-sm font-medium text-green-700 underline hover:text-green-900"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Registrar otra cita
          </Link>
        </div>
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
