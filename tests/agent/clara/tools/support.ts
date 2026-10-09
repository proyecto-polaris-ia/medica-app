// @vitest-environment node
/**
 * Utilidades compartidas por las pruebas de las 7 tools de Clara (issue #161,
 * Fase 4).
 *
 * Reproduce el patrón de cola de query builders de
 * `tests/agent/mora/tools/get-patient-balance.test.ts`: cada tabla tiene su
 * cola de builders y `from` consume el siguiente, de modo que una tabla
 * consultada de más falla ruidosamente y una consulta ausente también.
 *
 * NO es un archivo de pruebas (no termina en `.test.ts`); vitest no lo ejecuta
 * como suite.
 */
import { vi } from "vitest";

export const STAFF_DISCORD_ID = "111222333444555666";
export const ACTOR_USER_ID = "550e8400-e29b-41d4-a716-446655440000";
export const PATIENT_ID = "6f9619ff-8b86-d011-b42d-00cf4fc964ff";
export const DRAFT_ID = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

export type QueryResult = { data: unknown; error: { message?: string } | null };

export type Query = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  then: (
    onFulfilled: (value: QueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
  _result: QueryResult;
};

/**
 * Builder encadenable y "thenable": `await query` resuelve `_result`, igual
 * que el builder real de supabase-js. Los métodos de cadena devuelven el mismo
 * builder; los terminales (`maybeSingle`/`single`) resuelven `_result`.
 */
export function buildQuery(result: QueryResult = { data: [], error: null }): Query {
  const query = {} as Query;
  const chain = () => query;
  query._result = result;
  query.select = vi.fn(chain);
  query.eq = vi.fn(chain);
  query.in = vi.fn(chain);
  query.ilike = vi.fn(chain);
  query.order = vi.fn(chain);
  query.limit = vi.fn(chain);
  query.upsert = vi.fn(chain);
  query.update = vi.fn(chain);
  query.maybeSingle = vi.fn(() => Promise.resolve(query._result));
  query.single = vi.fn(() => Promise.resolve(query._result));
  query.then = (onFulfilled, onRejected) =>
    Promise.resolve(query._result).then(onFulfilled, onRejected);
  return query;
}

/** Encola builders por tabla y hace que `from` consuma la cola correcta. */
export function mockTablesByQueue(
  from: ReturnType<typeof vi.fn>,
  queues: Record<string, Query[]>,
): void {
  from.mockImplementation((table: string) => {
    const queue = queues[table];
    const query = queue?.shift();
    if (!query) {
      throw new Error(`Unexpected table query: ${table}`);
    }
    return query;
  });
}

/** Contexto de sesión con principal de Discord, tal como lo entrega el canal. */
export function discordCtx(userId: string = STAFF_DISCORD_ID, principalType = "user") {
  return {
    session: {
      auth: {
        current: {
          principalId: userId,
          principalType,
          authenticator: "discord",
          attributes: { channel_id: "chan-1", guild_id: "guild-1" },
        },
        initiator: null,
      },
    },
  };
}

/** Aplica variables de entorno y limpia las que lleguen en `undefined`. */
export function applyEnv(env: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

/** Deja el entorno de Clara en un estado fail-closed conocido. */
export function resetClaraEnv(): void {
  applyEnv({
    CLARA_DISCORD_STAFF_IDS: undefined,
    CLARA_DISCORD_ACTOR_MAP: undefined,
    CLARA_DRAFTING_ENABLED: undefined,
    WHATSAPP_AGENT_LLM_API_KEY: undefined,
    WHATSAPP_AGENT_LLM_BASE_URL: undefined,
    WHATSAPP_AGENT_LLM_MODEL: undefined,
  });
}

/** Entorno autorizado, con o sin actor mapeado (fail-closed si falta). */
export function authorizedEnv(options: { actor?: boolean } = {}): void {
  applyEnv({
    CLARA_DISCORD_STAFF_IDS: STAFF_DISCORD_ID,
    CLARA_DISCORD_ACTOR_MAP: options.actor
      ? `${STAFF_DISCORD_ID}=${ACTOR_USER_ID}`
      : undefined,
  });
}
