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
