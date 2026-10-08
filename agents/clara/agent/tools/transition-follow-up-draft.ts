import { defineTool } from "eve/tools";
import { z } from "zod";

import { ConflictError, NotFoundError } from "@/lib/admin/errors";
import { transitionFollowUpDraft } from "@/lib/admin/follow-up/drafts";

import {
  requireClaraActor,
  resolveClaraAccess,
  type ClaraAccessContext,
} from "../access";

/**
 * Tool de transición de borrador de Clara (issue #161, Fase 4, design §D6).
 *
 * `decision` es un enum cerrado `approved | rejected`: las transiciones hacia
 * `sent` / `sent_failed` no son expresables y un borrador ya decidido no se
 * puede volver a cambiar. Aprobar **no** envía: el envío queda fuera del set
 * de tools de Clara.
 */

const transitionFollowUpDraftInputSchema = z.object({
  draftId: z
    .string()
    .uuid()
    .describe(
      "Identificador del borrador devuelto por draft-follow-up-message o get-follow-up-draft",
    ),
  decision: z.enum(["approved", "rejected"]),
});

type TransitionFollowUpDraftInput = z.infer<
  typeof transitionFollowUpDraftInputSchema
>;

export default defineTool({
  description:
    "Aprueba o rechaza explícitamente un borrador de seguimiento en estado draft. Nunca marca como enviado, nunca reclama el borrador para envío y nunca envía: el envío lo hace el equipo por su flujo de WhatsApp.",
  inputSchema: transitionFollowUpDraftInputSchema,
  async execute(input: TransitionFollowUpDraftInput, ctx: ClaraAccessContext) {
    const access = resolveClaraAccess(ctx);
    if ("error" in access) {
      return { success: false, error: access.error };
    }

    const actor = requireClaraActor(access);
    if ("error" in actor) {
      return { success: false, error: actor.error };
    }

    try {
      const draft = await transitionFollowUpDraft({
        id: input.draftId,
        status: input.decision,
        userId: actor.actorUserId,
      });

      return {
        success: true,
        draft: { id: draft.id, status: draft.status },
        message:
          input.decision === "approved"
            ? "El borrador quedó aprobado. El envío lo realiza el equipo por su flujo de WhatsApp."
            : "El borrador quedó rechazado.",
      };
    } catch (error) {
      if (error instanceof ConflictError || error instanceof NotFoundError) {
        return { success: false, error: error.message };
      }
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo cambiar el estado del borrador.",
      };
    }
  },
});
