'use client';

import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/admin/EmptyState';
import { ErrorState } from '@/components/admin/ErrorState';
import { LoadingState } from '@/components/admin/LoadingState';
import { FOLLOW_UP_REASON_PRIORITY } from '@/lib/admin/follow-up/config';
import { followUpReasonLabel } from '@/lib/admin/follow-up/rules';
import type { FollowUpCase } from '@/lib/admin/follow-up/types';
import { FollowUpCaseCard } from './FollowUpCaseCard';

export const FOLLOW_UP_LIST_ENDPOINT = '/api/admin/follow-up';
export const FOLLOW_UP_CONTACTS_ENDPOINT = '/api/admin/follow-up/contacts';

type FollowUpContactStatus = 'contacted' | 'dismissed';

type ReasonGroup = {
  reason: FollowUpCase['reason'];
  label: string;
  cases: FollowUpCase[];
};

/** Agrupa los casos por motivo respetando la prioridad canónica. */
export function groupCasesByReason(cases: FollowUpCase[]): ReasonGroup[] {
  return FOLLOW_UP_REASON_PRIORITY.map((reason) => ({
    reason,
    label: followUpReasonLabel(reason),
    cases: cases.filter((item) => item.reason === reason),
  })).filter((group) => group.cases.length > 0);
}

/**
 * Lista del día de pacientes a contactar.
 *
 * Carga la data por `fetch('/api/admin/follow-up')` (patrón client-fetch de
 * `accounts-receivable`), la agrupa por motivo y ofrece las acciones manuales.
 * "Marcar contactado" y "Descartar" hacen `POST` al endpoint de contactos y
 * recargan la lista; "Agendar cita" solo navega al wizard.
 */
export function FollowUpList() {
  const [cases, setCases] = useState<FollowUpCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(FOLLOW_UP_LIST_ENDPOINT);
      if (!res.ok) {
        throw new Error('No se pudo cargar la lista de seguimiento.');
      }
      const data = (await res.json()) as { cases?: FollowUpCase[] };
      setCases(data.cases ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  const submitContact = useCallback(
    async (patientId: string, status: FollowUpContactStatus) => {
      try {
        await fetch(FOLLOW_UP_CONTACTS_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patientId, status }),
        });
      } finally {
        await loadCases();
      }
    },
    [loadCases]
  );

  if (loading) {
    return <LoadingState message="Cargando lista de seguimiento..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={loadCases} />;
  }

  if (cases.length === 0) {
    return <EmptyState message="No hay pacientes por contactar hoy." />;
  }

  return (
    <div className="space-y-6">
      {groupCasesByReason(cases).map((group) => (
        <section
          key={group.reason}
          aria-label={group.label}
          className="space-y-3"
        >
          <h2 className="text-lg font-semibold text-gray-950">{group.label}</h2>
          <div className="space-y-3">
            {group.cases.map((item) => (
              <FollowUpCaseCard
                key={item.patientId}
                followUpCase={item}
                onMarkContacted={(patientId) =>
                  void submitContact(patientId, 'contacted')
                }
                onDismiss={(patientId) =>
                  void submitContact(patientId, 'dismissed')
                }
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
