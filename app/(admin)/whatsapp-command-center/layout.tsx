import Link from 'next/link';
import { WccNavLink } from './nav-link';

const wccNav = [
  { href: '/whatsapp-command-center', label: 'Dashboard' },
  { href: '/whatsapp-command-center/contacts', label: 'Contactos' },
  { href: '/whatsapp-command-center/conversations', label: 'Conversaciones' },
  { href: '/whatsapp-command-center/escalations', label: 'Escalaciones' },
  { href: '/whatsapp-command-center/knowledge', label: 'Knowledge' },
];

export default function WccLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[calc(100vh-120px)]"><header className="mb-6 rounded-2xl border bg-white p-4 shadow-sm"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><Link href="/dashboard" className="text-sm font-medium text-blue-700">← Volver al dashboard</Link><h1 className="mt-2 text-2xl font-bold text-gray-950">WhatsApp Command Center</h1><p className="text-sm text-gray-600">Visibilidad operativa del agente, mensajes y escalaciones.</p></div><nav className="flex flex-wrap gap-2" aria-label="WhatsApp Command Center">{wccNav.map((item) => <WccNavLink key={item.href} href={item.href} label={item.label} />)}</nav></div></header>{children}</div>;
}
