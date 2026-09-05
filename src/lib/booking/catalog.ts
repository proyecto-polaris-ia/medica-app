import { getSupabaseAdmin } from '../supabase/server';

export type Service = {
  id: string;
  name: string;
  durationMinutes: number;
};

export type Provider = {
  id: string;
  name: string;
};

export async function listServices(): Promise<Service[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('services')
    .select('id, name, duration_minutes');

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    durationMinutes: row.duration_minutes,
  }));
}

export async function listProviders(): Promise<Provider[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('providers').select('id, name');

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
  }));
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export async function resolveServiceByName(nameQuery: string): Promise<Service | null> {
  const services = await listServices();
  const normalized = normalizeForMatch(nameQuery);
  return services.find((s) => normalizeForMatch(s.name).includes(normalized)) ?? null;
}

export async function resolveProviderByName(nameQuery: string): Promise<Provider | null> {
  const providers = await listProviders();
  const normalized = normalizeForMatch(nameQuery);
  return providers.find((p) => normalizeForMatch(p.name).includes(normalized)) ?? null;
}

export type KnowledgeEntryForResolution = {
  id: string;
  topic: string;
  tags: string[];
};

export async function resolveKnowledgeToService(
  knowledgeEntry: KnowledgeEntryForResolution
): Promise<Service | null> {
  // 1. Check explicit links first
  const explicitService = await getExplicitServiceLink(knowledgeEntry.id);
  if (explicitService) return explicitService;

  // 2. Fuzzy match against service names
  const services = await listServices();
  const normalizedTopic = normalizeForMatch(knowledgeEntry.topic);

  // Try topic match
  const topicMatch = services.find((s) => {
    const normalizedName = normalizeForMatch(s.name);
    return normalizedName.includes(normalizedTopic) || normalizedTopic.includes(normalizedName);
  });
  if (topicMatch) {
    logFuzzyMatch(knowledgeEntry.id, topicMatch.id, 'topic');
    return topicMatch;
  }

  // Try tags match
  for (const tag of knowledgeEntry.tags) {
    const normalizedTag = normalizeForMatch(tag);
    const tagMatch = services.find((s) => normalizeForMatch(s.name).includes(normalizedTag));
    if (tagMatch) {
      logFuzzyMatch(knowledgeEntry.id, tagMatch.id, 'tag');
      return tagMatch;
    }
  }

  // 3. Default to "Valoración general"
  const defaultService = services.find((s) => normalizeForMatch(s.name).includes('valoracion'));
  logUnresolvedMatch(knowledgeEntry.id);
  return defaultService ?? services[0] ?? null;
}

async function getExplicitServiceLink(knowledgeEntryId: string): Promise<Service | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('whatsapp_knowledge_service_links')
      .select('service:services(id, name, duration_minutes)')
      .eq('knowledge_entry_id', knowledgeEntryId)
      .maybeSingle();

    if (error || !data?.service) return null;
    const service = Array.isArray(data.service) ? data.service[0] : data.service;
    if (!service) return null;
    return { id: service.id, name: service.name, durationMinutes: service.duration_minutes };
  } catch {
    return null;
  }
}

function logFuzzyMatch(knowledgeEntryId: string, serviceId: string, matchType: 'topic' | 'tag') {
  console.log('[WhatsApp] Fuzzy match:', { knowledgeEntryId, serviceId, matchType, method: 'fuzzy' });
}

function logUnresolvedMatch(knowledgeEntryId: string) {
  console.log('[WhatsApp] Unresolved match, using default:', { knowledgeEntryId, method: 'default' });
}
