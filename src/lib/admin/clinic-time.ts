const CLINIC_TIME_ZONE = 'America/Mexico_City';

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getParts(instant: Date): DateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(instant);
  const value = (type: keyof DateParts): number => {
    const part = parts.find((p) => p.type === type);
    if (!part) {
      throw new Error(`Missing ${type} in clinic timezone formatter`);
    }
    return parseInt(part.value, 10);
  };

  let year = value('year');
  let month = value('month');
  let day = value('day');
  let hour = value('hour');
  const minute = value('minute');
  const second = value('second');

  // Some ICU versions represent local midnight as hour 24 of the previous day.
  if (hour === 24) {
    hour = 0;
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
    year = nextDay.getUTCFullYear();
    month = nextDay.getUTCMonth() + 1;
    day = nextDay.getUTCDate();
  }

  return { year, month, day, hour, minute, second };
}

function getOffsetMinutes(instant: Date): number {
  const parts = getParts(instant);
  const utcReading = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return Math.round((instant.getTime() - utcReading) / 60_000);
}

function startOfLocalDay(instant: Date): Date {
  const parts = getParts(instant);
  const offsetMinutes = getOffsetMinutes(instant);
  const wallMidnightUtc = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0);
  return new Date(wallMidnightUtc + offsetMinutes * 60_000);
}

function addDays(instant: Date, days: number): Date {
  return new Date(instant.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Returns the UTC half-open interval [localMidnight, nextLocalMidnight)
 * for the clinic day that contains `now`, computed in America/Mexico_City.
 */
export function clinicDayRange(now: Date): [Date, Date] {
  const start = startOfLocalDay(now);
  return [start, addDays(start, 1)];
}

/**
 * Returns the UTC half-open interval for the trailing `days` clinic days
 * ending at the end of the clinic day that contains `now`.
 */
export function trailingDaysRange(now: Date, days: number): [Date, Date] {
  const end = addDays(startOfLocalDay(now), 1);
  const start = addDays(startOfLocalDay(now), -days);
  return [start, end];
}
