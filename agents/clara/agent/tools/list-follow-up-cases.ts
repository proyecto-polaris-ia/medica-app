import { defineTool } from "eve/tools";
import { z } from "zod";

import {
  currentRoundDate,
  listDailyFollowUpCases,
} from "@/lib/admin/follow-up/follow-up";

import { resolveClaraAccess, type ClaraAccessContext } from "../access";

/**
 * Tool de lectura de la lista diaria de seguimiento de Clara (issue #161,
 * Fase 4, design §4.1).
 *
 * Envuelve `listDailyFollowUpCases` sin filtros: cualquier filtro del modelo
 * sería un segundo criterio de selección en paralelo a las reglas del módulo
 * determinista. Solo lectura: nunca escribe ni modifica nada.
 */

const listFollowUpCasesInputSchema = z.object({});

type ListFollowUpCasesInput = z.infer<typeof listFollowUpCasesInputSchema>;

export default defineTool({
  description:
    "Devuelve la lista diaria de seguimiento de la ronda actual: los pacientes elegibles con su motivo principal, la etiqueta del motivo y la fecha de referencia. Solo lectura y exclusiva para staff y doctores autorizados; la lista es idéntica a la del panel admin.",
  inputSchema: listFollowUpCasesInputSchema,
  async execute(_input: ListFollowUpCasesInput, ctx: ClaraAccessContext) {
    const access = resolveClaraAccess(ctx);
    if ("error" in access) {
      return { success: false, error: access.error };
    }

    try {
      const cases = await listDailyFollowUpCases();
      const roundDate = cases[0]?.roundDate ?? currentRoundDate(new Date());

      return {
        success: true,
        roundDate,
        count: cases.length,
        cases: cases.map((followUpCase) => ({
          patientId: followUpCase.patientId,
          patientName: followUpCase.patientName,
          patientPhoneE164: followUpCase.patientPhoneE164,
          reason: followUpCase.reason,
          reasonLabel: followUpCase.reasonLabel,
          reasonDate: followUpCase.reasonDate,
        })),
        message:
          cases.length === 0
            ? "La lista de seguimiento de la ronda está vacía."
            : `La ronda ${roundDate} tiene ${cases.length} caso(s) de seguimiento.`,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo consultar la lista de seguimiento.",
      };
    }
  },
});
