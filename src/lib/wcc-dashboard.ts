import { getWhatsAppAiObservabilitySnapshot, type WhatsAppAiObservabilitySnapshot } from '@/lib/observability/whatsapp-ai';
import { createWccClient, isSupabaseConfigured as hasSupabaseConfig } from '@/lib/wcc-client';
import type { WhatsAppConversationStatus, WhatsAppKnowledgeStatus } from '@/types';

export type WccRecentConversation = { id: string; status: WhatsAppConversationStatus; lastIntent?: string; lastMessageAt?: string };
export type WccRecentContact = { id: string; displayName?: string; phoneE164: string; lastMessageAt?: string };
export type WccDashboardSummary = { isSupabaseConfigured: boolean; isConfiguredButUnavailable: boolean; openEscalations: number; recentConversationCount: number; recentContactCount: number; pendingMessageCount: number; failedMessageCount: number; knowledgeByStatus: Record<WhatsAppKnowledgeStatus, number>; recentConversations: WccRecentConversation[]; recentContacts: WccRecentContact[]; observability: WhatsAppAiObservabilitySnapshot };

type Query = { select: (...args: unknown[]) => Query; eq: (...args: unknown[]) => Query; in: (...args: unknown[]) => Query; order: (...args: unknown[]) => Query; range: (...args: unknown[]) => Promise<Result> };
type Client = { from: (table: string) => Query };
type Result<T = Record<string, unknown>> = { data?: T[] | null; error?: { message?: string } | null; count?: number | null };
const emptyKnowledge: Record<WhatsAppKnowledgeStatus, number> = { draft: 0, approved: 0, archived: 0 };
export const wccKnowledgeStatuses: WhatsAppKnowledgeStatus[] = ['draft', 'approved', 'archived'];

function emptySummary(overrides: Partial<WccDashboardSummary> = {}): WccDashboardSummary { return { isSupabaseConfigured: false, isConfiguredButUnavailable: false, openEscalations: 0, recentConversationCount: 0, recentContactCount: 0, pendingMessageCount: 0, failedMessageCount: 0, knowledgeByStatus: emptyKnowledge, recentConversations: [], recentContacts: [], observability: getWhatsAppAiObservabilitySnapshot(), ...overrides }; }
async function count(db: Client, table: string, apply?: (q: Query) => Query) { const q = db.from(table).select('id', { count: 'exact', head: true }); const r = await (apply ? apply(q) : q) as unknown as Result; if (r.error) throw new Error(r.error.message); return r.count ?? 0; }
async function recent<T>(q: Query, columns: string) { const r = await q.select(columns).order('last_message_at', { ascending: false }).range(0, 4) as Result<T>; if (r.error) throw new Error(r.error.message); return r.data ?? []; }
async function safe<T>(fn: () => Promise<T>, fallback: T) { try { return { value: await fn(), failed: false }; } catch { return { value: fallback, failed: true }; } }

export async function getWccDashboardSummary(): Promise<WccDashboardSummary> {
  if (!hasSupabaseConfig()) return emptySummary();
  const db = await createWccClient() as unknown as Client;
  const reads = await Promise.all([
    safe(() => count(db, 'whatsapp_escalations', (q) => q.eq('status', 'open')), 0),
    safe(() => count(db, 'whatsapp_conversations'), 0),
    safe(() => count(db, 'whatsapp_contacts'), 0),
    safe(() => count(db, 'whatsapp_messages', (q) => q.eq('direction', 'inbound').eq('status', 'received')), 0),
    safe(() => count(db, 'whatsapp_messages', (q) => q.eq('status', 'failed')), 0),
    safe(() => count(db, 'whatsapp_knowledge_entries', (q) => q.eq('status', 'draft')), 0),
    safe(() => count(db, 'whatsapp_knowledge_entries', (q) => q.eq('status', 'approved')), 0),
    safe(() => count(db, 'whatsapp_knowledge_entries', (q) => q.eq('status', 'archived')), 0),
    safe(() => recent<Record<string, unknown>>(db.from('whatsapp_conversations'), 'id, status, last_intent, last_message_at'), []),
    safe(() => recent<Record<string, unknown>>(db.from('whatsapp_contacts'), 'id, display_name, whatsapp_profile_name, phone_e164, last_message_at'), []),
  ]);
  const failed = reads.some((r) => r.failed);
  return { isSupabaseConfigured: true, isConfiguredButUnavailable: failed, openEscalations: reads[0].value as number, recentConversationCount: reads[1].value as number, recentContactCount: reads[2].value as number, pendingMessageCount: reads[3].value as number, failedMessageCount: reads[4].value as number, knowledgeByStatus: { draft: reads[5].value as number, approved: reads[6].value as number, archived: reads[7].value as number }, recentConversations: (reads[8].value as Record<string, unknown>[]).map((r) => ({ id: r.id as string, status: r.status as WhatsAppConversationStatus, lastIntent: r.last_intent as string | undefined, lastMessageAt: r.last_message_at as string | undefined })), recentContacts: (reads[9].value as Record<string, unknown>[]).map((r) => ({ id: r.id as string, displayName: (r.display_name || r.whatsapp_profile_name) as string | undefined, phoneE164: r.phone_e164 as string, lastMessageAt: r.last_message_at as string | undefined })), observability: getWhatsAppAiObservabilitySnapshot() };
}
