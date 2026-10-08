import { defineTool } from "eve/tools";
import { z } from "zod";

import { findFollowUpDraftForRound } from "@/lib/admin/follow-up/drafts";
import { currentRoundDate } from "@/lib/admin/follow-up/follow-up";

import {
  resolveClaraAccess,
  resolvePatient,
  type ClaraAccessContext,
} from "../access";

/**
 * Tool de lectura del borrador existente de un paciente en la ronda actual
 * (issue #161, Fase 4, design §4.1).
 *
 * Sirve para la idempotencia: el staff consulta si ya hay borrador antes de
 * pedirlo otra vez. Solo lectura: nunca crea ni modifica un borrador.
 */

const getFollowUpDraftInputSchema = z
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
  })
  .refine(
    (value) => Boolean(value.patientId || value.patientPhone || value.patientName),
    {
      message:
        "Indica patientId (de la lista del día), o bien el teléfono o el nombre del paciente.",
    },
  );

type GetFollowUpDraftInput = z.infer<typeof getFollowUpDraftInputSchema>;

export default defineTool({
  description:
    "Consulta el borrador de seguimiento existente de un paciente en la ronda actual, si lo hay: devuelve su estado y su texto para evitar duplicados. Solo lectura y exclusiva para staff y doctores autorizados; nunca crea ni modifica borradores.",
  inputSchema: getFollowUpDraftInputSchema,
  async execute(input: GetFollowUpDraftInput, ctx: ClaraAccessContext) {
    const access = resolveClaraAccess(ctx);
    if ("error" in access) {
      return { success: false, error: access.error };
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
      if ("candidates" in target) {
        return {
          success: true,
          resolved: false,
          candidates: target.candidates,
          message:
            "Encontré más de un paciente con ese nombre. Indica el teléfono registrado del paciente para continuar.",
        };
      }
      return {
        success: true,
        resolved: false,
        candidates: [],
        message:
          "No encontré un paciente con esa referencia. Verifica el nombre o el teléfono registrado en el consultorio.",
      };
    }

    const patient = target.patient;

    try {
      const roundDate = currentRoundDate(new Date());
      const draft = await findFollowUpDraftForRound({
        patientId: patient.id,
        roundDate,
      });

      if (!draft) {
        return {
          success: true,
          resolved: true,
          found: false,
          roundDate,
          message: `No existe un borrador de seguimiento para ${patient.full_name} en la ronda ${roundDate}.`,
        };
      }

      return {
        success: true,
        resolved: true,
        found: true,
        roundDate,
        draft: {
          id: draft.id,
          status: draft.status,
          body: draft.body,
          updatedAt: draft.updatedAt,
        },
        message: `El borrador de ${patient.full_name} está en estado ${draft.status}.`,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo consultar el borrador del paciente.",
      };
    }
  },
});
