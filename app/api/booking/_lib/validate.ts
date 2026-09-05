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

export function parseLocalDate(value: unknown, field = 'date'): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError(field, `Invalid ${field}`);
  }
  // Noon UTC prevents timezone off-by-one when the clinic timezone is UTC-6/-7.
  return new Date(`${value}T12:00:00Z`);
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
