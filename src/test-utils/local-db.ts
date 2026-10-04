import { Client, Pool } from 'pg';

/**
 * Infraestructura para pruebas de datos contra Supabase local (CLI).
 *
 * Se activa con `npm run test:local` (SUPABASE_LOCAL=1) después de
 * `supabase start`. Los defaults son las claves estándar del entorno
 * local de Supabase CLI (públicas, no son secretos de producción) y
 * pueden sobrescribirse con un archivo `.env.test`.
 *
 * Puertos locales definidos en supabase/config.toml:
 * API 54331, Postgres 54332 (desplazados de los puertos default para
 * evitar colisión con otros proyectos Supabase locales en esta máquina).
 */

const LOCAL_DEFAULTS: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54331',
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  SUPABASE_SERVICE_ROLE_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  SUPABASE_DB_URL: 'postgresql://postgres:postgres@127.0.0.1:54332/postgres',
};

/**
 * Guard para suites de datos: activo solo cuando test:local configuró la BD.
 * Uso: `const d = localDbEnabled ? describe : describe.skip;`
 */
export const localDbEnabled =
  process.env.SUPABASE_LOCAL === '1' &&
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_DEFAULTS.NEXT_PUBLIC_SUPABASE_URL
  );

/** Aplica defaults locales para variables que no estén ya definidas. */
export function applyLocalDbEnv(): void {
  for (const [key, value] of Object.entries(LOCAL_DEFAULTS)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString:
        process.env.SUPABASE_DB_URL ?? LOCAL_DEFAULTS.SUPABASE_DB_URL,
      max: 1,
    });
  }
  return pool;
}

/**
 * Trunca todas las tablas del esquema `public` (CASCADE). Cada suite de datos
 * lo invoca en `beforeEach`/`beforeAll` para arrancar de un estado conocido.
 */
export async function truncateAllTables(): Promise<void> {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query<{
      tablename: string;
    }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    const tables = rows.map((row) => `"${row.tablename}"`).join(', ');
    if (tables) {
      await client.query(`TRUNCATE TABLE ${tables} CASCADE`);
    }
  } finally {
    client.release();
  }
}

const SUITE_LOCK_KEY = 728101;
let lockClient: Client | null = null;

/**
 * Serializa las suites de datos entre archivos: vitest ejecuta los archivos en
 * paralelo y todas truncan el esquema `public` en cada test; sin este advisory
 * lock de sesión, una suite borra datos que otra acaba de insertar. Se libera
 * al cerrar la conexión (incluso si el worker muere).
 *
 * Uso: `beforeAll(async () => { applyLocalDbEnv(); await acquireDbSuiteLock(); });`
 * y `afterAll(() => releaseDbSuiteLock());`
 */
export async function acquireDbSuiteLock(): Promise<void> {
  lockClient = new Client({
    connectionString:
      process.env.SUPABASE_DB_URL ?? LOCAL_DEFAULTS.SUPABASE_DB_URL,
  });
  await lockClient.connect();
  await lockClient.query('SELECT pg_advisory_lock($1::bigint)', [SUITE_LOCK_KEY]);
}

export async function releaseDbSuiteLock(): Promise<void> {
  if (lockClient) {
    await lockClient.query('SELECT pg_advisory_unlock($1::bigint)', [SUITE_LOCK_KEY]);
    await lockClient.end();
    lockClient = null;
  }
}
