'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
export function WccNavLink({ href, label }: { href: string; label: string }) { const pathname = usePathname(); const active = pathname === href; return <Link href={href} className={`rounded-full px-3 py-1 text-sm font-medium ${active ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-700'}`}>{label}</Link>; }
