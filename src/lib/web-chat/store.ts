import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { FlowState } from '@/lib/flows/types';

export type WebChatSession = {
  id: string;
  origin: string;
  phone_e164: string | null;
  flow_state: FlowState | null;
  last_intent: string | null;
  summary: string | null;
  status: string;
  created_at: string;
  last_activity: string;
  metadata: Record<string, unknown> | null;
};

export type WebChatMessage = {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

export async function createWebChatSession(): Promise<WebChatSession> {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from('web_chat_sessions')
    .insert({ status: 'open' })
    .select()
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Could not create web chat session');

  return data as WebChatSession;
}

export async function getWebChatSession(sessionId: string): Promise<WebChatSession | null> {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from('web_chat_sessions')
    .select()
    .eq('id', sessionId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as WebChatSession | null;
}

export async function updateWebChatSession(
  sessionId: string,
  updates: {
    phone_e164?: string;
    flow_state?: FlowState | null;
    last_intent?: string;
    summary?: string;
    status?: string;
    last_activity?: string;
  }
): Promise<void> {
  const client = getSupabaseAdmin();
  const { error } = await client
    .from('web_chat_sessions')
    .update({
      ...updates,
      last_activity: updates.last_activity ?? new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (error) throw new Error(error.message);
}

export async function insertWebChatMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<WebChatMessage> {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from('web_chat_messages')
    .insert({ session_id: sessionId, role, content })
    .select()
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Could not insert web chat message');

  return data as WebChatMessage;
}

export async function getWebChatHistory(
  sessionId: string,
  limit = 20
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from('web_chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []).reverse() as Array<{ role: 'user' | 'assistant'; content: string }>;
}
