// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const listServices = vi.fn();
const listProviders = vi.fn();

vi.mock("@/lib/booking/catalog", () => ({
  listServices,
  listProviders,
}));

const { default: tool } = await import("../../../agent/tools/list-catalog");
const execute = tool.execute as () => Promise<unknown>;

describe("list-catalog tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns services and providers with human-readable durations", async () => {
    listServices.mockResolvedValue([{ id: "svc-1", name: "Limpieza dental", durationMinutes: 45 }]);
    listProviders.mockResolvedValue([{ id: "doc-1", name: "Dra. Ana Martínez" }]);

    await expect(execute()).resolves.toEqual({
      success: true,
      services: [{ id: "svc-1", name: "Limpieza dental", duration: "45 minutos" }],
      providers: [{ id: "doc-1", name: "Dra. Ana Martínez" }],
    });
  });

  it("returns empty arrays when the catalog is empty", async () => {
    listServices.mockResolvedValue([]);
    listProviders.mockResolvedValue([]);

    await expect(execute()).resolves.toEqual({
      success: true,
      services: [],
      providers: [],
    });
  });

  it("returns a structured error when catalog reads fail", async () => {
    listServices.mockRejectedValue(new Error("database unavailable"));
    listProviders.mockResolvedValue([]);

    await expect(execute()).resolves.toEqual({
      success: false,
      services: [],
      providers: [],
      error: "database unavailable",
    });
  });
});
