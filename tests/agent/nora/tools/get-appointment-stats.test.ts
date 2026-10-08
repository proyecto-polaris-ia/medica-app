// @vitest-environment node
/**
 * Pruebas de la tool `get-appointment-stats` (issue #162, Fase 5).
 *
 * Guardrails (spec `nora-metrics-tools` → "Tools de ocupación, no-shows y
 * estadísticas de citas" y "Autorización revalidada en cada tool"):
 *   - Sin doctor autorizado niega y NO llama al loader.
 *   - Devuelve los conteos por status del motor y la suma de esos conteos
 *     MUST igualar el total de citas del rango (sin aritmética paralela).
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
  "../../../../agents/nora/agent/tools/get-appointment-stats"
);

const execute = tool.execute as (input: unknown, ctx?: unknown) => Promise<unknown>;

describe("get-appointment-stats", () => {
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

  it("devuelve los conteos por status y la suma iguala el total del motor", async () => {
    getDashboardMetrics.mockResolvedValue(buildView());

    const result = (await execute({ preset: "week" }, discordCtx())) as {
      success: boolean;
      dataAvailable: boolean;
      totalAppointments: number;
      statusCounts: Record<string, number>;
    };

    expect(result.success).toBe(true);
    expect(result.dataAvailable).toBe(true);
    expect(result.statusCounts).toEqual({
      requested: 1,
      confirmed: 3,
      pending: 0,
      cancelled: 2,
      rescheduled: 0,
      no_show: 0,
      attended: 9,
    });
    const sum = Object.values(result.statusCounts).reduce(
      (total, count) => total + count,
      0,
    );
    expect(sum).toBe(result.totalAppointments);
    expect(result.totalAppointments).toBe(15);
  });

  it("degrada con estado vacío cuando el rango no tiene datos", async () => {
    getDashboardMetrics.mockResolvedValue(buildView(null));

    const result = (await execute({ preset: "week" }, discordCtx())) as {
      success: boolean;
      dataAvailable: boolean;
      emptyState: boolean;
      statusCounts?: unknown;
    };

    expect(result.success).toBe(true);
    expect(result.dataAvailable).toBe(false);
    expect(result.emptyState).toBe(true);
    expect(result.statusCounts).toBeUndefined();
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
});
