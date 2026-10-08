import { redirect } from 'next/navigation';
import Link from 'next/link';
import { UnauthorizedError } from '@/lib/supabase/auth';
import { getViewerTimezone } from '@/lib/admin/viewer-timezone';
import { TimezoneProvider } from '@/components/admin/TimezoneProvider';
import { SignOutButton } from '@/components/admin/SignOutButton';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // La preferencia se resuelve una sola vez por request (getViewerTimezone usa
  // `cache` de React); requireUser() dentro de ella también valida la sesión.
  let timezone: string;
  try {
    timezone = await getViewerTimezone();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect('/login');
    }
    throw error;
  }

  const navItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/appointments', label: 'Citas' },
    { href: '/patients', label: 'Pacientes' },
    { href: '/accounts-receivable', label: 'Cartera' },
    { href: '/providers', label: 'Proveedores' },
    { href: '/services', label: 'Servicios' },
    { href: '/business-hours', label: 'Horarios' },
    { href: '/appointments/new', label: 'Reservar cita' },
    { href: '/follow-up', label: 'Seguimiento' },
    { href: '/whatsapp-command-center', label: 'WhatsApp' },
    { href: '/settings', label: 'Configuración' },
  ];

  return (
    <TimezoneProvider timezone={timezone}>
      <div className="min-h-screen bg-gray-50">
        <header className="border-b bg-white shadow-sm">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
            <Link href="/dashboard" className="text-xl font-bold text-blue-700">
              Medica Admin
            </Link>
            <nav className="hidden gap-4 md:flex">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm font-medium text-gray-700 hover:text-blue-700"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <SignOutButton />
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
      </div>
    </TimezoneProvider>
  );
}
