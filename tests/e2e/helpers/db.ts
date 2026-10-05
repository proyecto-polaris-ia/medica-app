import { Pool, type QueryResultRow } from 'pg';

/**
 * Minimal `pg` access for the e2e suite: the specs assert directly against the
 * local Supabase database (same access as src/test-utils/local-db.ts) instead of
 * trusting the API response.
 */

// Local Supabase CLI defaults (see src/test-utils/local-db.ts LOCAL_DEFAULTS);
// the PG port comes from supabase/config.toml.
const DEFAULT_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54332/postgres';

// Inlined, not parameterized: `status NOT IN ('cancelled', 'rescheduled')` is
// exactly the predicate booking_free_slots() uses to decide a slot is taken.
const ACTIVE_APPOINTMENT_SQL = "status NOT IN ('cancelled', 'rescheduled')";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.SUPABASE_DB_URL ?? DEFAULT_DB_URL,
      max: 1,
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}

/** Releases the pool; call from `test.afterAll` so the worker can exit. */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Number of agenda-occupying appointments for a provider starting at exactly
 * `startAt`. The hand-rolled exclusion constraint allows at most one, so this is
 * 0 or 1 and doubles as the "no duplicate booking" assertion.
 */
export async function countAppointments(providerId: string, startAt: Date): Promise<number> {
  const rows = await query<{ count: number }>(
    `SELECT count(*)::int AS count
       FROM appointments
      WHERE provider_id = $1
        AND start_at = $2
        AND ${ACTIVE_APPOINTMENT_SQL}`,
    [providerId, startAt]
  );
  return rows[0]?.count ?? 0;
}

/**
 * Number of agenda-occupying appointments for a provider during a calendar day
 * in clinic time (the timezone the availability function works in).
 */
export async function countAppointmentsOnDate(
  providerId: string,
  localDate: string,
  clinicTimeZone = 'America/Mexico_City'
): Promise<number> {
  const rows = await query<{ count: number }>(
    `SELECT count(*)::int AS count
       FROM appointments
      WHERE provider_id = $1
        AND (start_at AT TIME ZONE $2)::date = $3::date
        AND ${ACTIVE_APPOINTMENT_SQL}`,
    [providerId, clinicTimeZone, localDate]
  );
  return rows[0]?.count ?? 0;
}
