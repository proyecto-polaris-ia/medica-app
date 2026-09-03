import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { BusinessHour, BusinessHourInput } from './types';
import {
  parseDayOfWeek,
  parseTime,
  parseUuid,
  ValidationError,
} from './validate';
import { NotFoundError } from './errors';

const SELECT_COLUMNS =
  'id, provider_id, day_of_week, start_time, end_time, created_at, updated_at';

function mapRow(row: Record<string, unknown>): BusinessHour {
  return {
    id: row.id as string,
    providerId: row.provider_id as string,
    dayOfWeek: row.day_of_week as number,
    startTime: row.start_time as string,
    endTime: row.end_time as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listBusinessHours(): Promise<BusinessHour[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('business_hours')
    .select(SELECT_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapRow);
}

function validateBusinessHourInput(
  input: BusinessHourInput
): {
  provider_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
} {
  const startTime = parseTime(input.startTime, 'startTime');
  const endTime = parseTime(input.endTime, 'endTime');
  if (startTime >= endTime) {
    throw new ValidationError('endTime', 'endTime must be after startTime');
  }

  return {
    provider_id: parseUuid(input.providerId, 'providerId'),
    day_of_week: parseDayOfWeek(input.dayOfWeek, 'dayOfWeek'),
    start_time: startTime,
    end_time: endTime,
  };
}

export async function createBusinessHour(
  input: BusinessHourInput
): Promise<BusinessHour> {
  const payload = validateBusinessHourInput(input);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('business_hours')
    .insert(payload)
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create business hour');
  }

  return mapRow(data);
}

export async function updateBusinessHour(
  id: string,
  input: BusinessHourInput
): Promise<BusinessHour> {
  const parsedId = parseUuid(id, 'id');
  const payload = validateBusinessHourInput(input);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('business_hours')
    .update(payload)
    .eq('id', parsedId)
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new NotFoundError('Business hour');
  }

  return mapRow(data);
}

export async function deleteBusinessHour(id: string): Promise<void> {
  const parsedId = parseUuid(id, 'id');
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('business_hours')
    .delete()
    .eq('id', parsedId);

  if (error) {
    throw new Error(error.message);
  }
}
