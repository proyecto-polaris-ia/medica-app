import Link from 'next/link';
import { getWccContactsList } from '@/lib/wcc-contacts';
import { formatRelativeTime } from '@/lib/date-format';
import { WccEmptyState, WccNotice } from '../components';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams?:Promise<{page?:string}>}){const params=await searchParams; const data=await getWccContactsList(Number(params?.page??1)); return <main><h2 className="text-xl font-bold">Contactos WhatsApp</h2>{data.isConfiguredButUnavailable&&<WccNotice tone="warning">No se pudieron leer los contactos.</WccNotice>}{data.contacts.length? <div className="mt-4 overflow-hidden rounded-2xl border bg-white">{data.contacts.map(c=><Link key={c.id} href={`/whatsapp-command-center/contacts/${c.id}`} className="block border-b p-4 text-sm hover:bg-blue-50"><strong>{c.displayName??c.phoneE164}</strong><br/><span className="text-gray-600">{c.phoneE164} · {formatRelativeTime(c.lastMessageAt)}</span></Link>)}</div>:<WccEmptyState title="Sin contactos" description="Aún no hay contactos de WhatsApp."/>}</main>}
