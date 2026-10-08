import { defineTool } from "eve/tools";
import { z } from "zod";

import { validateFollowUpDraftText } from "@/lib/admin/follow-up/draft";
import { generateFollowUpDraftText } from "@/lib/admin/follow-up/draft-llm";
import {
  createFollowUpDraft,
  findFollowUpDraftForRound,
  updateFollowUpDraftBody,
} from "@/lib/admin/follow-up/drafts";
import {
  currentRoundDate,
  listDailyFollowUpCases,
} from "@/lib/admin/follow-up/follow-up";

import {
  requireClaraActor,
  resolveClaraAccess,
  resolveRoundCase,
  type ClaraAccessContext,
} from "../access";

/**
 * Tool de redacción y persistencia del borrador de seguimiento (issue #161,
 * Fase 4, design §4.2 y §D5).
 *
 * Replica la ruta admin: autoriza → exige actor → exige que el caso esté en la
 * ronda → respeta un borrador ya decidido → genera el texto con LLM validado y
 * fallback determinista → revalida los guardrails justo antes de persistir →
 * crea o regenera en `follow_up_message_drafts`. Nunca en lote y nunca envía.
 */

const draftFollowUpMessageInputSchema = z.object({
  patientId: z
    .string()
    .uuid()
    .describe("Identificador del paciente tomado de list-follow-up-cases"),
  patientName: z
    .string()
    .trim()
    .optional()
    .describe(
      "Nombre tal como aparece en la lista, solo para el mensaje de confirmación",
    ),
});

type DraftFollowUpMessageInput = z.infer<typeof draftFollowUpMessageInputSchema>;

const NOT_IN_ROUND_ERROR =
  "Ese paciente no está en la lista de seguimiento de hoy.";

export default defineTool({
  description:
    "Genera y guarda el borrador de seguimiento de un único paciente de la lista del día, en estado draft. Si el borrador ya existe en draft lo regenera; si ya fue aprobado, rechazado o enviado lo devuelve sin cambios. Nunca genera en lote y nunca envía nada.",
  inputSchema: draftFollowUpMessageInputSchema,
  async execute(input: DraftFollowUpMessageInput, ctx: ClaraAccessContext) {
    const access = resolveClaraAccess(ctx);
    if ("error" in access) {
      return { success: false, error: access.error };
    }

    const actor = requireClaraActor(access);
    if ("error" in actor) {
      return { success: false, error: actor.error };
    }

    const now = new Date();
    const roundDate = currentRoundDate(now);

    const round = await resolveRoundCase({ patientId: input.patientId }, { now });
    if ("error" in round) {
      return { success: false, error: round.error };
    }
    if (!round.inRound || round.alreadyMarked) {
      return { success: false, error: NOT_IN_ROUND_ERROR };
    }

    try {
      const cases = await listDailyFollowUpCases({ now });
      const followUpCase = cases.find((item) => item.patientId === input.patientId);
      if (!followUpCase) {
        return { success: false, error: NOT_IN_ROUND_ERROR };
      }

      const existing = await findFollowUpDraftForRound({
        patientId: input.patientId,
        roundDate,
      });

      if (existing && existing.status !== "draft") {
        // Borrador ya decidido: inmutable, sin tokens y sin escritura.
        return {
          success: true,
          regenerated: false,
          draft: {
            id: existing.id,
            status: existing.status,
            body: existing.body,
          },
          message: `El borrador de ${followUpCase.patientName} ya está en estado ${existing.status}; no se modificó.`,
        };
      }

      const draftText = await generateFollowUpDraftText(followUpCase);
      // Revalidación inmediatamente antes de persistir: la ruta de creación no
      // valida al insertar, así que la tabla nunca guarda texto prohibido.
      const body = validateFollowUpDraftText(draftText.body);

      if (existing) {
        const draft = await updateFollowUpDraftBody({
          id: existing.id,
          body,
          userId: actor.actorUserId,
          now,
        });
        return {
          success: true,
          regenerated: true,
          source: draftText.source,
          draft: { id: draft.id, status: draft.status, body: draft.body },
          message: `Regeneré el borrador de ${followUpCase.patientName}.`,
        };
      }

      const { draft, created } = await createFollowUpDraft({
        patientId: input.patientId,
        userId: actor.actorUserId,
        body,
        templateName: draftText.templateName,
        roundDate,
      });

      return {
        success: true,
        created,
        source: draftText.source,
        draft: { id: draft.id, status: draft.status, body: draft.body },
        message: `Preparé el borrador de ${followUpCase.patientName} en estado ${draft.status}.`,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo preparar el borrador de seguimiento.",
      };
    }
  },
});
