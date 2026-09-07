// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const getFreeSlots = vi.fn();
const resolveServiceByName = vi.fn();
const resolveProviderByName = vi.fn();
const resolvePatient = vi.fn();
const bookAppointment = vi.fn();
const findNextAvailable = vi.fn();
const from = vi.fn();
const select = vi.fn();
const match = vi.fn();
const maybeSingle = vi.fn();
const or = vi.fn();
const eq = vi.fn();

vi.mock("@/lib/booking/availability", () => ({ getFreeSlots }));
vi.mock("@/lib/booking/catalog", () => ({ resolveServiceByName, resolveProviderByName }));
vi.mock("@/lib/booking/patient-resolution", () => ({
  PatientIdentityConflictError: class PatientIdentityConflictError extends Error {},
  resolvePatient,
}));
vi.mock("@/lib/booking/booking", () => ({ bookAppointment }));
vi.mock("@/lib/booking/next-available", () => ({ findNextAvailable }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => ({ from }) }));

const { default: availabilityTool } = await import("../../../agent/tools/check-availability");
const { default: resolvePatientTool } = await import("../../../agent/tools/resolve-patient");
const { default: bookAppointmentTool } = await import("../../../agent/tools/book-appointment");
const { default: nextAvailableTool } = await import("../../../agent/tools/get-next-available");

const checkAvailability = availabilityTool.execute as (input: { serviceName: string; providerName: string; date: string }) => Promise<any>;
const resolvePatientExec = resolvePatientTool.execute as (input: { phone: string; fullName?: string }) => Promise<any>;
const bookAppointmentExec = bookAppointmentTool.execute as (input: any) => Promise<any>;
const getNextAvailable = nextAvailableTool.execute as (input: { serviceName: string; providerName: string; afterDate: string }) => Promise<any>;

function setupCommonMocks() {
  resolveServiceByName.mockResolvedValue({ id: "svc-1", name: "Limpieza dental", durationMinutes: 45 });
  resolveProviderByName.mockResolvedValue({ id: "doc-1", name: "Dra. Ana Martínez" });
  resolvePatient.mockResolvedValue({ id: "pat-1", full_name: "Juan Pérez" });
  match.mockReturnValue({ maybeSingle });
  or.mockReturnValue({ maybeSingle });
  eq.mockReturnValue({ maybeSingle });
  select.mockReturnValue({ match, or, eq });
  from.mockReturnValue({ select });
}

describe("Eve complete booking flow integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
  });

  it("checks availability, resolves a new patient, and books the selected slot", async () => {
    getFreeSlots.mockResolvedValue([{ start_at: new Date("2026-09-15T16:00:00.000Z"), end_at: new Date("2026-09-15T16:45:00.000Z") }]);
    maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: "pat-1", full_name: "Juan Pérez", phone_e164: "+5215512345678", email: null }, error: null })
      .mockResolvedValueOnce({ data: { id: "appt-1", status: "requested" }, error: null });
    bookAppointment.mockResolvedValue({ ok: true });

    const availability = await checkAvailability({ serviceName: "limpieza", providerName: "ana", date: "2026-09-15" });
    expect(availability.available).toBe(true);

    const patient = await resolvePatientExec({ phone: "+5215512345678", fullName: "Juan Pérez" });
    expect(patient).toMatchObject({ success: true, patient: { id: "pat-1", isNew: true } });

    const booking = await bookAppointmentExec({
      patientPhone: "+5215512345678",
      patientName: "Juan Pérez",
      serviceName: "limpieza",
      providerName: "ana",
      startAt: "2026-09-15T16:00:00.000Z",
      endAt: "2026-09-15T16:45:00.000Z",
    });

    expect(booking).toMatchObject({ success: true, appointment: { id: "appt-1", status: "requested" } });
    expect(bookAppointment).toHaveBeenCalledTimes(1);
  });

  it("handles booking conflict and recovers with next available slot", async () => {
    bookAppointment.mockResolvedValueOnce({ type: "conflict", message: "This time slot is no longer available. Please select another time." }).mockResolvedValueOnce({ ok: true });
    findNextAvailable.mockResolvedValue({ start_at: new Date("2026-09-16T17:30:00.000Z"), end_at: new Date("2026-09-16T18:15:00.000Z") });
    maybeSingle.mockResolvedValue({ data: { id: "appt-next", status: "requested" }, error: null });

    const conflict = await bookAppointmentExec({
      patientPhone: "+5215512345678",
      patientName: "Juan Pérez",
      serviceName: "limpieza",
      providerName: "ana",
      startAt: "2026-09-15T16:00:00.000Z",
      endAt: "2026-09-15T16:45:00.000Z",
    });
    expect(conflict).toEqual({ success: false, conflict: true, error: "This time slot is no longer available. Please select another time." });

    const next = await getNextAvailable({ serviceName: "limpieza", providerName: "ana", afterDate: "2026-09-15" });
    expect(next).toMatchObject({ success: true, available: true });

    const bookedNext = await bookAppointmentExec({
      patientPhone: "+5215512345678",
      patientName: "Juan Pérez",
      serviceName: "limpieza",
      providerName: "ana",
      startAt: next.slot.start,
      endAt: next.slot.end,
    });
    expect(bookedNext).toMatchObject({ success: true, appointment: { id: "appt-next" } });
  });
});
