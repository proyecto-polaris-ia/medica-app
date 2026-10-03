import { formatRelativeTime } from '@/lib/date-format';
import {
  getWccFollowUpDrafts,
  type WccFollowUpDraftRow,
} from '@/lib/wcc-follow-up-drafts';
import type { FollowUpDraftStatus } from '@/lib/admin/follow-up/types';
import { WccEmptyState, WccNotice } from '../components';
import { DraftActions } from './draft-actions';

export const dynamic = 'force-dynamic';

function statusLabel(status: FollowUpDraftStatus): string {
  switch (status) {
    case 'draft':
      return 'Borrador';
    case 'approved':
      return 'Aprobado';
    case 'rejected':
      return 'Rechazado';
    case 'sent':
      return 'Enviado';
    case 'sent_failed':
      return 'Envío falló';
  }
}

function statusTone(status: FollowUpDraftStatus): string {
  switch (status) {
    case 'draft':
      return 'border-amber-300 bg-amber-50 text-amber-900';
    case 'approved':
      return 'border-blue-200 bg-blue-50 text-blue-900';
    case 'sent':
      return 'border-emerald-300 bg-emerald-50 text-emerald-900';
    case 'rejected':
      return 'border-gray-300 bg-gray-50 text-gray-700';
    case 'sent_failed':
      return 'border-rose-300 bg-rose-50 text-rose-900';
  }
}

function DraftStatusBadge({ status }: { status: FollowUpDraftStatus }) {
  return (
    <span
      className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-xs font-medium ${statusTone(status)}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function DraftCard({ draft }: { draft: WccFollowUpDraftRow }) {
  return (
    <article className="rounded-2xl border bg-white p-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <strong className="text-sm text-gray-950">{draft.patientName}</strong>
        {draft.patientPhoneE164 ? (
          <span className="text-xs text-gray-500">{draft.patientPhoneE164}</span>
        ) : (
          <span className="text-xs text-gray-500">Teléfono sin registrar</span>
        )}
        <span className="text-xs text-gray-400">·</span>
        <DraftStatusBadge status={draft.status} />
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">
        {draft.body}
      </p>
      <p className="mt-2 text-xs text-gray-500">
        {formatRelativeTime(draft.createdAt)}
      </p>
      {draft.status === 'sent_failed' && draft.errorMessage && (
        <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-900">
          Error: {draft.errorMessage}
        </p>
      )}
      <DraftActions draftId={draft.id} status={draft.status} />
    </article>
  );
}

export default async function Page() {
  const queue = await getWccFollowUpDrafts();

  return (
    <main>
      <h2 className="text-xl font-bold">Borradores de seguimiento</h2>
      <p className="mt-1 text-sm text-gray-600">
        Borradores generados por plantilla para pacientes a contactar. Aprobar y
        enviar son acciones humanas explícitas; ningún borrador se envía solo.
      </p>

      {queue.isConfiguredButUnavailable && (
        <WccNotice tone="warning">
          No se pudieron leer los borradores. La base de datos no respondió como
          se esperaba.
        </WccNotice>
      )}

      {queue.drafts.length === 0 && !queue.isConfiguredButUnavailable ? (
        <div className="mt-4">
          <WccEmptyState
            title="Sin borradores"
            description="Cuando generes un borrador desde la lista de seguimiento aparecerá aquí para su aprobación."
          />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {queue.drafts.map((draft) => (
            <DraftCard key={draft.id} draft={draft} />
          ))}
        </div>
      )}
    </main>
  );
}
