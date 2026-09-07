// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolvePatient = vi.fn();
const from = vi.fn();
const select = vi.fn();
const or = vi.fn();
const eq = vi.fn();
const maybeSingle = vi.fn();

class PatientIdentityConflictError extends Error {
  constructor() {
    super("The provided contacts belong to different patients");
    this.name = "PatientIdentityConflictError";
  }
}

vi.mock("@/lib/booking/patient-resolution", () => ({
  PatientIdentityConflictError,
  resolvePatient,
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({ from }),
}));

const { default: tool } = await import("../../../agent/tools/resolve-patient");
const execute = tool.execute as (input: {
  phone: string;
  fullName?: string;
  email?: string;
}) => Promise<unknown>;

function queryResult(result: unknown) {
  maybeSingle.mockResolvedValue(result);
  eq.mockReturnValue({ maybeSingle });
  or.mockReturnValue({ maybeSingle });
  select.mockReturnValue({ or, eq });
  from.mockReturnValue({ select });
}

describe("resolve-patient tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an existing patient with isNew false", async () => {
    queryResult({ data: { id: "pat-1", full_name: "María García", phone_e164: "+5215512345678", email: "maria@example.com" }, error: null });
    resolvePatient.mockResolvedValue({ id: "pat-1", full_name: "María García" });

    await expect(execute({ phone: "+5215512345678" })).resolves.toEqual({
      success: true,
      patient: {
        id: "pat-1",
        fullName: "María García",
        phone: "+5215512345678",
        email: "maria@example.com",
        isNew: false,
      },
    });
  });

  it("requires fullName before creating a new patient", async () => {
    queryResult({ data: null, error: null });

    await expect(execute({ phone: "+5215512345678" })).resolves.toEqual({
      success: false,
      error: "Nombre completo requerido para registrar un paciente nuevo.",
    });
    expect(resolvePatient).not.toHaveBeenCalled();
  });

  it("creates a new patient through existing patient resolution", async () => {
    queryResult({ data: null, error: null });
    resolvePatient.mockResolvedValue({ id: "pat-new", full_name: "Juan Pérez" });
    maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: "pat-new", full_name: "Juan Pérez", phone_e164: "+5215512345678", email: null }, error: null });

    await expect(execute({ phone: "+5215512345678", fullName: "Juan Pérez" })).resolves.toEqual({
      success: true,
      patient: {
        id: "pat-new",
        fullName: "Juan Pérez",
        phone: "+5215512345678",
        email: undefined,
        isNew: true,
      },
    });
  });

  it("returns a structured error for crossed patient identities", async () => {
    queryResult({ data: null, error: null });
    resolvePatient.mockRejectedValue(new PatientIdentityConflictError());

    await expect(
      execute({ phone: "+5215512345678", email: "juan@example.com", fullName: "Juan Pérez" })
    ).resolves.toEqual({
      success: false,
      error: "El teléfono y el email pertenecen a pacientes distintos. Escala a humano para resolver la identidad.",
    });
  });
});
