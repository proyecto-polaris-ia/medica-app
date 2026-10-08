import { defineTool } from "eve/tools";
import { z } from "zod";

import {
  PatientIdentityConflictError,
  resolvePatient,
} from "@/lib/booking/patient-resolution";
import { normalizePatientContact } from "@/lib/booking/patient-contact";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const patientInputSchema = z.object({
  phone: z.string().describe("Teléfono del paciente en formato E.164 (ej: '+521234567890')"),
  fullName: z.string().trim().min(1).optional().describe("Nombre completo del paciente (requerido si es nuevo)"),
  email: z.string().email().optional().describe("Email del paciente (opcional)"),
});

type PatientRow = {
  id: string;
  full_name: string;
  phone_e164: string | null;
  email: string | null;
};

type ResolvePatientInput = z.infer<typeof patientInputSchema>;

function formatPatient(row: PatientRow, isNew: boolean) {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone_e164 ?? undefined,
    email: row.email ?? undefined,
    isNew,
  };
}

function contactFilter(phone?: string, email?: string): string {
  return [phone ? `phone_e164.eq.${phone}` : null, email ? `email.eq.${email}` : null]
    .filter(Boolean)
    .join(",");
}

async function findPatientByContact(phone?: string, email?: string): Promise<PatientRow | null> {
  const filter = contactFilter(phone, email);
  if (!filter) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("patients")
    .select("id, full_name, phone_e164, email")
    .or(filter)
    .maybeSingle();

  if (error) throw new Error(`No se pudo buscar el paciente: ${error.message}`);
  return (data as PatientRow | null) ?? null;
}

async function findPatientById(id: string): Promise<PatientRow> {
  const { data, error } = await getSupabaseAdmin()
    .from("patients")
    .select("id, full_name, phone_e164, email")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`No se pudo leer el paciente: ${error.message}`);
  if (!data) throw new Error("No se pudo leer el paciente después de resolverlo.");
  return data as PatientRow;
}

function errorMessage(error: unknown): string {
  if (error instanceof PatientIdentityConflictError) {
    return "El teléfono y el email pertenecen a pacientes distintos. Escala a humano para resolver la identidad.";
  }
  return error instanceof Error ? error.message : "No se pudo resolver el paciente.";
}

export default defineTool({
  description:
    "Resuelve o crea un paciente del consultorio usando teléfono/email. Escribe en la base de datos cuando registra un paciente nuevo.",
  inputSchema: patientInputSchema,
  async execute(input: ResolvePatientInput) {
    try {
      const contact = normalizePatientContact(input);
      const existing = await findPatientByContact(contact.phone, contact.email);

      if (!existing && !input.fullName?.trim()) {
        return {
          success: false,
          error: "Nombre completo requerido para registrar un paciente nuevo.",
        };
      }

      const resolved = await resolvePatient({
        phone: contact.phone,
        email: contact.email,
        fullName: input.fullName,
      });
      const row = await findPatientById(resolved.id);

      return {
        success: true,
        patient: formatPatient(row, !existing),
      };
    } catch (error) {
      return {
        success: false,
        error: errorMessage(error),
      };
    }
  },
});
