// @vitest-environment node
/**
 * Utilidades compartidas por las pruebas de las 5 tools de métricas de Nora
 * (issue #162, Fase 5).
 *
 * Las tools son proyecciones puras del `DashboardMetricsView` que produce
 * `getDashboardMetrics` (`src/lib/admin/metrics/loader.ts`). Por eso cada
 * suite mockea el **loader**, no la base de datos: la aritmética del motor ya
 * tiene sus propias pruebas y aquí solo se verifica el contrato de la tool
 * (autorización primero, proyección fiel y degradación explícita).
 *
 * NO es un archivo de pruebas (no termina en `.test.ts`); vitest no lo ejecuta
 * como suite.
 */
import type { DashboardMetricsView } from "@/lib/admin/metrics/loader";
import type { MetricsTrend } from "@/lib/admin/metrics/trend";
import type {
  MetricsResult,
  ProviderMetrics,
  StatusCounts,
} from "@/lib/admin/metrics/types";

export const DOCTOR_DISCORD_ID = "111222333444555666";
export const RANGE_LABEL = "6 – 12 de octubre, 2026";

/** Contexto de sesión con principal de Discord, tal como lo entrega el canal. */
export function discordCtx(userId: string = DOCTOR_DISCORD_ID) {
  return {
    session: {
      auth: {
        current: {
          principalId: userId,
          principalType: "user",
          authenticator: "discord",
          attributes: { doctor_discord_id: userId, channel_id: "chan-1", guild_id: "guild-1" },
        },
        initiator: null,
      },
    },
  };
}

/** Deja el entorno de Nora en un estado fail-closed conocido. */
export function resetNoraEnv(): void {
  delete process.env.NORA_DISCORD_DOCTOR_IDS;
}

/** Habilita la allowlist con el doctor indicado. */
export function authorizeDoctor(userId: string = DOCTOR_DISCORD_ID): void {
  process.env.NORA_DISCORD_DOCTOR_IDS = userId;
}

/** Conteos por status con todos los estados del motor presentes. */
export function statusCounts(overrides: Partial<StatusCounts> = {}): StatusCounts {
  return {
    requested: 0,
    confirmed: 0,
    pending: 0,
    cancelled: 0,
    rescheduled: 0,
    no_show: 0,
    attended: 0,
    ...overrides,
  };
}

/**
 * Métricas por proveedor de ejemplo. `statusCounts` suma exactamente
 * `totalAppointments` (invariante que también exige la spec).
 */
export function buildProviderMetrics(
  overrides: Partial<ProviderMetrics> = {},
): ProviderMetrics {
  return {
    providerId: "prov-ana",
    providerName: "Dra. Ana López",
    occupancyPct: 80,
    occupiedMinutes: 480,
    capacityMinutes: 600,
    noShowRatePct: 5,
    noShowCount: 1,
    attendedCount: 6,
    totalAppointments: 10,
    cancelledCount: 1,
    statusCounts: statusCounts({ confirmed: 3, cancelled: 1, attended: 6 }),
    ...overrides,
  };
}

/** Segundo proveedor, con no-show sin denominador (`noShowRatePct: null`). */
export function buildOtherProviderMetrics(
  overrides: Partial<ProviderMetrics> = {},
): ProviderMetrics {
  return {
    providerId: "prov-bruno",
    providerName: "Dr. Bruno Ruiz",
    occupancyPct: 60,
    occupiedMinutes: 300,
    capacityMinutes: 500,
    noShowRatePct: null,
    noShowCount: 0,
    attendedCount: 4,
    totalAppointments: 5,
    cancelledCount: 1,
    statusCounts: statusCounts({ requested: 1, cancelled: 1, attended: 3 }),
    ...overrides,
  };
}

/** Métricas agregadas de ejemplo, consistentes con los dos proveedores. */
export function buildMetrics(overrides: Partial<MetricsResult> = {}): MetricsResult {
  return {
    occupancyPct: 70,
    occupiedMinutes: 780,
    capacityMinutes: 1100,
    noShowRatePct: 10,
    noShowCount: 1,
    attendedCount: 9,
    totalAppointments: 15,
    cancelledCount: 2,
    statusCounts: statusCounts({
      requested: 1,
      confirmed: 3,
      cancelled: 2,
      attended: 9,
    }),
    providers: [buildProviderMetrics(), buildOtherProviderMetrics()],
    ...overrides,
  };
}

/** Tendencia contra el periodo anterior, con `previous` disponible. */
export function buildTrend(
  overrides: Partial<MetricsTrend> = {},
): MetricsTrend {
  return {
    current: buildMetrics(),
    previous: buildMetrics({
      occupancyPct: 60,
      noShowRatePct: 12,
      noShowCount: 3,
      totalAppointments: 12,
      cancelledCount: 1,
    }),
    previousRange: {
      start: new Date("2026-09-29T06:00:00.000Z"),
      end: new Date("2026-10-06T06:00:00.000Z"),
    },
    series: [],
    ...overrides,
  };
}

/**
 * Vista del loader con datos. `metrics: null` representa el rango sin citas ni
 * `business_hours`; `isConfiguredButUnavailable` y `isSupabaseConfigured:
 * false` representan la degradación tipada del adaptador.
 */
export function buildView(
  metrics: MetricsResult | null = buildMetrics(),
  overrides: Partial<DashboardMetricsView> = {},
): DashboardMetricsView {
  return {
    isSupabaseConfigured: true,
    isConfiguredButUnavailable: false,
    generatedAt: "2026-10-12T18:00:00.000Z",
    preset: "week",
    rangeLabel: RANGE_LABEL,
    range: {
      startAt: "2026-10-06T06:00:00.000Z",
      endAt: "2026-10-13T06:00:00.000Z",
    },
    metrics,
    trend: null,
    ...overrides,
  };
}
