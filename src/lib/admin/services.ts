import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { Service, ServiceInput } from './types';
import {
  parseNonEmptyString,
  parsePositiveInt,
  parseUuid,
} from './validate';
import { NotFoundError } from './errors';

const SELECT_COLUMNS =
  'id, name, duration_minutes, created_at, updated_at';

function mapRow(row: Record<string, unknown>): Service {
  return {
    id: row.id as string,
    name: row.name as string,
    durationMinutes: row.duration_minutes as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listServices(): Promise<Service[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('services')
    .select(SELECT_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapRow);
}

function validateServiceInput(input: ServiceInput): {
  name: string;
  duration_minutes: number;
} {
  return {
    name: parseNonEmptyString(input.name, 'name'),
    duration_minutes: parsePositiveInt(input.durationMinutes, 'durationMinutes'),
  };
}

export async function createService(input: ServiceInput): Promise<Service> {
  const payload = validateServiceInput(input);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('services')
    .insert(payload)
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create service');
  }

  return mapRow(data);
}

export async function updateService(
  id: string,
  input: ServiceInput
): Promise<Service> {
  const parsedId = parseUuid(id, 'id');
  const payload = validateServiceInput(input);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('services')
    .update(payload)
    .eq('id', parsedId)
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new NotFoundError('Service');
  }

  return mapRow(data);
}

export async function deleteService(id: string): Promise<void> {
  const parsedId = parseUuid(id, 'id');
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('services').delete().eq('id', parsedId);

  if (error) {
    throw new Error(error.message);
  }
}
