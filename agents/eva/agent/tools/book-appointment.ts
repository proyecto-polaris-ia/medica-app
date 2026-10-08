import { defineTool } from "eve/tools";
import { z } from "zod";

import { selectPatientPhone, type TrustedContactToolContext } from "../trusted-contact-context";

import { bookAppointment } from "@/lib/booking/booking";
import { resolveProviderByName, resolveServiceByName } from "@/lib/booking/catalog";
import {
  PatientIdentityConflictError,
  resolvePatient,
} from "@/lib/booking/patient-resolution";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const CLINIC_TIMEZONE = "America/Mexico_City";

const bookingInputSchema = z.object({
  patientPhone: z.string().optional().describe("Teléfono del paciente en formato E.164. No lo uses si existe trustedPatientPhone de WhatsApp."),
  patientEmail: z.string().email().optional().describe("Email del paciente, si fue proporcionado"),
  trustedContactSource: z.enum(["whatsapp"]).optional().describe("Canal confiable que originó el mensaje"),
  trustedPatientPhone: z.string().optional().describe("Teléfono confiable del remitente de WhatsApp"),
  patientName: z.string().trim().min(1).optional().describe("Nombre del paciente"),
  serviceName: z.string().min(1).describe("Nombre del servicio (ej: 'Limpieza dental')"),
  providerName: z.string().min(1).describe("Nombre del doctor (ej: 'Dra. Ana Martínez')"),
  startAt: z.string().describe("Fecha y hora de inicio en formato ISO (ej: '2026-09-15T10:00:00')"),
  endAt: z.string().describe("Fecha y hora de fin en formato ISO (ej: '2026-09-15T10:45:00')"),
  notes: z.string().optional().describe("Notas adicionales para el doctor"),
});

type BookingInput = z.infer<typeof bookingInputSchema>;
type AppointmentRow = { id: string; status: string };

function parseDate(value: string, field: string): Date | { error: string } {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { error: `${field} inválido. Usa formato ISO.` };
  return date;
}

function validateDateRange(startAt: string, endAt: string): { start: Date; end: Date } | { error: string } {
  const start = parseDate(startAt, "startAt");
  if ("error" in start) return start;

  const end = parseDate(endAt, "endAt");
  if ("error" in end) return end;

  if (end.getTime() <= start.getTime()) {
    return { error: "La fecha de fin debe ser posterior a la fecha de inicio." };
  }

  if (start.getTime() < Date.now()) {
    return { error: "No se pueden agendar citas en fechas pasadas." };
  }

  return { start, end };
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: CLINIC_TIMEZONE,
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function findBookedAppointment({
  patientId,
  serviceId,
  providerId,
  startAt,
  endAt,
}: {
  patientId: string;
  serviceId: string;
  providerId: string;
  startAt: Date;
  endAt: Date;
}): Promise<AppointmentRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("appointments")
    .select("id, status")
    .match({
      patient_id: patientId,
      service_id: serviceId,
      provider_id: providerId,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
    })
    .maybeSingle();

  if (error) throw new Error(`No se pudo leer la cita creada: ${error.message}`);
  return (data as AppointmentRow | null) ?? null;
}

function errorMessage(error: unknown): string {
  if (error instanceof PatientIdentityConflictError) {
    return "El teléfono y el email pertenecen a pacientes distintos. Escala a humano para resolver la identidad.";
  }
  return error instanceof Error ? error.message : "No se pudo agendar la cita.";
}

export default defineTool({
  description:
    "Agenda una cita dental para un paciente, servicio, doctor y horario validados. Escribe en la base de datos.",
  inputSchema: bookingInputSchema,
  async execute(input: BookingInput, ctx: TrustedContactToolContext) {
    const range = validateDateRange(input.startAt, input.endAt);
    if ("error" in range) return { success: false, error: range.error };

    try {
      const service = await resolveServiceByName(input.serviceName);
      if (!service) return { success: false, error: `Servicio no encontrado: ${input.serviceName}` };

      const provider = await resolveProviderByName(input.providerName);
      if (!provider) return { success: false, error: `Doctor no encontrado: ${input.providerName}` };

      const patientPhone = selectPatientPhone(input, "Necesito el teléfono del paciente para agendar la cita.", ctx);
      if ("error" in patientPhone) return { success: false, error: patientPhone.error };

      const patient = await resolvePatient({
        phone: patientPhone.phone,
        email: input.patientEmail,
        fullName: input.patientName,
      });

      const result = await bookAppointment({
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        startAt: range.start,
        endAt: range.end,
        notes: input.notes,
      });

      if ("type" in result && result.type === "conflict") {
        return {
          success: false,
          conflict: true,
          error: result.message,
        };
      }

      const appointment = await findBookedAppointment({
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        startAt: range.start,
        endAt: range.end,
      });

      return {
        success: true,
        appointment: {
          id: appointment?.id,
          patientName: patient.full_name,
          service: service.name,
          provider: provider.name,
          datetime: formatDateTime(range.start),
          status: appointment?.status ?? "requested",
        },
      };
    } catch (error) {
      return {
        success: false,
        error: errorMessage(error),
      };
    }
  },
});
