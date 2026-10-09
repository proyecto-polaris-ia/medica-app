import { ValidationError } from '@/lib/admin/validate';

/**
 * Parámetros de paginación de los endpoints de citas del expediente.
 * Cifras propias del expediente (issue #180): listas por paciente, más
 * acotadas que el listado global de citas (20/100).
 */
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 50;

/** Entero positivo simple (sin signos, decimales ni notación científica). */
function parsePositiveIntegerParam(
  raw: string,
  field: string,
  min: number,
  max: number
): number {
  if (!/^\d+$/.test(raw)) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  return value;
}

export function parsePageParam(raw: string | null): number {
  if (raw === null) return DEFAULT_PAGE;
  return parsePositiveIntegerParam(raw, 'page', 1, Number.MAX_SAFE_INTEGER);
}

export function parsePageSizeParam(raw: string | null): number {
  if (raw === null) return DEFAULT_PAGE_SIZE;
  return parsePositiveIntegerParam(raw, 'pageSize', 1, MAX_PAGE_SIZE);
}
