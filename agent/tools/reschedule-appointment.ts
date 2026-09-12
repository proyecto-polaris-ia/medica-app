import { defineTool } from "eve/tools";
import { z } from "zod";

import { selectPatientPhone, type TrustedContactToolContext } from "../trusted-contact-context";

import { resolveProviderByName, resolveServiceByName } from "@/lib/booking/catalog";
import {
  PatientIdentityConflictError,
  resolvePatient,
} from "@/lib/booking/patient-resolution";
import { rescheduleAppointment } from "@/lib/booking/reschedule";

const CLINIC_TIMEZONE = "America/Mexico_City";

const rescheduleInputSchema = z.object({
  appointmentId: z.string().optional().describe("ID de la cita original, cuando esté disponible"),
  patientPhone: z.string().optional().describe("Teléfono del paciente en formato E.164. No lo uses si existe trustedPatientPhone de WhatsApp."),
  patientEmail: z.string().email().optional().describe("Email del paciente, si fue proporcionado"),
  trustedContactSource: z.enum(["whatsapp"]).optional().describe("Canal confiable que originó el mensaje"),
  trustedPatientPhone: z.string().optional().describe("Teléfono confiable del remitente de WhatsApp"),
  patientName: z.string().trim().min(1).optional().describe("Nombre del paciente"),
  serviceName: z.string().min(1).describe("Nombre del servicio de la cita original"),
  providerName: z.string().min(1).describe("Nombre del doctor de la cita original"),
  currentStartAt: z.string().optional().describe("Inicio actual de la cita en formato ISO, si no hay appointmentId"),
  currentEndAt: z.string().optional().describe("Fin actual de la cita en formato ISO, si no hay appointmentId"),
  newStartAt: z.string().describe("Nuevo inicio de la cita en formato ISO"),
  newEndAt: z.string().describe("Nuevo fin de la cita en formato ISO"),
  notes: z.string().optional().describe("Notas actualizadas para el doctor"),
});

type RescheduleInput = z.infer<typeof rescheduleInputSchema>;

function parseDate(value: string | undefined, field: string): Date | undefined | { error: string } {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { error: `${field} inválido. Usa formato ISO.` };
  return date;
}

function validateDateRange(input: RescheduleInput):
  | { currentStart?: Date; currentEnd?: Date; newStart: Date; newEnd: Date }
  | { error: string } {
  const currentStart = parseDate(input.currentStartAt, "currentStartAt");
  if (currentStart && "error" in currentStart) return currentStart;

  const currentEnd = parseDate(input.currentEndAt, "currentEndAt");
  if (currentEnd && "error" in currentEnd) return currentEnd;

  if (!input.appointmentId && (!currentStart || !currentEnd)) {
    return { error: "Para reprogramar necesito identificar la cita original." };
  }

  const newStart = parseDate(input.newStartAt, "newStartAt");
  if (!newStart || "error" in newStart) return newStart || { error: "newStartAt es requerido." };

  const newEnd = parseDate(input.newEndAt, "newEndAt");
  if (!newEnd || "error" in newEnd) return newEnd || { error: "newEndAt es requerido." };

  if (newEnd.getTime() <= newStart.getTime()) {
    return { error: "La nueva fecha de fin debe ser posterior a la nueva fecha de inicio." };
  }

  if (newStart.getTime() < Date.now()) {
    return { error: "No se pueden reprogramar citas a fechas pasadas." };
  }

  return { currentStart, currentEnd, newStart, newEnd };
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

function errorMessage(error: unknown): string {
  if (error instanceof PatientIdentityConflictError) {
    return "El teléfono y el email pertenecen a pacientes distintos. Escala a humano para resolver la identidad.";
  }
  return error instanceof Error ? error.message : "No se pudo reprogramar la cita.";
}

export default defineTool({
  description:
    "Reprograma una cita dental existente a un nuevo horario validado. Actualiza la cita original; no crea duplicados.",
  inputSchema: rescheduleInputSchema,
  async execute(input: RescheduleInput, ctx: TrustedContactToolContext) {
    const range = validateDateRange(input);
    if ("error" in range) return { success: false, error: range.error };

    try {
      const service = await resolveServiceByName(input.serviceName);
      if (!service) return { success: false, error: `Servicio no encontrado: ${input.serviceName}` };

      const provider = await resolveProviderByName(input.providerName);
      if (!provider) return { success: false, error: `Doctor no encontrado: ${input.providerName}` };

      const patientPhone = selectPatientPhone(input, "Necesito el teléfono del paciente para reprogramar la cita.", ctx);
      if ("error" in patientPhone) return { success: false, error: patientPhone.error };

      const patient = await resolvePatient({
        phone: patientPhone.phone,
        email: input.patientEmail,
        fullName: input.patientName,
      });

      const result = await rescheduleAppointment({
        appointmentId: input.appointmentId,
        patientId: patient.id,
        serviceId: service.id,
        providerId: provider.id,
        currentStartAt: range.currentStart,
        currentEndAt: range.currentEnd,
        newStartAt: range.newStart,
        newEndAt: range.newEnd,
        notes: input.notes,
      });

      if ("type" in result && result.type === "conflict") {
        return { success: false, conflict: true, error: result.message };
      }

      if ("type" in result) {
        return { success: false, error: result.message };
      }

      return {
        success: true,
        appointment: {
          id: result.appointment.id,
          patientName: patient.full_name,
          service: service.name,
          provider: provider.name,
          datetime: formatDateTime(range.newStart),
          status: result.appointment.status,
        },
      };
    } catch (error) {
      return { success: false, error: errorMessage(error) };
    }
  },
});
