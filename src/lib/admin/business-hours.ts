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

export type ListBusinessHoursPageParams = {
  providerId?: string;
  page: number;
  pageSize: number;
};

export type ListBusinessHoursPageResult = {
  businessHours: BusinessHour[];
  total: number;
};

/** PostgREST responde 416 cuando el `offset` solicitado excede el total. */
function isRangeNotSatisfiable(error: {
  code?: string;
  message: string;
}): boolean {
  return error.code === 'PGRST103' || /range not satisfiable/i.test(error.message);
}

/**
 * Lectura paginada y filtrada del listado administrativo de horarios.
 *
 * El filtro por proveedor se aplica antes de `range()` y `total` sale del
 * `count: 'exact'` de la misma consulta, de modo que los metadatos describen el
 * conjunto ya filtrado. Orden estable: `created_at` desc con desempate `id`
 * desc. Una página fuera de rango (`PGRST103`) responde con `businessHours`
 * vacío y el `total` real, sin recortar la página solicitada.
 */
export async function listBusinessHoursPage(
  params: ListBusinessHoursPageParams
): Promise<ListBusinessHoursPageResult> {
  const providerId =
    params.providerId === undefined
      ? undefined
      : parseUuid(params.providerId, 'providerId');

  const buildQuery = () => {
    let query = getSupabaseAdmin()
      .from('business_hours')
      .select(SELECT_COLUMNS, { count: 'exact' });

    if (providerId) {
      query = query.eq('provider_id', providerId);
    }

    return query
      .order('created_at', { ascending: false })
      // Desempate estable para que la paginación no repita filas cuando
      // `created_at` tiene valores iguales.
      .order('id', { ascending: false });
  };

  const from = (params.page - 1) * params.pageSize;
  const { data, count, error } = await buildQuery().range(
    from,
    from + params.pageSize - 1
  );

  if (error) {
    // Una página más allá del total no es un error de negocio: PostgREST
    // responde 416 sin exponer el total, así que se repite la consulta con un
    // rango válido solo para recuperar el `count` exacto del conjunto filtrado.
    if (isRangeNotSatisfiable(error)) {
      const { count: total, error: countError } = await buildQuery().range(0, 0);
      if (countError) {
        throw new Error(countError.message);
      }
      return { businessHours: [], total: total ?? 0 };
    }

    throw new Error(error.message);
  }

  return {
    businessHours: (data ?? []).map(mapRow),
    total: count ?? 0,
  };
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
    // maybeSingle: con 0 filas devuelve data=null sin error, para poder
    // señalar NotFoundError (un .single() fallaría con PGRST116 antes del
    // manejo de no encontrado).
    .maybeSingle();

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
