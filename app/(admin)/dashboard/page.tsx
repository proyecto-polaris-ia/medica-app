import Link from 'next/link';
import { getDashboardMetrics } from '@/lib/admin/metrics/loader';
import { getNoraView } from '@/lib/admin/nora/loader';
import { MetricsRangeSelector } from './components/MetricsRangeSelector';
import { MetricsSection } from './components/MetricsSection';
import { NoraSection } from './components/NoraSection';

export const dynamic = 'force-dynamic';

const sections = [
  { href: '/appointments', title: 'Citas', description: 'Gestiona las citas del consultorio.' },
  { href: '/patients', title: 'Pacientes', description: 'Administra los datos de los pacientes.' },
  { href: '/providers', title: 'Proveedores', description: 'Administra los doctores y proveedores.' },
  { href: '/services', title: 'Servicios', description: 'Configura los servicios y duraciones.' },
  { href: '/business-hours', title: 'Horarios', description: 'Define los horarios de atención.' },
  { href: '/appointments/new', title: 'Reservar cita', description: 'Registra una cita para un paciente.' },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const params = (await searchParams) ?? {};
  // Mismo rango (preset/from/to) para ambos loaders, resueltos en paralelo.
  const [view, noraView] = await Promise.all([
    getDashboardMetrics(params),
    getNoraView(params),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Dashboard</h1>
      <p className="mb-6 text-gray-600">
        Bienvenido al panel de administración. Selecciona una opción para
        comenzar.
      </p>

      <MetricsRangeSelector preset={view.preset} from={params.from} to={params.to} />
      <MetricsSection view={view} />
      <NoraSection view={noraView} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-lg border bg-white p-6 shadow-sm transition hover:shadow-md"
          >
            <h2 className="mb-2 text-lg font-semibold text-blue-700">
              {section.title}
            </h2>
            <p className="text-sm text-gray-600">{section.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
