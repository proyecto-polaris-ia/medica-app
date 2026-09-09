// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveServiceByName = vi.fn();
const resolveProviderByName = vi.fn();
const resolvePatient = vi.fn();
const rescheduleAppointment = vi.fn();

vi.mock("@/lib/booking/catalog", () => ({ resolveServiceByName, resolveProviderByName }));
vi.mock("@/lib/booking/patient-resolution", () => ({
  PatientIdentityConflictError: class PatientIdentityConflictError extends Error {},
  resolvePatient,
}));
vi.mock("@/lib/booking/reschedule", () => ({ rescheduleAppointment }));

const { default: tool } = await import("../../../agent/tools/reschedule-appointment");
const execute = tool.execute as (input: {
  appointmentId?: string;
  patientPhone: string;
  patientName?: string;
  serviceName: string;
  providerName: string;
  currentStartAt?: string;
  currentEndAt?: string;
  newStartAt: string;
  newEndAt: string;
  notes?: string;
}) => Promise<unknown>;

function setupCatalog() {
  resolveServiceByName.mockResolvedValue({ id: "svc-1", name: "Limpieza dental", durationMinutes: 60 });
  resolveProviderByName.mockResolvedValue({ id: "doc-1", name: "Dra. Ana Martínez" });
  resolvePatient.mockResolvedValue({ id: "pat-1", full_name: "Daniel Rodriguez" });
}

describe("reschedule-appointment tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reschedules an existing appointment and returns structured confirmation", async () => {
    setupCatalog();
    rescheduleAppointment.mockResolvedValue({
      ok: true,
      appointment: {
        id: "appt-1",
        patientId: "pat-1",
        serviceId: "svc-1",
        providerId: "doc-1",
        startAt: "2026-09-15T21:00:00.000Z",
        endAt: "2026-09-15T22:00:00.000Z",
        status: "requested",
        notes: null,
      },
    });

    const result = await execute({
      appointmentId: "appt-1",
      patientPhone: "+525543312353",
      patientName: "Daniel Rodriguez",
      serviceName: "limpieza",
      providerName: "ana",
      newStartAt: "2026-09-15T21:00:00.000Z",
      newEndAt: "2026-09-15T22:00:00.000Z",
    });

    expect(rescheduleAppointment).toHaveBeenCalledWith({
      appointmentId: "appt-1",
      patientId: "pat-1",
      serviceId: "svc-1",
      providerId: "doc-1",
      currentStartAt: undefined,
      currentEndAt: undefined,
      newStartAt: new Date("2026-09-15T21:00:00.000Z"),
      newEndAt: new Date("2026-09-15T22:00:00.000Z"),
      notes: undefined,
    });
    expect(result).toMatchObject({
      success: true,
      appointment: {
        id: "appt-1",
        patientName: "Daniel Rodriguez",
        service: "Limpieza dental",
        provider: "Dra. Ana Martínez",
        status: "requested",
      },
    });
  });

  it("requires original appointment identity before writing", async () => {
    await expect(execute({
      patientPhone: "+525543312353",
      serviceName: "limpieza",
      providerName: "ana",
      newStartAt: "2026-09-15T21:00:00.000Z",
      newEndAt: "2026-09-15T22:00:00.000Z",
    })).resolves.toEqual({ success: false, error: "Para reprogramar necesito identificar la cita original." });
    expect(rescheduleAppointment).not.toHaveBeenCalled();
  });

  it("returns conflict true when the booking layer detects an occupied new slot", async () => {
    setupCatalog();
    rescheduleAppointment.mockResolvedValue({
      type: "conflict",
      message: "This time slot is no longer available. Please select another time.",
    });

    await expect(execute({
      appointmentId: "appt-1",
      patientPhone: "+525543312353",
      serviceName: "limpieza",
      providerName: "ana",
      newStartAt: "2026-09-15T21:00:00.000Z",
      newEndAt: "2026-09-15T22:00:00.000Z",
    })).resolves.toEqual({
      success: false,
      conflict: true,
      error: "This time slot is no longer available. Please select another time.",
    });
  });
});
