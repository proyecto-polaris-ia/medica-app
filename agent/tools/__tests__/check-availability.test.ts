// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const getFreeSlots = vi.fn();
const resolveServiceByName = vi.fn();
const resolveProviderByName = vi.fn();

vi.mock("@/lib/booking/availability", () => ({ getFreeSlots }));
vi.mock("@/lib/booking/catalog", () => ({
  resolveServiceByName,
  resolveProviderByName,
}));

const { default: tool } = await import("../check-availability");
const execute = tool.execute as (input: {
  serviceName: string;
  providerName: string;
  date: string;
}) => Promise<unknown>;

describe("check-availability tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns up to five formatted slots for a resolved service and provider", async () => {
    resolveServiceByName.mockResolvedValue({ id: "svc-1", name: "Limpieza dental", durationMinutes: 45 });
    resolveProviderByName.mockResolvedValue({ id: "doc-1", name: "Dra. Ana Martínez" });
    getFreeSlots.mockResolvedValue([
      { start_at: new Date("2026-09-15T16:00:00.000Z"), end_at: new Date("2026-09-15T16:45:00.000Z") },
      { start_at: new Date("2026-09-15T17:00:00.000Z"), end_at: new Date("2026-09-15T17:45:00.000Z") },
      { start_at: new Date("2026-09-15T18:00:00.000Z"), end_at: new Date("2026-09-15T18:45:00.000Z") },
      { start_at: new Date("2026-09-15T19:00:00.000Z"), end_at: new Date("2026-09-15T19:45:00.000Z") },
      { start_at: new Date("2026-09-15T20:00:00.000Z"), end_at: new Date("2026-09-15T20:45:00.000Z") },
      { start_at: new Date("2026-09-15T21:00:00.000Z"), end_at: new Date("2026-09-15T21:45:00.000Z") },
    ]);

    const result = await execute({ serviceName: "limpieza", providerName: "ana", date: "2026-09-15" });

    expect(result).toMatchObject({
      success: true,
      available: true,
      service: "Limpieza dental",
      provider: "Dra. Ana Martínez",
      date: "2026-09-15",
    });
    expect((result as { slots: unknown[] }).slots).toHaveLength(5);
    expect(getFreeSlots).toHaveBeenCalledWith({
      providerId: "doc-1",
      serviceId: "svc-1",
      localDate: expect.any(Date),
      timezone: "America/Mexico_City",
    });
  });

  it("rejects invalid date formats before reading availability", async () => {
    await expect(
      execute({ serviceName: "limpieza", providerName: "ana", date: "15/09/2026" })
    ).resolves.toEqual({
      success: false,
      available: false,
      error: "Fecha inválida. Usa el formato YYYY-MM-DD.",
    });
    expect(resolveServiceByName).not.toHaveBeenCalled();
  });

  it("returns a structured error when service is not found", async () => {
    resolveServiceByName.mockResolvedValue(null);

    await expect(
      execute({ serviceName: "ortodoncia", providerName: "ana", date: "2026-09-15" })
    ).resolves.toEqual({
      success: false,
      available: false,
      error: "Servicio no encontrado: ortodoncia",
    });
    expect(resolveProviderByName).not.toHaveBeenCalled();
  });

  it("returns unavailable when no slots exist", async () => {
    resolveServiceByName.mockResolvedValue({ id: "svc-1", name: "Limpieza dental", durationMinutes: 45 });
    resolveProviderByName.mockResolvedValue({ id: "doc-1", name: "Dra. Ana Martínez" });
    getFreeSlots.mockResolvedValue([]);

    await expect(
      execute({ serviceName: "limpieza", providerName: "ana", date: "2026-12-25" })
    ).resolves.toMatchObject({
      success: true,
      available: false,
      slots: [],
      service: "Limpieza dental",
      provider: "Dra. Ana Martínez",
      date: "2026-12-25",
    });
  });
});
