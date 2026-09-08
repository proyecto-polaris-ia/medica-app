// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveServiceByName = vi.fn();
const resolveProviderByName = vi.fn();
const findNextAvailable = vi.fn();

vi.mock("@/lib/booking/catalog", () => ({ resolveServiceByName, resolveProviderByName }));
vi.mock("@/lib/booking/next-available", () => ({ findNextAvailable }));

const { default: tool } = await import("../../../agent/tools/get-next-available");
const execute = tool.execute as (input: {
  serviceName: string;
  providerName: string;
  afterDate: string;
}) => Promise<unknown>;

describe("get-next-available tool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the next available formatted slot", async () => {
    resolveServiceByName.mockResolvedValue({ id: "svc-1", name: "Limpieza dental" });
    resolveProviderByName.mockResolvedValue({ id: "doc-1", name: "Dra. Ana Martínez" });
    findNextAvailable.mockResolvedValue({
      start_at: new Date("2026-09-16T17:30:00.000Z"),
      end_at: new Date("2026-09-16T18:15:00.000Z"),
    });

    await expect(execute({ serviceName: "limpieza", providerName: "ana", afterDate: "2026-09-15" })).resolves.toMatchObject({
      success: true,
      available: true,
      slot: {
        start: "2026-09-16T17:30:00.000Z",
        end: "2026-09-16T18:15:00.000Z",
      },
      service: "Limpieza dental",
      provider: "Dra. Ana Martínez",
    });
  });

  it("returns unavailable when no future slot is found", async () => {
    resolveServiceByName.mockResolvedValue({ id: "svc-1", name: "Limpieza dental" });
    resolveProviderByName.mockResolvedValue({ id: "doc-1", name: "Dra. Ana Martínez" });
    findNextAvailable.mockResolvedValue(null);

    await expect(execute({ serviceName: "limpieza", providerName: "ana", afterDate: "2026-09-15" })).resolves.toEqual({
      success: true,
      available: false,
      service: "Limpieza dental",
      provider: "Dra. Ana Martínez",
      message: "No encontré disponibilidad en los próximos días. No inventes horarios; pide otra fecha o escala a humano.",
    });
  });

  it("rejects invalid dates before resolving catalog", async () => {
    await expect(execute({ serviceName: "limpieza", providerName: "ana", afterDate: "15/09/2026" })).resolves.toEqual({
      success: false,
      available: false,
      error: "Fecha inválida. Usa el formato YYYY-MM-DD.",
    });
    expect(resolveServiceByName).not.toHaveBeenCalled();
  });

  it("returns a structured error when provider is not found", async () => {
    resolveServiceByName.mockResolvedValue({ id: "svc-1", name: "Limpieza dental" });
    resolveProviderByName.mockResolvedValue(null);

    await expect(execute({ serviceName: "limpieza", providerName: "no existe", afterDate: "2026-09-15" })).resolves.toEqual({
      success: false,
      available: false,
      service: "Limpieza dental",
      error: "Doctor no encontrado: no existe",
    });
  });
});
