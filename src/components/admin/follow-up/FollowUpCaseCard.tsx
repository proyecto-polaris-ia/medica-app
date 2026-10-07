'use client';

import Link from 'next/link';
import type { FollowUpCase } from '@/lib/admin/follow-up/types';

const reasonDateFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Fecha del motivo presentada en `America/Mexico_City`. */
export function formatReasonDate(iso: string): string {
  return reasonDateFormatter.format(new Date(iso));
}

/**
 * Tarjeta de un caso de seguimiento con las acciones manuales.
 *
 * "Agendar cita" es un `<Link>` que solo navega al wizard existente; no crea
 * la cita ni cambia el estado de contacto. "Generar borrador" (y "Regenerar
 * borrador" cuando ya existe uno) hace `POST` a la API de borradores (no envía
 * nada) y, al generarse, ofrece un enlace al WhatsApp Command Center para su
 * aprobación.
 */
export function FollowUpCaseCard({
  followUpCase,
  onMarkContacted,
  onDismiss,
  onGenerateDraft,
  draftGenerated,
}: {
  followUpCase: FollowUpCase;
  onMarkContacted: (patientId: string) => void;
  onDismiss: (patientId: string) => void;
  onGenerateDraft: (patientId: string) => void;
  draftGenerated?: boolean;
}) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-950">
            {followUpCase.patientName}
          </h3>
          <p className="text-sm text-gray-600">
            {followUpCase.patientPhoneE164 ?? 'Teléfono sin registrar'}
          </p>
          <p className="mt-1 text-sm font-medium text-blue-800">
            {followUpCase.reasonLabel}
          </p>
          <time
            dateTime={followUpCase.reasonDate}
            className="text-xs text-gray-500"
          >
            {formatReasonDate(followUpCase.reasonDate)}
          </time>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onMarkContacted(followUpCase.patientId)}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Marcar contactado
          </button>
          <button
            type="button"
            onClick={() => onDismiss(followUpCase.patientId)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Descartar
          </button>
          <Link
            href={`/appointments/new?patientId=${followUpCase.patientId}`}
            className="rounded-md border border-blue-300 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            Agendar cita
          </Link>
          <button
            type="button"
            onClick={() => onGenerateDraft(followUpCase.patientId)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {draftGenerated ? 'Regenerar borrador' : 'Generar borrador'}
          </button>
          {draftGenerated && (
            <Link
              href="/whatsapp-command-center/follow-up-drafts"
              className="rounded-md border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
            >
              Aprobar en el centro de WhatsApp
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
