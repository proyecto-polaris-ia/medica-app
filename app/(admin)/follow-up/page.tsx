import { FollowUpList } from '@/components/admin/follow-up/FollowUpList';

export const dynamic = 'force-dynamic';

/**
 * Página admin de la lista diaria de pacientes a contactar.
 *
 * Server component delgado (patrón `appointments/new/page.tsx`): la protección
 * de sesión la aporta el layout admin (`requireUser()` + redirect) y la data se
 * carga por client-fetch en `FollowUpList` contra la API autenticada.
 */
export default function FollowUpPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-950">
          Seguimiento del día
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-600">
          Pacientes a contactar según las reglas de seguimiento. Marca cada caso
          como contactado o descartado, o agenda una cita en el wizard.
        </p>
      </div>
      <FollowUpList />
    </div>
  );
}
