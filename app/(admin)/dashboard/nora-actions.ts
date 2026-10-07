'use server';

/**
 * Server actions de confirmación humana de Nora (change
 * `nora-agenda-productiva`, Fase 2, design.md §5).
 *
 * Exigen un administrador autenticado (`requireUser`), registran quién decidió
 * y cuándo, y revalidan la ruta del dashboard. La única mutación de agenda
 * posible es la que ejecuta `applyAcceptedSuggestion` a través de
 * `rescheduleAppointment`; rechazar nunca mueve la cita.
 *
 * Revalidación: la guía local de Next.js (`node_modules/next/dist/docs/`) no
 * está disponible en esta instalación, así que se usó la API vigente de la
 * versión instalada (15.5.24), verificada en `node_modules/next/cache.d.ts`:
 * `revalidatePath(path, type?)` de `next/cache`.
 */

import { revalidatePath } from 'next/cache';
import {
  applyAcceptedSuggestion,
  rejectSuggestion,
  type ApplyResult,
  type RejectResult,
} from '@/lib/admin/nora/apply';
import { requireUser } from '@/lib/supabase/auth';

const DASHBOARD_PATH = '/dashboard';

/** Acepta y aplica una sugerencia `proposed` tras confirmación humana. */
export async function acceptSuggestionAction(
  suggestionId: string
): Promise<ApplyResult> {
  const user = await requireUser();
  const result = await applyAcceptedSuggestion({
    suggestionId,
    decidedBy: user.id,
    occurredAt: new Date(),
  });
  revalidatePath(DASHBOARD_PATH);
  return result;
}

/** Rechaza una sugerencia `proposed` sin tocar la cita asociada. */
export async function rejectSuggestionAction(
  suggestionId: string
): Promise<RejectResult> {
  const user = await requireUser();
  const result = await rejectSuggestion({
    suggestionId,
    decidedBy: user.id,
    decidedAt: new Date(),
  });
  revalidatePath(DASHBOARD_PATH);
  return result;
}
