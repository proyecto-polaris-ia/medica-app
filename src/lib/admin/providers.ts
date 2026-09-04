import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { Provider, ProviderInput } from './types';
import { parseNonEmptyString, parseUuid } from './validate';
import { NotFoundError } from './errors';

const SELECT_COLUMNS = 'id, name, created_at, updated_at';

function mapRow(row: Record<string, unknown>): Provider {
  return {
    id: row.id as string,
    name: row.name as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listProviders(): Promise<Provider[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('providers')
    .select(SELECT_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapRow);
}

export async function getProvider(id: string): Promise<Provider> {
  const parsedId = parseUuid(id, 'id');
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('providers')
    .select(SELECT_COLUMNS)
    .eq('id', parsedId)
    .single();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new NotFoundError('Provider');
  }

  return mapRow(data);
}

function validateProviderInput(input: ProviderInput): { name: string } {
  return {
    name: parseNonEmptyString(input.name, 'name'),
  };
}

export async function createProvider(input: ProviderInput): Promise<Provider> {
  const payload = validateProviderInput(input);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('providers')
    .insert(payload)
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create provider');
  }

  return mapRow(data);
}

export async function updateProvider(
  id: string,
  input: ProviderInput
): Promise<Provider> {
  const parsedId = parseUuid(id, 'id');
  const payload = validateProviderInput(input);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('providers')
    .update(payload)
    .eq('id', parsedId)
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new NotFoundError('Provider');
  }

  return mapRow(data);
}

export async function deleteProvider(id: string): Promise<void> {
  const parsedId = parseUuid(id, 'id');
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('providers').delete().eq('id', parsedId);

  if (error) {
    throw new Error(error.message);
  }
}
