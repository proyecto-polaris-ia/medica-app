// @vitest-environment node
/**
 * Pruebas de la tool `get-occupancy` (issue #162, Fase 5).
 *
 * Guardrails (spec `nora-metrics-tools` → "Tools de ocupación, no-shows y
 * estadísticas de citas" y "Autorización revalidada en cada tool"):
 *   - Sin doctor autorizado niega y NO llama al loader.
 *   - Devuelve la ocupación total y por proveedor EXACTAMENTE como la produce
 *     el motor de métricas (sin recalcular porcentajes).
 *   - Sin datos en el rango degrada con estado vacío explícito.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  authorizeDoctor,
  buildView,
  discordCtx,
  resetNoraEnv,
} from "./support";

const getDashboardMetrics = vi.fn();

vi.mock("@/lib/admin/metrics/loader", () => ({ getDashboardMetrics }));

const { DOCTOR_ACCESS_REFUSAL } = await import(
  "../../../../agents/nora/agent/access"
);
const { default: tool } = await import(
  "../../../../agents/nora/agent/tools/get-occupancy"
);

const execute = tool.execute as (input: unknown, ctx?: unknown) => Promise<unknown>;

describe("get-occupancy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetNoraEnv();
    authorizeDoctor();
  });

  it("niega sin autorización y no consulta el loader", async () => {
    const result = (await execute({ preset: "month" }, discordCtx("000000000000000000"))) as {
      success: boolean;
      error: string;
    };

    expect(result).toMatchObject({ success: false, error: DOCTOR_ACCESS_REFUSAL });
    expect(getDashboardMetrics).not.toHaveBeenCalled();
  });

  it("devuelve la ocupación del motor por proveedor y total", async () => {
    getDashboardMetrics.mockResolvedValue(buildView());

    const result = (await execute({ preset: "month" }, discordCtx())) as {
      success: boolean;
      dataAvailable: boolean;
      occupancyPct: number;
      occupiedMinutes: number;
      capacityMinutes: number;
      providers: Array<{
        providerId: string;
        providerName: string;
        occupancyPct: number;
        occupiedMinutes: number;
        capacityMinutes: number;
      }>;
    };

    expect(result).toMatchObject({
      success: true,
      dataAvailable: true,
      occupancyPct: 70,
      occupiedMinutes: 780,
      capacityMinutes: 1100,
    });
    expect(result.providers).toEqual([
      {
        providerId: "prov-ana",
        providerName: "Dra. Ana López",
        occupancyPct: 80,
        occupiedMinutes: 480,
        capacityMinutes: 600,
      },
      {
        providerId: "prov-bruno",
        providerName: "Dr. Bruno Ruiz",
        occupancyPct: 60,
        occupiedMinutes: 300,
        capacityMinutes: 500,
      },
    ]);
    expect(getDashboardMetrics).toHaveBeenCalledWith({ preset: "month" });
  });

  it("degrada con estado vacío cuando el rango no tiene datos", async () => {
    getDashboardMetrics.mockResolvedValue(buildView(null));

    const result = (await execute({ preset: "week" }, discordCtx())) as {
      success: boolean;
      dataAvailable: boolean;
      emptyState: boolean;
      occupancyPct?: number;
    };

    expect(result.success).toBe(true);
    expect(result.dataAvailable).toBe(false);
    expect(result.emptyState).toBe(true);
    expect(result.occupancyPct).toBeUndefined();
  });

  it("rechaza entradas inválidas sin consultar el loader", async () => {
    const result = (await execute(
      { preset: "week", from: "2026-10-06", to: "2026-10-12" },
      discordCtx(),
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error.length).toBeGreaterThan(0);
    expect(getDashboardMetrics).not.toHaveBeenCalled();
  });
});
