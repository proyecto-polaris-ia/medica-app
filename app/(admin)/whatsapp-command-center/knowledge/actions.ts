'use server';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/supabase/auth';
import { createWccKnowledgeEntry, updateWccKnowledgeEntry, updateWccKnowledgeStatus } from '@/lib/wcc-knowledge';

function readInput(formData: FormData) {
  return { topic: formData.get('topic'), question: formData.get('question'), answer: formData.get('answer'), tags: formData.get('tags'), source: formData.get('source'), status: formData.get('status') };
}

export async function createKnowledgeAction(formData: FormData): Promise<void> { await requireUser(); const result = await createWccKnowledgeEntry(readInput(formData)); if (result.ok && result.entryId) redirect(`/whatsapp-command-center/knowledge/${result.entryId}`); }
export async function updateKnowledgeAction(entryId: string, formData: FormData): Promise<void> { await requireUser(); await updateWccKnowledgeEntry(entryId, readInput(formData)); redirect(`/whatsapp-command-center/knowledge/${entryId}`); }
export async function updateKnowledgeStatusAction(entryId: string, formData: FormData): Promise<void> { await requireUser(); await updateWccKnowledgeStatus(entryId, formData.get('status')); redirect(`/whatsapp-command-center/knowledge/${entryId}`); }
