export const CLINIC_TZ = 'America/Mexico_City';

type ClinicParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/**
 * Indica si `value` es una zona horaria IANA que `Intl` puede resolver.
 * Se usa para validar la preferencia del usuario antes de persistirla.
 */
export function isValidIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Devuelve `value` si es una zona IANA válida; en cualquier otro caso
 * (null, undefined, vacío o inválido) cae al default de la clínica.
 */
export function resolveTimeZone(value: string | null | undefined): string {
  if (typeof value === 'string' && isValidIanaTimeZone(value)) {
    return value;
  }
  return CLINIC_TZ;
}

function parseClinicParts(date: Date, timeZone: string): ClinicParts {
  const formatter = new Intl.DateTimeFormat('es-MX', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) =>
    parseInt(
      parts.find((part) => part.type === type)?.value ?? '0',
      10
    );

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function offsetAtUtc(utc: Date, timeZone: string): number {
  const parts = parseClinicParts(utc, timeZone);
  const naive = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return utc.getTime() - naive;
}

function utcFromClinicParts(
  year: number,
  month: number,
  day: number,
  timeZone: string,
  hour = 0,
  minute = 0,
  second = 0
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  let candidate = naive;

  // Converge on the UTC instant whose local parts (in `timeZone`) match the
  // target. One or two iterations are enough because the offset only changes
  // at DST boundaries.
  for (let i = 0; i < 5; i++) {
    const offset = offsetAtUtc(new Date(candidate), timeZone);
    const next = naive + offset;
    if (next === candidate) break;
    candidate = next;
  }

  return new Date(candidate);
}

export function clinicDayKey(iso: string, timeZone: string = CLINIC_TZ): string {
  const parts = parseClinicParts(new Date(iso), timeZone);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function clinicTimeLabel(
  iso: string,
  timeZone: string = CLINIC_TZ
): string {
  const parts = parseClinicParts(new Date(iso), timeZone);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

/**
 * Formatea un instante ISO como valor para un input `datetime-local`, en la
 * zona indicada (default: zona clínica, no la del dispositivo). Produce
 * "YYYY-MM-DDTHH:mm".
 */
export function toClinicLocalInput(
  iso: string,
  timeZone: string = CLINIC_TZ
): string {
  const parts = parseClinicParts(new Date(iso), timeZone);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

/**
 * Interpreta un valor de input `datetime-local` ("YYYY-MM-DDTHH:mm") como
 * hora de la zona indicada (default: zona clínica) y lo convierte a ISO UTC.
 * Nunca usa la zona del dispositivo.
 */
export function clinicLocalInputToUtc(
  value: string,
  timeZone: string = CLINIC_TZ
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid datetime-local value: ${value}`);
  }
  const [, year, month, day, hour, minute] = match;
  return utcFromClinicParts(
    Number(year),
    Number(month),
    Number(day),
    timeZone,
    Number(hour),
    Number(minute)
  ).toISOString();
}

export function clinicMonthRangeUtc(
  year: number,
  month: number,
  timeZone: string = CLINIC_TZ
): { startAt: string; endAt: string } {
  const startAt = utcFromClinicParts(year, month, 1, timeZone, 0, 0, 0);

  const endYear = month === 12 ? year + 1 : year;
  const endMonth = month === 12 ? 1 : month + 1;
  const endAt = utcFromClinicParts(
    endYear,
    endMonth,
    1,
    timeZone,
    0,
    0,
    0
  );

  return { startAt: startAt.toISOString(), endAt: endAt.toISOString() };
}

export const FALLBACK_COLOR = '#64748b';

export type CalendarDayCell = {
  day: number;
  inMonth: boolean;
  dayKey: string | null;
};

export function getCalendarGrid(
  year: number,
  month: number,
  timeZone: string = CLINIC_TZ
): CalendarDayCell[] {
  // La cuadrícula es de calendario (día de pared), no de instante: el primer
  // día del mes local siempre es `year-month-01` en cualquier zona. Se deriva
  // el día de la semana de las partes locales en `timeZone` para que el
  // padding no dependa del offset UTC.
  const { startAt } = clinicMonthRangeUtc(year, month, timeZone);
  const localFirst = parseClinicParts(new Date(startAt), timeZone);
  const firstDayOfWeek = new Date(
    Date.UTC(localFirst.year, localFirst.month - 1, localFirst.day)
  ).getUTCDay();
  const leadingPadding = (firstDayOfWeek + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();

  const pad = (n: number) => n.toString().padStart(2, '0');
  const cells: CalendarDayCell[] = [];

  for (let i = 0; i < leadingPadding; i++) {
    cells.push({ day: 0, inMonth: false, dayKey: null });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      day,
      inMonth: true,
      dayKey: `${year}-${pad(month)}-${pad(day)}`,
    });
  }

  while (cells.length < 42) {
    cells.push({ day: 0, inMonth: false, dayKey: null });
  }

  return cells;
}

export function getCurrentClinicMonth(
  timeZone: string = CLINIC_TZ
): { year: number; month: number } {
  const parts = parseClinicParts(new Date(), timeZone);
  return { year: parts.year, month: parts.month };
}

export type CalendarBlock = {
  id: string;
  label: string;
  patientId: string | null;
  patientName: string;
  serviceName: string;
  startLabel: string;
  color: string;
  status: import('./types').AppointmentStatus;
};

export function groupAppointmentsByDay(
  appointments: Array<{
    id: string;
    patientName: string;
    serviceName: string;
    providerId: string;
    startAt: string;
    endAt: string;
    status: import('./types').AppointmentStatus;
    patientId?: string | null;
  }>,
  providerColor: (providerId: string) => string,
  timeZone: string = CLINIC_TZ
): Record<string, CalendarBlock[]> {
  const groups: Record<string, CalendarBlock[]> = {};

  for (const appointment of appointments) {
    const dayKey = clinicDayKey(appointment.startAt, timeZone);
    const block: CalendarBlock = {
      id: appointment.id,
      label: `${appointment.serviceName} — ${appointment.patientName || 'Sin paciente'}`,
      patientId: 'patientId' in appointment ? appointment.patientId ?? null : null,
      patientName: appointment.patientName || 'Sin paciente',
      serviceName: appointment.serviceName,
      startLabel: clinicTimeLabel(appointment.startAt, timeZone),
      color: providerColor(appointment.providerId),
      status: appointment.status,
    };

    if (!groups[dayKey]) {
      groups[dayKey] = [];
    }
    groups[dayKey].push(block);
  }

  // Sort each day by start time label.
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => a.startLabel.localeCompare(b.startLabel));
  }

  return groups;
}
