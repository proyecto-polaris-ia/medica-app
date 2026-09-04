import Link from 'next/link';
import { getWccConversationsList } from '@/lib/wcc-conversations';
import { formatRelativeTime } from '@/lib/date-format';
import { WccEmptyState, WccNotice } from '../components';
export const dynamic='force-dynamic';
export default async function Page(){const data=await getWccConversationsList(); return <main><h2 className="text-xl font-bold">Conversaciones</h2>{data.isConfiguredButUnavailable&&<WccNotice tone="warning">No se pudieron leer las conversaciones.</WccNotice>}{data.conversations.length?<div className="mt-4 overflow-hidden rounded-2xl border bg-white">{data.conversations.map(c=><Link key={c.id} href={`/whatsapp-command-center/conversations/${c.id}`} className="block border-b p-4 text-sm hover:bg-blue-50"><strong>{c.contact?.displayName??c.contact?.phoneE164??c.id}</strong><br/><span className="text-gray-600">{c.status} · {c.lastIntent??'sin intent'} · {formatRelativeTime(c.lastMessageAt)}</span></Link>)}</div>:<WccEmptyState title="Sin conversaciones" description="Aún no hay hilos de WhatsApp."/>}</main>}
