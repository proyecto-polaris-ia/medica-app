export const CLINIC_TZ = 'America/Mexico_City';

type ClinicParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function parseClinicParts(date: Date): ClinicParts {
  const formatter = new Intl.DateTimeFormat('es-MX', {
    timeZone: CLINIC_TZ,
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

function offsetAtUtc(utc: Date): number {
  const parts = parseClinicParts(utc);
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
  hour = 0,
  minute = 0,
  second = 0
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  let candidate = naive;

  // Converge on the UTC instant whose clinic-local parts match the target.
  // One or two iterations are enough because the offset only changes at DST boundaries.
  for (let i = 0; i < 5; i++) {
    const offset = offsetAtUtc(new Date(candidate));
    const next = naive + offset;
    if (next === candidate) break;
    candidate = next;
  }

  return new Date(candidate);
}

export function clinicDayKey(iso: string): string {
  const parts = parseClinicParts(new Date(iso));
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function clinicTimeLabel(iso: string): string {
  const parts = parseClinicParts(new Date(iso));
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function clinicMonthRangeUtc(
  year: number,
  month: number
): { startAt: string; endAt: string } {
  const startAt = utcFromClinicParts(year, month, 1, 0, 0, 0);

  const endYear = month === 12 ? year + 1 : year;
  const endMonth = month === 12 ? 1 : month + 1;
  const endAt = utcFromClinicParts(endYear, endMonth, 1, 0, 0, 0);

  return { startAt: startAt.toISOString(), endAt: endAt.toISOString() };
}

export const FALLBACK_COLOR = '#64748b';

export type CalendarDayCell = {
  day: number;
  inMonth: boolean;
  dayKey: string | null;
};

export function getCalendarGrid(year: number, month: number): CalendarDayCell[] {
  const { startAt } = clinicMonthRangeUtc(year, month);
  const firstDayUtc = new Date(startAt);
  const firstDayOfWeek = firstDayUtc.getUTCDay();
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

export function getCurrentClinicMonth(): { year: number; month: number } {
  const parts = parseClinicParts(new Date());
  return { year: parts.year, month: parts.month };
}

export type CalendarBlock = {
  id: string;
  label: string;
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
  }>,
  providerColor: (providerId: string) => string
): Record<string, CalendarBlock[]> {
  const groups: Record<string, CalendarBlock[]> = {};

  for (const appointment of appointments) {
    const dayKey = clinicDayKey(appointment.startAt);
    const block: CalendarBlock = {
      id: appointment.id,
      label: `${appointment.serviceName} — ${appointment.patientName || 'Sin paciente'}`,
      startLabel: clinicTimeLabel(appointment.startAt),
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
