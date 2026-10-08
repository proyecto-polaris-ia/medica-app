import { defineTool } from "eve/tools";
import { z } from "zod";

import { createEveWhatsAppEscalation } from "@/lib/whatsapp/eve-escalation";
import { selectPatientPhone, type TrustedContactToolContext } from "../trusted-contact-context";

const escalationInputSchema = z.object({
  reason: z.string().trim().min(1).describe("Motivo de la escalación humana"),
  summary: z.string().trim().min(1).optional().describe("Resumen breve del caso para el equipo humano"),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional().describe("Prioridad operativa de la escalación"),
  patientMessage: z.string().trim().optional().describe("Mensaje original o contexto relevante del paciente"),
  patientPhone: z.string().optional().describe("Teléfono del paciente; en WhatsApp se ignora si existe teléfono confiable del canal"),
  trustedContactSource: z.literal("whatsapp").optional(),
  trustedPatientPhone: z.string().optional(),
});

type EscalationInput = z.infer<typeof escalationInputSchema>;

export default defineTool({
  description:
    "Crea una escalación humana para el equipo del consultorio en la cola de WhatsApp. Úsala antes de decir que una persona dará seguimiento.",
  inputSchema: escalationInputSchema,
  async execute(input: EscalationInput, ctx: TrustedContactToolContext) {
    const patientPhone = selectPatientPhone(
      input,
      "No puedo crear una escalación segura sin un teléfono confiable de WhatsApp.",
      ctx,
    );

    if ("error" in patientPhone) {
      return { success: false, error: patientPhone.error };
    }

    try {
      const escalation = await createEveWhatsAppEscalation({
        patientPhone: patientPhone.phone,
        reason: input.reason,
        summary: input.summary,
        priority: input.priority,
        patientMessage: input.patientMessage,
        intent: "support",
      });

      return {
        success: true,
        escalation: {
          id: escalation.escalationId,
          created: escalation.created,
          status: "open",
        },
        humanAlert: {
          configured: escalation.humanAlertPhoneConfigured,
          sent: Boolean(escalation.humanAlertSend?.ok),
          skipped: escalation.humanAlertSend?.skipped ?? !escalation.humanAlertPhoneConfigured,
          error: escalation.humanAlertSend?.error,
        },
        message: "Escalación creada. Indica al paciente que una persona del consultorio dará seguimiento.",
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "No se pudo crear la escalación humana.",
      };
    }
  },
});
