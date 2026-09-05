import { ValidationError, parsePhoneE164 } from '@/lib/admin/validate';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PatientContact = { phone?: string; email?: string };

export function parseOptionalEmail(value: unknown, field = 'email'): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new ValidationError(field, `Invalid ${field}`);
  const email = value.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new ValidationError(field, `Invalid ${field}`);
  return email;
}

export function normalizePatientContact(input: { phone?: unknown; email?: unknown }): PatientContact {
  const phone = input.phone === undefined || input.phone === null || input.phone === ''
    ? undefined
    : parsePhoneE164(input.phone, 'phone');
  const email = parseOptionalEmail(input.email);
  if (!phone && !email) throw new ValidationError('contact', 'Provide at least one contact method');
  return { phone, email };
}
