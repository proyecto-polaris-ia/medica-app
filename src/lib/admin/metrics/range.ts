/**
 * Resolución de presets y rangos en la zona de la clínica (issue #88,
 * design.md §1.2 y §7).
 *
 * Todas las ventanas son intervalos semiabiertos `[start, end)` en UTC con
 * límites a medianoche local de `America/Mexico_City`. La conversión
 * "fecha local → UTC" reutiliza `clinicMonthRangeUtc` (que ya aplica
 * `utcFromClinicParts`) en lugar de duplicar la aritmética de offset; MX no
 * observa horario de verano (UTC−6 fijo), así que avanzar días con 24 h es
 * exacto, igual que en `clinic-time.ts`.
 */

import { clinicDayKey, clinicMonthRangeUtc } from '../timezone';
import type { ClinicRange, MetricsPreset } from './types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type ResolvedRange = { preset: MetricsPreset; range: ClinicRange };

/** Medianoche local del día `key` (`YYYY-MM-DD`); `null` si es inválida. */
export function clinicDateKeyToUtc(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return null;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;

  const { startAt } = clinicMonthRangeUtc(year, month);
  return new Date(new Date(startAt).getTime() + (day - 1) * MS_PER_DAY);
}

/** `[from 00:00, to+1d 00:00)` en la zona clínica; `null` si es inválido. */
export function clinicDateRangeUtc(
  from: string,
  to: string
): ClinicRange | null {
  const start = clinicDateKeyToUtc(from);
  const endDay = clinicDateKeyToUtc(to);
  if (!start || !endDay) return null;

  const end = new Date(endDay.getTime() + MS_PER_DAY);
  if (end.getTime() <= start.getTime()) return null;

  return { start, end };
}

function monthRange(now: Date): ClinicRange {
  const dayKey = clinicDayKey(now.toISOString());
  const [year, month] = dayKey.split('-').map(Number);
  const { startAt, endAt } = clinicMonthRangeUtc(year, month);
  return { start: new Date(startAt), end: new Date(endAt) };
}

function weekRange(now: Date): ClinicRange {
  const dayKey = clinicDayKey(now.toISOString());
  const [year, month, day] = dayKey.split('-').map(Number);
  const localDay = new Date(Date.UTC(year, month - 1, day));
  // 0 = domingo .. 6 = sábado; el lunes es el inicio de semana clínica.
  const offsetToMonday = (localDay.getUTCDay() + 6) % 7;
  const monday = new Date(localDay.getTime() - offsetToMonday * MS_PER_DAY);
  const mondayKey = `${monday.getUTCFullYear()}-${String(
    monday.getUTCMonth() + 1
  ).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;

  const start = clinicDateKeyToUtc(mondayKey);
  // `mondayKey` deriva de una fecha clínica válida, así que `start` no es null.
  const startDate = start ?? new Date(0);
  return { start: startDate, end: new Date(startDate.getTime() + 7 * MS_PER_DAY) };
}

/**
 * Resuelve el rango seleccionado. `custom` inválido o incompleto cae al mes
 * clínico actual; cualquier preset desconocido también.
 */
export function resolveRange(
  params: { preset?: string; from?: string; to?: string },
  now: Date
): ResolvedRange {
  if (params.preset === 'custom') {
    const custom =
      params.from && params.to
        ? clinicDateRangeUtc(params.from, params.to)
        : null;
    if (custom) return { preset: 'custom', range: custom };
    return { preset: 'month', range: monthRange(now) };
  }

  if (params.preset === 'week') {
    return { preset: 'week', range: weekRange(now) };
  }

  return { preset: 'month', range: monthRange(now) };
}
