import { getViewerTimezone } from '@/lib/admin/viewer-timezone';
import { TimezoneSettingsForm } from '@/components/admin/settings/TimezoneSettingsForm';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const timezone = await getViewerTimezone();

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Configuración</h1>
      <p className="mb-6 text-sm text-gray-600">
        Preferencias de tu cuenta. La zona horaria define cómo se muestran las
        horas de las citas para ti; no altera la operación del consultorio.
      </p>
      <TimezoneSettingsForm initialTimezone={timezone} />
    </div>
  );
}
