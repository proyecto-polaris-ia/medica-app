import { getWccKnowledgeEntry } from '@/lib/wcc-knowledge';
import { KnowledgeForm } from '../knowledge-form';
import { KnowledgeStatusForm } from '../status-form';
import { WccNotice } from '../../components';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params; const data=await getWccKnowledgeEntry(id); return <main><h2 className="text-xl font-bold">Editar knowledge</h2>{data.isConfiguredButUnavailable&&<WccNotice tone="warning">No se pudo leer la entrada.</WccNotice>}{data.entry?<><div className="mt-4"><KnowledgeStatusForm entry={data.entry}/></div><div className="mt-4"><KnowledgeForm entry={data.entry}/></div></>:<p className="mt-4 text-sm text-gray-600">Entrada no encontrada.</p>}</main>}
