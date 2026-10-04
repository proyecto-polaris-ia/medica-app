import { createHash } from "node:crypto";

import { defineTool } from "eve/tools";
import { z } from "zod";

import { isReminderReplyEnabled } from "@/lib/citas/reminder-reply-flag";
import { handleReminderReply } from "@/lib/citas/reminder-reply-service";
import { selectPatientPhone, type TrustedContactToolContext } from "../trusted-contact-context";

const reminderReplyInputSchema = z.object({
  message: z.string().trim().min(1).describe("Texto exacto del mensaje del paciente"),
  providerMessageId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Identificador del mensaje del proveedor; si falta, el tool lo sintetiza de forma estable"),
  trustedContactSource: z.literal("whatsapp").optional(),
  trustedPatientPhone: z.string().optional(),
});

type ReminderReplyInput = z.infer<typeof reminderReplyInputSchema>;

/**
 * Idempotency key base for the service's escalations: a stable hash of the
 * trusted phone plus the exact message text, so repeated identical replies
 * deduplicate instead of creating duplicate escalations. Eve never sees Meta's
 * `providerMessageId`.
 */
function synthesizeProviderMessageId(phone: string, message: string): string {
  const hash = createHash("sha256").update(`${phone}:${message}`).digest("hex");
  return `reminder-reply:${hash}`;
}

export default defineTool({
  description:
    "Detecta de forma determinista si el mensaje del paciente es una respuesta a un recordatorio de cita (confirmación, cancelación o ambigüedad con señal clínica como \"1\", \"sí\", \"confirmo\", \"no puedo\", \"cancelo\"). Llámala ANTES de responder conversacionalmente o de usar cualquier otra herramienta cuando el mensaje pueda ser una respuesta a un recordatorio.",
  inputSchema: reminderReplyInputSchema,
  async execute(input: ReminderReplyInput, ctx: TrustedContactToolContext) {
    const patientPhone = selectPatientPhone(
      input,
      "No puedo procesar la respuesta al recordatorio sin un teléfono confiable de WhatsApp.",
      ctx,
    );

    if ("error" in patientPhone) {
      return { success: false, error: patientPhone.error };
    }

    try {
      if (!isReminderReplyEnabled()) {
        return {
          success: true,
          handled: false,
          outcome: "none",
          responseText: "",
          needsHuman: false,
          message:
            "El manejo de respuestas a recordatorios está deshabilitado; continúa la conversación normalmente.",
        };
      }

      const providerMessageId =
        input.providerMessageId ?? synthesizeProviderMessageId(patientPhone.phone, input.message);

      const result = await handleReminderReply({
        phone: patientPhone.phone,
        message: input.message,
        providerMessageId,
      });

      return {
        success: true,
        handled: result.handled,
        outcome: result.outcome,
        responseText: result.responseText,
        needsHuman: result.needsHuman,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "No se pudo procesar la respuesta al recordatorio.",
      };
    }
  },
});
