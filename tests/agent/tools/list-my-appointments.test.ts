// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const from = vi.fn();
const patientSelect = vi.fn();
const patientEq = vi.fn();
const patientMaybeSingle = vi.fn();
const appointmentSelect = vi.fn();
const appointmentEq = vi.fn();
const appointmentGte = vi.fn();
const appointmentIn = vi.fn();
const appointmentOrder = vi.fn();
const appointmentLimit = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => ({ from }) }));

const { default: tool } = await import("../../../agent/tools/list-my-appointments");
const execute = tool.execute as (input: { maxResults?: number }, ctx?: unknown) => Promise<unknown>;

const trustedCtx = {
  session: {
    auth: {
      current: {
        attributes: {
          trustedContactSource: "whatsapp",
          trustedPatientPhone: "+527224999206",
        },
      },
      initiator: null,
    },
  },
};

function setupSupabase() {
  patientSelect.mockReturnValue({ eq: patientEq });
  patientEq.mockReturnValue({ maybeSingle: patientMaybeSingle });

  appointmentSelect.mockReturnValue({ eq: appointmentEq });
  appointmentEq.mockReturnValue({ gte: appointmentGte });
  appointmentGte.mockReturnValue({ in: appointmentIn });
  appointmentIn.mockReturnValue({ order: appointmentOrder });
  appointmentOrder.mockReturnValue({ limit: appointmentLimit });

  from.mockImplementation((table: string) => {
    if (table === "patients") return { select: patientSelect };
    if (table === "appointments") return { select: appointmentSelect };
    throw new Error(`unexpected table ${table}`);
  });
}

describe("list-my-appointments tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSupabase();
  });

  it("refuses lookup when no trusted WhatsApp phone exists", async () => {
    await expect(execute({})).resolves.toEqual({
      success: false,
      error: "Por seguridad no puedo consultar citas sin un WhatsApp vinculado al paciente.",
    });

    expect(from).not.toHaveBeenCalled();
  });

  it("does not expose arbitrary patient phone input in its schema", () => {
    expect(JSON.stringify(tool.inputSchema)).not.toContain("patientPhone");
    expect(JSON.stringify(tool.inputSchema)).not.toContain("phone");
  });

  it("returns a safe empty result when the trusted WhatsApp is not linked to a patient", async () => {
    patientMaybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(execute({}, trustedCtx)).resolves.toEqual({
      success: true,
      patientFound: false,
      appointments: [],
      message: "No encontré citas próximas vinculadas a este WhatsApp.",
    });

    expect(patientEq).toHaveBeenCalledWith("phone_e164", "+527224999206");
    expect(appointmentSelect).not.toHaveBeenCalled();
  });

  it("lists only upcoming active appointments for the trusted WhatsApp patient", async () => {
    patientMaybeSingle.mockResolvedValue({ data: { id: "pat-1", full_name: "Daniel Rodriguez" }, error: null });
    appointmentLimit.mockResolvedValue({
      data: [
        {
          id: "appt-1",
          start_at: "2026-09-15T20:00:00.000Z",
          end_at: "2026-09-15T21:00:00.000Z",
          status: "confirmed",
          services: { name: "Limpieza dental" },
          providers: { name: "Dra. Ana Martínez" },
        },
      ],
      error: null,
    });

    await expect(execute({ maxResults: 3 }, trustedCtx)).resolves.toMatchObject({
      success: true,
      patientFound: true,
      patientName: "Daniel Rodriguez",
      appointments: [
        {
          id: "appt-1",
          service: "Limpieza dental",
          provider: "Dra. Ana Martínez",
          status: "confirmed",
        },
      ],
    });

    expect(appointmentEq).toHaveBeenCalledWith("patient_id", "pat-1");
    expect(appointmentGte).toHaveBeenCalledWith("start_at", expect.any(String));
    expect(appointmentIn).toHaveBeenCalledWith("status", ["requested", "confirmed", "pending"]);
    expect(appointmentLimit).toHaveBeenCalledWith(3);
  });
});
