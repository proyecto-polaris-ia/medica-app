'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export const FOLLOW_UP_DRAFTS_API = '/api/admin/follow-up/drafts';

/**
 * Editor del texto de un borrador en estado `draft`.
 *
 * Guarda con `PATCH /api/admin/follow-up/drafts/<id>` con
 * `{ action: 'edit', body }`. **No envía nada**: el envío exige aprobación
 * humana explícita y vive en `.../[id]/send`. Un texto inválido responde 400 y
 * un borrador ya decidido responde 409; en ambos casos se muestra el error sin
 * recargar la página.
 */
export function DraftEditor({
  draftId,
  body,
}: {
  draftId: string;
  body: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${FOLLOW_UP_DRAFTS_API}/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'edit', body: text }),
      });
      if (!res.ok) {
        setError(
          'No se pudo guardar el borrador. Revisa el texto o vuelve a intentarlo.'
        );
        return;
      }
      router.refresh();
    } catch {
      setError('No se pudo guardar el borrador. Revisa tu conexión.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <label
        htmlFor={`draft-body-${draftId}`}
        className="block text-xs font-medium text-gray-600"
      >
        Texto del borrador
      </label>
      <textarea
        id={`draft-body-${draftId}`}
        aria-label="Texto del borrador"
        value={text}
        disabled={busy}
        onChange={(event) => setText(event.target.value)}
        rows={5}
        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none disabled:opacity-60"
      />
      <p className="mt-1 text-xs text-gray-500">
        El envío requiere aprobación; guardar no envía nada.
      </p>
      {error && (
        <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-900">
          {error}
        </p>
      )}
      <div className="mt-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-md bg-gray-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50"
        >
          Guardar cambios
        </button>
      </div>
    </div>
  );
}
