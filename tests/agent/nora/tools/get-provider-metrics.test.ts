// @vitest-environment node
/**
 * Pruebas de la tool `get-provider-metrics` (issue #162, Fase 5).
 *
 * Guardrails (spec `nora-metrics-tools` → "Tool de métricas por proveedor"):
 *   - Sin doctor autorizado niega y NO llama al loader.
 *   - Resuelve el proveedor dentro del view por id o nombre (sin distinguir
 *     mayúsculas) y devuelve SOLO sus métricas, sin mezclar otros proveedores.
 *   - Un proveedor desconocido devuelve `{ success: false, error }` nombrando
 *     el problema, nunca métricas vacías ambiguas.
 *   - Sin datos en el rango degrada con estado vacío explícito.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  authorizeDoctor,
  buildProviderMetrics,
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
  "../../../../agents/nora/agent/tools/get-provider-metrics"
);

const execute = tool.execute as (input: unknown, ctx?: unknown) => Promise<unknown>;

describe("get-provider-metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetNoraEnv();
    authorizeDoctor();
  });

  it("niega sin autorización y no consulta el loader", async () => {
    const result = (await execute(
      { providerId: "prov-ana", preset: "week" },
      discordCtx("000000000000000000"),
    )) as { success: boolean; error: string };

    expect(result).toMatchObject({ success: false, error: DOCTOR_ACCESS_REFUSAL });
    expect(getDashboardMetrics).not.toHaveBeenCalled();
  });

  it("resuelve el proveedor por id y devuelve solo sus métricas", async () => {
    getDashboardMetrics.mockResolvedValue(buildView());

    const result = (await execute(
      { providerId: "prov-bruno", preset: "week" },
      discordCtx(),
    )) as {
      success: boolean;
      dataAvailable: boolean;
      providerId: string;
      providerName: string;
      occupancyPct: number;
      noShowRatePct: number | null;
      noShowCount: number;
      attendedCount: number;
      totalAppointments: number;
    };

    expect(result).toMatchObject({
      success: true,
      dataAvailable: true,
      providerId: "prov-bruno",
      providerName: "Dr. Bruno Ruiz",
      occupancyPct: 60,
      noShowRatePct: null,
      noShowCount: 0,
      attendedCount: 4,
      totalAppointments: 5,
    });
    // No se filtran las métricas de la otra proveedora.
    expect(JSON.stringify(result)).not.toContain(buildProviderMetrics().providerId);
  });

  it("resuelve el proveedor por nombre sin distinguir mayúsculas", async () => {
    getDashboardMetrics.mockResolvedValue(buildView());

    const result = (await execute(
      { providerName: "dra. ana lópez", preset: "week" },
      discordCtx(),
    )) as { success: boolean; providerId: string };

    expect(result).toMatchObject({ success: true, providerId: "prov-ana" });
  });

  it("devuelve error nombrando al proveedor desconocido", async () => {
    getDashboardMetrics.mockResolvedValue(buildView());

    const result = (await execute(
      { providerName: "Dr. Fantasma", preset: "week" },
      discordCtx(),
    )) as { success: boolean; error: string; occupancyPct?: number };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Dr. Fantasma");
    expect(result.occupancyPct).toBeUndefined();
  });

  it("degrada con estado vacío si el rango no tiene datos", async () => {
    getDashboardMetrics.mockResolvedValue(buildView(null));

    const result = (await execute(
      { providerId: "prov-ana", preset: "week" },
      discordCtx(),
    )) as { success: boolean; dataAvailable: boolean; emptyState: boolean; message: string };

    expect(result.success).toBe(true);
    expect(result.dataAvailable).toBe(false);
    expect(result.emptyState).toBe(true);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("exige una referencia de proveedor sin consultar el loader", async () => {
    const result = (await execute({ preset: "week" }, discordCtx())) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error.length).toBeGreaterThan(0);
    expect(getDashboardMetrics).not.toHaveBeenCalled();
  });

  it("rechaza preset combinado con from/to sin consultar el loader", async () => {
    const result = (await execute(
      { providerId: "prov-ana", preset: "month", from: "2026-10-06", to: "2026-10-12" },
      discordCtx(),
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error.length).toBeGreaterThan(0);
    expect(getDashboardMetrics).not.toHaveBeenCalled();
  });
});
