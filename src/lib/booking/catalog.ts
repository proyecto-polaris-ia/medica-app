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
