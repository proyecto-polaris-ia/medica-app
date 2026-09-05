import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser, UnauthorizedError } from '@/lib/supabase/auth';
import { SignOutButton } from '@/components/admin/SignOutButton';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireUser();
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
    { href: '/providers', label: 'Proveedores' },
    { href: '/services', label: 'Servicios' },
    { href: '/business-hours', label: 'Horarios' },
    { href: '/appointments/new', label: 'Reservar cita' },
  ];

  return (
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
  );
}
