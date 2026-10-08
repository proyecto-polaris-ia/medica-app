import { defineTool } from "eve/tools";
import { z } from "zod";

import { requireTrustedWhatsAppPhone, type TrustedContactToolContext } from "../trusted-contact-context";

import { getSupabaseAdmin } from "@/lib/supabase/server";

const CLINIC_TIMEZONE = "America/Mexico_City";
const ACTIVE_APPOINTMENT_STATUSES = ["requested", "confirmed", "pending"] as const;
const SECURITY_REFUSAL = "Por seguridad no puedo consultar citas sin un WhatsApp vinculado al paciente.";

const listMyAppointmentsInputSchema = z.object({
  maxResults: z.number().int().min(1).max(10).optional().describe("Número máximo de citas próximas a devolver"),
});

type ListMyAppointmentsInput = z.infer<typeof listMyAppointmentsInputSchema>;

type PatientRow = {
  id: string;
  full_name: string;
};

type AppointmentRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  services?: { name?: string | null } | null;
  providers?: { name?: string | null } | null;
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: CLINIC_TIMEZONE,
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function appointmentName(value: { name?: string | null } | null | undefined, fallback: string): string {
  return value?.name?.trim() || fallback;
}

async function findPatientByTrustedPhone(phone: string): Promise<PatientRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("patients")
    .select("id, full_name")
    .eq("phone_e164", phone)
    .maybeSingle();

  if (error) throw new Error(`No se pudo buscar el paciente: ${error.message}`);
  return (data as PatientRow | null) ?? null;
}

async function listUpcomingAppointments(patientId: string, maxResults: number): Promise<AppointmentRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("appointments")
    .select("id, start_at, end_at, status, services(name), providers(name)")
    .eq("patient_id", patientId)
    .gte("start_at", new Date().toISOString())
    .in("status", [...ACTIVE_APPOINTMENT_STATUSES])
    .order("start_at", { ascending: true })
    .limit(maxResults);

  if (error) throw new Error(`No se pudieron consultar las citas: ${error.message}`);
  return (data as AppointmentRow[] | null) ?? [];
}

export default defineTool({
  description:
    "Consulta las próximas citas del paciente identificado por el WhatsApp confiable del canal. Solo lectura; no acepta teléfonos escritos en el chat.",
  inputSchema: listMyAppointmentsInputSchema,
  async execute(input: ListMyAppointmentsInput, ctx: TrustedContactToolContext) {
    const trustedPhone = requireTrustedWhatsAppPhone(ctx, SECURITY_REFUSAL);
    if ("error" in trustedPhone) return { success: false, error: trustedPhone.error };

    try {
      const patient = await findPatientByTrustedPhone(trustedPhone.phone);
      if (!patient) {
        return {
          success: true,
          patientFound: false,
          appointments: [],
          message: "No encontré citas próximas vinculadas a este WhatsApp.",
        };
      }

      const appointments = await listUpcomingAppointments(patient.id, input.maxResults ?? 5);
      return {
        success: true,
        patientFound: true,
        patientName: patient.full_name,
        appointments: appointments.map((appointment) => ({
          id: appointment.id,
          service: appointmentName(appointment.services, "Servicio dental"),
          provider: appointmentName(appointment.providers, "Doctor del consultorio"),
          datetime: formatDateTime(appointment.start_at),
          startAt: appointment.start_at,
          endAt: appointment.end_at,
          status: appointment.status,
        })),
        message: appointments.length
          ? "Encontré estas citas próximas vinculadas a este WhatsApp."
          : "No encontré citas próximas vinculadas a este WhatsApp.",
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "No se pudieron consultar las citas.",
      };
    }
  },
});
