// @vitest-environment node
/**
 * Pruebas de la tool `get-no-shows` (issue #162, Fase 5).
 *
 * Guardrails (spec `nora-metrics-tools` → "Tools de ocupación, no-shows y
 * estadísticas de citas" y "Autorización revalidada en cada tool"):
 *   - Sin doctor autorizado niega y NO llama al loader.
 *   - Devuelve la tasa y el conteo de no-shows del motor, por proveedor y
 *     total, conservando `null` cuando el motor no tiene denominador.
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
  "../../../../agents/nora/agent/tools/get-no-shows"
);

const execute = tool.execute as (input: unknown, ctx?: unknown) => Promise<unknown>;

describe("get-no-shows", () => {
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

  it("devuelve la tasa y el conteo del motor por proveedor y total", async () => {
    getDashboardMetrics.mockResolvedValue(buildView());

    const result = (await execute({ preset: "month" }, discordCtx())) as {
      success: boolean;
      dataAvailable: boolean;
      noShowRatePct: number | null;
      noShowCount: number;
      providers: Array<{
        providerId: string;
        providerName: string;
        noShowRatePct: number | null;
        noShowCount: number;
      }>;
    };

    expect(result).toMatchObject({
      success: true,
      dataAvailable: true,
      noShowRatePct: 10,
      noShowCount: 1,
    });
    expect(result.providers).toEqual([
      {
        providerId: "prov-ana",
        providerName: "Dra. Ana López",
        noShowRatePct: 5,
        noShowCount: 1,
      },
      {
        providerId: "prov-bruno",
        providerName: "Dr. Bruno Ruiz",
        noShowRatePct: null,
        noShowCount: 0,
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
      noShowCount?: number;
    };

    expect(result.success).toBe(true);
    expect(result.dataAvailable).toBe(false);
    expect(result.emptyState).toBe(true);
    expect(result.noShowCount).toBeUndefined();
  });

  it("rechaza un rango custom incompleto sin consultar el loader", async () => {
    const result = (await execute({ to: "2026-10-12" }, discordCtx())) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error.length).toBeGreaterThan(0);
    expect(getDashboardMetrics).not.toHaveBeenCalled();
  });
});
