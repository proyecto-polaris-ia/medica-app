import Link from 'next/link';
import { getWccKnowledgeList } from '@/lib/wcc-knowledge';
import { KnowledgeForm } from './knowledge-form';
import { WccEmptyState, WccNotice } from '../components';
export const dynamic='force-dynamic';
export default async function Page(){const data=await getWccKnowledgeList(); return <main><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Knowledge</h2></div>{data.isConfiguredButUnavailable&&<WccNotice tone="warning">No se pudo leer knowledge.</WccNotice>}<section className="mt-4 grid gap-6 lg:grid-cols-[1fr_420px]"><div>{data.entries.length?<div className="overflow-hidden rounded-2xl border bg-white">{data.entries.map(e=><Link key={e.id} href={`/whatsapp-command-center/knowledge/${e.id}`} className="block border-b p-4 text-sm hover:bg-blue-50"><strong>{e.topic}</strong> · {e.status}<p className="mt-1 text-gray-600">{e.question}</p></Link>)}</div>:<WccEmptyState title="Sin knowledge" description="Crea respuestas aprobadas para que el agente pueda contestar preguntas frecuentes."/>}</div><KnowledgeForm/></section></main>}
