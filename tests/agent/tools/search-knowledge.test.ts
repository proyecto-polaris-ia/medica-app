// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const limit = vi.fn();
const order = vi.fn(() => ({ limit }));
const eq = vi.fn(() => ({ order }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
const insert = vi.fn();
const update = vi.fn();
const upsert = vi.fn();
const deleteMock = vi.fn();
const getSupabaseAdmin = vi.fn(() => ({ from, insert, update, upsert, delete: deleteMock }));

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin }));

const { default: tool } = await import("../../../agent/tools/search-knowledge");
const execute = tool.execute as (input: { query: string }) => Promise<unknown>;

describe("search-knowledge tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    order.mockReturnValue({ limit });
    eq.mockReturnValue({ order });
    select.mockReturnValue({ eq });
    from.mockReturnValue({ select });
  });

  it("returns up to three approved entries ordered by relevance", async () => {
    limit.mockResolvedValue({
      data: [
        { topic: "Horario", question: "¿Cuál es el horario?", answer: "Abrimos de lunes a viernes.", tags: ["horario"] },
        { topic: "Ubicación", question: "¿Dónde están?", answer: "Estamos en Av. Reforma.", tags: ["direccion", "ubicacion"] },
        { topic: "Servicios", question: "¿Hay limpieza?", answer: "Sí, ofrecemos limpieza dental.", tags: ["limpieza"] },
        { topic: "Pagos", question: "¿Aceptan tarjeta?", answer: "Sí aceptamos tarjeta.", tags: ["pago"] },
      ],
      error: null,
    });

    const result = await execute({ query: "ubicación dirección" });

    expect(result).toEqual({
      success: true,
      found: true,
      entries: [{ topic: "Ubicación", question: "¿Dónde están?", answer: "Estamos en Av. Reforma." }],
    });
  });

  it("queries only approved knowledge entries", async () => {
    limit.mockResolvedValue({ data: [], error: null });

    await execute({ query: "horario" });

    expect(from).toHaveBeenCalledWith("whatsapp_knowledge_entries");
    expect(select).toHaveBeenCalledWith("topic, question, answer, tags");
    expect(eq).toHaveBeenCalledWith("status", "approved");
  });

  it("returns found false when there are no relevant matches", async () => {
    limit.mockResolvedValue({
      data: [{ topic: "Pagos", question: "¿Aceptan tarjeta?", answer: "Sí aceptamos tarjeta.", tags: ["pago"] }],
      error: null,
    });

    await expect(execute({ query: "ubicación" })).resolves.toEqual({
      success: true,
      found: false,
      entries: [],
      message: "No encontré información aprobada relacionada. Si es necesario, escala a humano.",
    });
  });

  it("does not call write-like Supabase methods", async () => {
    limit.mockResolvedValue({ data: [], error: null });

    await execute({ query: "horario" });

    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
