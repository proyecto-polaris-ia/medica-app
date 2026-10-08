import { defineTool } from "eve/tools";
import { z } from "zod";

import { markFollowUpContact } from "@/lib/admin/follow-up/follow-up";

import {
  buildPatientNotResolvedError,
  requireClaraActor,
  resolveClaraAccess,
  resolvePatient,
  resolveRoundCase,
  type ClaraAccessContext,
} from "../access";

/**
 * Tool de escritura `follow_up_contacts` estado `contacted` (issue #161,
 * Fase 4, design §4.2 y §D3).
 *
 * El estado de contacto vive en `follow_up_contacts` a través del camino
 * determinista existente. Exige actor de auditoría y que el paciente
 * pertenezca a la ronda; el `upsert` por `(patient_id, round_date)` la hace
 * idempotente dentro de la ronda.
 */

const markContactAttemptedInputSchema = z
  .object({
    patientId: z
      .string()
      .uuid()
      .optional()
      .describe("Identificador del paciente tomado de list-follow-up-cases"),
    patientPhone: z
      .string()
      .trim()
      .optional()
      .describe("Teléfono registrado del paciente (cualquier formato)"),
    patientName: z
      .string()
      .trim()
      .optional()
      .describe("Nombre del paciente tal como aparece en la lista"),
    note: z
      .string()
      .trim()
      .optional()
      .describe("Nota breve del intento (opcional)"),
  })
  .refine(
    (value) => Boolean(value.patientId || value.patientPhone || value.patientName),
    {
      message:
        "Indica patientId (de la lista del día), o bien el teléfono o el nombre del paciente.",
    },
  );

type MarkContactAttemptedInput = z.infer<typeof markContactAttemptedInputSchema>;

const NOT_IN_ROUND_ERROR =
  "Ese paciente no está en la lista de seguimiento de la ronda actual.";

export default defineTool({
  description:
    "Marca un caso de la lista del día como contactado en follow_up_contacts, con el instante y el actor que lo ejecutó. Exclusiva para staff y doctores autorizados con actor mapeado; idempotente dentro de la ronda.",
  inputSchema: markContactAttemptedInputSchema,
  async execute(input: MarkContactAttemptedInput, ctx: ClaraAccessContext) {
    const access = resolveClaraAccess(ctx);
    if ("error" in access) {
      return { success: false, error: access.error };
    }

    const actor = requireClaraActor(access);
    if ("error" in actor) {
      return { success: false, error: actor.error };
    }

    const target = await resolvePatient({
      patientId: input.patientId,
      phone: input.patientPhone,
      name: input.patientName,
    });
    if ("error" in target) {
      return { success: false, error: target.error };
    }
    if (!("patient" in target)) {
      return buildPatientNotResolvedError(target);
    }

    const round = await resolveRoundCase({ patientId: target.patient.id });
    if ("error" in round) {
      return { success: false, error: round.error };
    }
    if (!round.inRound) {
      return { success: false, error: NOT_IN_ROUND_ERROR };
    }

    try {
      const contact = await markFollowUpContact({
        patientId: target.patient.id,
        status: "contacted",
        note: input.note ?? null,
        userId: actor.actorUserId,
      });

      return {
        success: true,
        contact: {
          id: contact.id,
          patientId: contact.patientId,
          roundDate: contact.roundDate,
          status: contact.status,
          contactedAt: contact.contactedAt,
          dismissedAt: contact.dismissedAt,
          note: contact.note,
        },
        message: `Marqué a ${target.patient.full_name} como contactado en la ronda ${contact.roundDate}.`,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo marcar el contacto del paciente.",
      };
    }
  },
});
