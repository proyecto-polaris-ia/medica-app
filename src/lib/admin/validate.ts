import type {
  PaymentMethod,
  TreatmentPlanItemStatus,
  TreatmentPlanStatus,
} from './types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ValidationError extends Error {
  constructor(public field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function parseUuid(value: unknown, field = 'id'): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  return value.toLowerCase();
}

export function parseIsoDate(value: unknown, field = 'date'): Date {
  if (typeof value !== 'string') {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  return date;
}

export function parsePhoneE164(value: unknown, field = 'phone'): string {
  if (typeof value !== 'string' || !/^\+[1-9]\d{7,14}$/.test(value)) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  return value;
}

export function parseNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  return value.trim();
}

export function parseOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function parsePositiveInt(value: unknown, field = 'duration'): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  return value;
}

export function parseDayOfWeek(value: unknown, field = 'dayOfWeek'): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 6
  ) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  return value;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function parseHexColor(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!HEX_COLOR_RE.test(normalized)) {
    return null;
  }
  return normalized;
}

const MAX_NOTES_LENGTH = 1000;

export function parseNotes(value: unknown, field = 'notes'): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > MAX_NOTES_LENGTH) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  return trimmed;
}

export function parseTime(value: unknown, field = 'time'): string {
  if (
    typeof value !== 'string' ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)
  ) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  // Normalize to HH:MM[:SS]
  return value;
}

const APPOINTMENT_STATUS_VALUES: string[] = [
  'requested',
  'confirmed',
  'pending',
  'cancelled',
  'rescheduled',
  'no_show',
  'attended',
];

export function parseAppointmentStatus(
  value: unknown,
  field = 'status'
): AppointmentStatus {
  if (typeof value !== 'string' || !APPOINTMENT_STATUS_VALUES.includes(value)) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  return value as AppointmentStatus;
}

export type AppointmentStatus =
  | 'requested'
  | 'confirmed'
  | 'pending'
  | 'cancelled'
  | 'rescheduled'
  | 'no_show'
  | 'attended';

export function parseDate(value: unknown, field = 'date'): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  const iso = parsed.toISOString().slice(0, 10);
  return iso;
}

const SEX_VALUES: string[] = ['male', 'female', 'other'];

export function parseSex(value: unknown): 'male' | 'female' | 'other' | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (!SEX_VALUES.includes(trimmed)) {
    throw new ValidationError('sex', 'Invalid sex');
  }
  return trimmed as 'male' | 'female' | 'other';
}

export function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

export function parseStatus<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field = 'status'
): T | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (!allowed.includes(trimmed as T)) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  return trimmed as T;
}

const TREATMENT_PLAN_STATUS_VALUES: string[] = [
  'draft',
  'presented',
  'accepted',
  'in_progress',
  'completed',
  'cancelled',
];

export function parseTreatmentPlanStatus(
  value: unknown,
  field = 'status'
): TreatmentPlanStatus {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    !TREATMENT_PLAN_STATUS_VALUES.includes(value.trim())
  ) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  return value.trim() as TreatmentPlanStatus;
}

const TREATMENT_PLAN_ITEM_STATUS_VALUES: string[] = ['pending', 'done'];

export function parseTreatmentPlanItemStatus(
  value: unknown,
  field = 'status'
): TreatmentPlanItemStatus {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    !TREATMENT_PLAN_ITEM_STATUS_VALUES.includes(value.trim())
  ) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  return value.trim() as TreatmentPlanItemStatus;
}

export function parseMoney(value: unknown, field = 'unitPrice'): number {
  if (
    typeof value !== 'number' ||
    Number.isNaN(value) ||
    !Number.isFinite(value)
  ) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  if (value < 0) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  const str = value.toString();
  const decimalIndex = str.indexOf('.');
  if (decimalIndex !== -1 && str.length - decimalIndex - 1 > 2) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  return value;
}

const FDI_TOOTH_RE = /^[1-8][1-8]$/;

export function parseFdiTooth(
  value: unknown,
  field = 'tooth'
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string' || !FDI_TOOTH_RE.test(value)) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  return value;
}

export function parseQuantity(value: unknown, field = 'quantity'): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  return value;
}

const PAYMENT_METHOD_VALUES: PaymentMethod[] = [
  'cash',
  'card',
  'transfer',
  'other',
];

export function parsePaymentMethod(
  value: unknown,
  field = 'method'
): PaymentMethod {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    !PAYMENT_METHOD_VALUES.includes(value.trim() as PaymentMethod)
  ) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  return value.trim() as PaymentMethod;
}

export function parseMoneyPositive(value: unknown, field = 'amount'): number {
  const amount = parseMoney(value, field);
  if (amount <= 0) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  return amount;
}

const FOLLOW_UP_CONTACT_STATUS_VALUES: string[] = ['contacted', 'dismissed'];

/**
 * Estado cerrado del contacto de seguimiento: `contacted | dismissed`.
 * `ValidationError` cuando el valor no coincide con el enum.
 */
export function parseFollowUpContactStatus(
  value: unknown,
  field = 'status'
): 'contacted' | 'dismissed' {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    !FOLLOW_UP_CONTACT_STATUS_VALUES.includes(value.trim())
  ) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  return value.trim() as 'contacted' | 'dismissed';
}

export function parsePaidAt(value: unknown, field = 'paidAt'): string {
  const date = parseIsoDate(value, field);
  return date.toISOString();
}

export function parseVoidReason(value: unknown, field = 'reason'): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  return value.trim();
}

const DEFAULT_THRESHOLD_DAYS = 30;

export function parseThresholdDays(
  value: unknown,
  field = 'thresholdDays'
): number {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_THRESHOLD_DAYS;
  }

  const numericValue =
    typeof value === 'string' && value.trim().length > 0
      ? Number(value.trim())
      : value;

  if (
    typeof numericValue !== 'number' ||
    !Number.isInteger(numericValue) ||
    numericValue <= 0
  ) {
    throw new ValidationError(field, `Invalid ${field}`);
  }

  return numericValue;
}
