import { defineTool } from "eve/tools";
import { z } from "zod";

import {
  FOLLOW_UP_REASON_PRIORITY,
  INACTIVE_PATIENT_DAYS,
  INACTIVE_PATIENT_MONTHS,
  NO_SHOW_WINDOW_DAYS,
  STALLED_TREATMENT_DAYS,
  UNANSWERED_QUOTE_DAYS,
} from "@/lib/admin/follow-up/config";
import { currentRoundDate } from "@/lib/admin/follow-up/follow-up";
import { followUpReasonLabel } from "@/lib/admin/follow-up/rules";

import { resolveClaraAccess, type ClaraAccessContext } from "../access";

/**
 * Tool de lectura de reglas de segmentación de Clara (issue #161, Fase 4,
 * design §4.1).
 *
 * Los umbrales, la prioridad de motivos y la definición de la ronda se leen de
 * las constantes del módulo `src/lib/admin/follow-up/`; la tool no los repite
 * en texto literal. Así la explicación que Clara da al staff sale del código y
 * no del prompt.
 */

const getFollowUpRulesInputSchema = z.object({});

type GetFollowUpRulesInput = z.infer<typeof getFollowUpRulesInputSchema>;

const ROUND_DEFINITION =
  "La ronda es el día calendario en America/Mexico_City (YYYY-MM-DD) y agrupa los casos elegibles de ese día.";

export default defineTool({
  description:
    "Devuelve los umbrales, la prioridad de motivos y la definición de la ronda del módulo de seguimiento, tal como están definidos en el código. Úsala para explicar por qué un paciente está en la lista; nunca enunciar umbrales que no vengan de aquí.",
  inputSchema: getFollowUpRulesInputSchema,
  async execute(_input: GetFollowUpRulesInput, ctx: ClaraAccessContext) {
    const access = resolveClaraAccess(ctx);
    if ("error" in access) {
      return { success: false, error: access.error };
    }

    const reasonPriority = [...FOLLOW_UP_REASON_PRIORITY];
    const reasonLabels = Object.fromEntries(
      reasonPriority.map((reason) => [reason, followUpReasonLabel(reason)]),
    );

    return {
      success: true,
      roundDate: currentRoundDate(new Date()),
      thresholds: {
        noShowWindowDays: NO_SHOW_WINDOW_DAYS,
        stalledTreatmentDays: STALLED_TREATMENT_DAYS,
        inactivePatientMonths: INACTIVE_PATIENT_MONTHS,
        inactivePatientDays: INACTIVE_PATIENT_DAYS,
        unansweredQuoteDays: UNANSWERED_QUOTE_DAYS,
      },
      reasonPriority,
      reasonLabels,
      roundDefinition: ROUND_DEFINITION,
      message:
        "Estos son los umbrales y prioridades vigentes del seguimiento; cualquier explicación de la lista debe basarse en estos valores.",
    };
  },
});
