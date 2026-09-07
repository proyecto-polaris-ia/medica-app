// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveServiceByName = vi.fn();
const resolveProviderByName = vi.fn();
const resolvePatient = vi.fn();
const bookAppointment = vi.fn();
const from = vi.fn();
const select = vi.fn();
const match = vi.fn();
const maybeSingle = vi.fn();

vi.mock("@/lib/booking/catalog", () => ({ resolveServiceByName, resolveProviderByName }));
vi.mock("@/lib/booking/patient-resolution", () => ({
  PatientIdentityConflictError: class PatientIdentityConflictError extends Error {},
  resolvePatient,
}));
vi.mock("@/lib/booking/booking", () => ({ bookAppointment }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => ({ from }) }));

const { default: tool } = await import("../../../agent/tools/book-appointment");
const execute = tool.execute as (input: {
  patientPhone: string;
  patientName?: string;
  serviceName: string;
  providerName: string;
  startAt: string;
  endAt: string;
  notes?: string;
}) => Promise<unknown>;

function setupCatalog() {
  resolveServiceByName.mockResolvedValue({ id: "svc-1", name: "Limpieza dental", durationMinutes: 45 });
  resolveProviderByName.mockResolvedValue({ id: "doc-1", name: "Dra. Ana Martínez" });
  resolvePatient.mockResolvedValue({ id: "pat-1", full_name: "Juan Pérez" });
}

describe("book-appointment tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    match.mockReturnValue({ maybeSingle });
    select.mockReturnValue({ match });
    from.mockReturnValue({ select });
  });

  it("books an appointment and returns structured confirmation", async () => {
    setupCatalog();
    bookAppointment.mockResolvedValue({ ok: true });
    maybeSingle.mockResolvedValue({ data: { id: "appt-1", status: "requested" }, error: null });

    const result = await execute({
      patientPhone: "+5215512345678",
      patientName: "Juan Pérez",
      serviceName: "limpieza",
      providerName: "ana",
      startAt: "2026-09-15T16:00:00.000Z",
      endAt: "2026-09-15T16:45:00.000Z",
      notes: "Primera visita",
    });

    expect(bookAppointment).toHaveBeenCalledWith({
      patientId: "pat-1",
      serviceId: "svc-1",
      providerId: "doc-1",
      startAt: new Date("2026-09-15T16:00:00.000Z"),
      endAt: new Date("2026-09-15T16:45:00.000Z"),
      notes: "Primera visita",
    });
    expect(result).toMatchObject({
      success: true,
      appointment: {
        id: "appt-1",
        patientName: "Juan Pérez",
        service: "Limpieza dental",
        provider: "Dra. Ana Martínez",
        status: "requested",
      },
    });
  });

  it("returns conflict true when the booking service detects an occupied slot", async () => {
    setupCatalog();
    bookAppointment.mockResolvedValue({ type: "conflict", message: "This time slot is no longer available. Please select another time." });

    await expect(execute({
      patientPhone: "+5215512345678",
      patientName: "Juan Pérez",
      serviceName: "limpieza",
      providerName: "ana",
      startAt: "2026-09-15T16:00:00.000Z",
      endAt: "2026-09-15T16:45:00.000Z",
    })).resolves.toEqual({
      success: false,
      conflict: true,
      error: "This time slot is no longer available. Please select another time.",
    });
  });

  it("rejects invalid or past date ranges before writing", async () => {
    await expect(execute({
      patientPhone: "+5215512345678",
      serviceName: "limpieza",
      providerName: "ana",
      startAt: "2026-09-15T16:45:00.000Z",
      endAt: "2026-09-15T16:00:00.000Z",
    })).resolves.toEqual({ success: false, error: "La fecha de fin debe ser posterior a la fecha de inicio." });
    expect(bookAppointment).not.toHaveBeenCalled();
  });

  it("returns an error when the service is not found", async () => {
    resolveServiceByName.mockResolvedValue(null);

    await expect(execute({
      patientPhone: "+5215512345678",
      serviceName: "ortodoncia",
      providerName: "ana",
      startAt: "2026-09-15T16:00:00.000Z",
      endAt: "2026-09-15T16:45:00.000Z",
    })).resolves.toEqual({ success: false, error: "Servicio no encontrado: ortodoncia" });
  });
});
