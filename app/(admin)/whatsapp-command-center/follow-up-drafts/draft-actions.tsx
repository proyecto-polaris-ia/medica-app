'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FollowUpDraftStatus } from '@/lib/admin/follow-up/types';

export const FOLLOW_UP_DRAFTS_API = '/api/admin/follow-up/drafts';

/**
 * Acciones humanas del borrador: aprobar/rechazar (solo desde `draft`) y enviar
 * (solo desde `approved`). Un borrador `sent`/`sent_failed` no ofrece acciones.
 * Ninguna acción envía por sí sola: el envío exige `approved` y lo ejecuta la
 * ruta `.../send`.
 */
export function DraftActions({
  draftId,
  status,
}: {
  draftId: string;
  status: FollowUpDraftStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function decide(next: 'approved' | 'rejected') {
    setBusy(true);
    try {
      await fetch(`${FOLLOW_UP_DRAFTS_API}/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function send() {
    setBusy(true);
    try {
      await fetch(`${FOLLOW_UP_DRAFTS_API}/${draftId}/send`, {
        method: 'POST',
      });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  if (status === 'draft') {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void decide('approved')}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Aprobar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void decide('rejected')}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Rechazar
        </button>
      </div>
    );
  }

  if (status === 'approved') {
    return (
      <div className="mt-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void send()}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Enviar
        </button>
      </div>
    );
  }

  return null;
}
