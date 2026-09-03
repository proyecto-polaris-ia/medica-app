import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  const sections = [
    { href: '/appointments', title: 'Citas', description: 'Gestiona las citas del consultorio.' },
    { href: '/patients', title: 'Pacientes', description: 'Administra los datos de los pacientes.' },
    { href: '/providers', title: 'Proveedores', description: 'Administra los doctores y proveedores.' },
    { href: '/services', title: 'Servicios', description: 'Configura los servicios y duraciones.' },
    { href: '/business-hours', title: 'Horarios', description: 'Define los horarios de atención.' },
    { href: '/booking', title: 'Reservar cita', description: 'Abre el asistente de reservas.' },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Dashboard</h1>
      <p className="mb-6 text-gray-600">
        Bienvenido al panel de administración. Selecciona una opción para
        comenzar.
      </p>
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
