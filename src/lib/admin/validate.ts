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
