// @vitest-environment node
/**
 * Pruebas de la tool `get-dashboard-summary` (issue #162, Fase 5).
 *
 * Guardrails (spec `nora-metrics-tools` → "Tool de resumen general del
 * consultorio" y "Autorización revalidada en cada tool"):
 *   - Sin doctor autorizado la tool niega y NO llama al loader.
 *   - Con doctor autorizado proyecta el `DashboardMetricsView` tal cual.
 *   - Cualquier degradación (sin configurar, no disponible, rango sin datos)
 *     produce un estado vacío explícito, nunca cifras inventadas.
 *   - Entradas inválidas (preset combinado con from/to, rango incompleto)
 *     devuelven `{ success: false, error }` y no consultan el loader.
 *
 * El loader se mockea (`@/lib/admin/metrics/loader`), no la base de datos: la
 * aritmética del motor ya está probada en `src/lib/admin/metrics/__tests__`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  authorizeDoctor,
  buildMetrics,
  buildTrend,
  buildView,
  discordCtx,
  DOCTOR_DISCORD_ID,
  resetNoraEnv,
} from "./support";

const getDashboardMetrics = vi.fn();

vi.mock("@/lib/admin/metrics/loader", () => ({ getDashboardMetrics }));

const { DOCTOR_ACCESS_REFUSAL } = await import(
  "../../../../agents/nora/agent/access"
);
const { default: tool } = await import(
  "../../../../agents/nora/agent/tools/get-dashboard-summary"
);

const execute = tool.execute as (input: unknown, ctx?: unknown) => Promise<unknown>;

describe("get-dashboard-summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetNoraEnv();
    authorizeDoctor();
  });

  it("niega sin autorización y no consulta el loader", async () => {
    const result = (await execute({ preset: "week" }, discordCtx("000000000000000000"))) as {
      success: boolean;
      error: string;
    };

    expect(result).toMatchObject({ success: false, error: DOCTOR_ACCESS_REFUSAL });
    expect(getDashboardMetrics).not.toHaveBeenCalled();
  });

  it("falla cerrado cuando la allowlist no está configurada", async () => {
    resetNoraEnv();

    const result = (await execute({ preset: "week" }, discordCtx())) as {
      success: boolean;
      error: string;
    };

    expect(result).toMatchObject({ success: false, error: DOCTOR_ACCESS_REFUSAL });
    expect(getDashboardMetrics).not.toHaveBeenCalled();
  });

  it("proyecta el resumen del motor para el doctor autorizado", async () => {
    getDashboardMetrics.mockResolvedValue(buildView());

    const result = (await execute({ preset: "week" }, discordCtx())) as {
      success: boolean;
      dataAvailable: boolean;
      occupancyPct: number;
      noShowRatePct: number | null;
      noShowCount: number;
      totalAppointments: number;
      statusCounts: Record<string, number>;
      providers: Array<{ providerId: string; providerName: string; occupancyPct: number }>;
      range: { preset: string; label: string };
      message: string;
    };

    expect(result).toMatchObject({
      success: true,
      dataAvailable: true,
      occupancyPct: 70,
      noShowRatePct: 10,
      noShowCount: 1,
      totalAppointments: 15,
      statusCounts: { requested: 1, confirmed: 3, cancelled: 2, attended: 9 },
      range: { preset: "week", label: "6 – 12 de octubre, 2026" },
    });
    expect(result.providers.map((provider) => provider.providerId)).toEqual([
      "prov-ana",
      "prov-bruno",
    ]);
    expect(result.message.length).toBeGreaterThan(0);
    expect(getDashboardMetrics).toHaveBeenCalledWith({ preset: "week" });
  });

  it("traduce from/to a rango custom del motor", async () => {
    getDashboardMetrics.mockResolvedValue(buildView());

    await execute({ from: "2026-10-06", to: "2026-10-12" }, discordCtx());

    expect(getDashboardMetrics).toHaveBeenCalledWith({
      preset: "custom",
      from: "2026-10-06",
      to: "2026-10-12",
    });
  });

  it("incluye la comparación contra el periodo anterior cuando el view la trae", async () => {
    getDashboardMetrics.mockResolvedValue(
      buildView(buildMetrics(), { trend: buildTrend() }),
    );

    const result = (await execute({ preset: "month" }, discordCtx())) as {
      trend: {
        hasComparison: boolean;
        previousOccupancyPct: number | null;
        previousNoShowRatePct: number | null;
        occupancyDeltaPct: number | null;
        noShowRateDeltaPct: number | null;
      };
    };

    expect(result.trend).toMatchObject({
      hasComparison: true,
      previousOccupancyPct: 60,
      previousNoShowRatePct: 12,
    });
    // 70 - 60 = +10 puntos; 10 - 12 = -2 puntos.
    expect(result.trend.occupancyDeltaPct).toBeCloseTo(10);
    expect(result.trend.noShowRateDeltaPct).toBeCloseTo(-2);
  });

  it("degrada con estado vacío cuando el rango no tiene datos", async () => {
    getDashboardMetrics.mockResolvedValue(buildView(null));

    const result = (await execute({ preset: "week" }, discordCtx())) as {
      success: boolean;
      dataAvailable: boolean;
      emptyState: boolean;
      occupancyPct?: number;
      message: string;
    };

    expect(result.success).toBe(true);
    expect(result.dataAvailable).toBe(false);
    expect(result.emptyState).toBe(true);
    expect(result.occupancyPct).toBeUndefined();
    expect(result.message.toLowerCase()).toContain("no hay");
  });

  it("degrada con estado vacío cuando la base no está configurada", async () => {
    getDashboardMetrics.mockResolvedValue(
      buildView(null, { isSupabaseConfigured: false }),
    );

    const result = (await execute({ preset: "week" }, discordCtx())) as {
      success: boolean;
      emptyState: boolean;
      message: string;
    };

    expect(result.success).toBe(true);
    expect(result.emptyState).toBe(true);
    expect(result.message.toLowerCase()).toContain("no está configurada");
  });

  it("degrada con estado vacío cuando la base no responde", async () => {
    getDashboardMetrics.mockResolvedValue(
      buildView(null, { isConfiguredButUnavailable: true }),
    );

    const result = (await execute({ preset: "week" }, discordCtx())) as {
      success: boolean;
      emptyState: boolean;
      message: string;
    };

    expect(result.success).toBe(true);
    expect(result.emptyState).toBe(true);
    expect(result.message.toLowerCase()).toContain("no respondió");
  });

  it("rechaza preset combinado con from/to sin consultar el loader", async () => {
    const result = (await execute(
      { preset: "week", from: "2026-10-06", to: "2026-10-12" },
      discordCtx(),
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error.length).toBeGreaterThan(0);
    expect(getDashboardMetrics).not.toHaveBeenCalled();
  });

  it("rechaza un rango custom incompleto sin consultar el loader", async () => {
    const result = (await execute({ from: "2026-10-06" }, discordCtx())) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error.length).toBeGreaterThan(0);
    expect(getDashboardMetrics).not.toHaveBeenCalled();
  });

  it("rechaza un preset desconocido sin consultar el loader", async () => {
    const result = (await execute({ preset: "year" }, discordCtx())) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error.length).toBeGreaterThan(0);
    expect(getDashboardMetrics).not.toHaveBeenCalled();
  });

  it("no filtra el doctor autorizado en los parámetros del loader", async () => {
    getDashboardMetrics.mockResolvedValue(buildView());

    await execute({ preset: "week" }, discordCtx());

    const [params] = getDashboardMetrics.mock.calls[0];
    expect(JSON.stringify(params)).not.toContain(DOCTOR_DISCORD_ID);
  });
});
