import { defineTool } from "eve/tools";
import { z } from "zod";

import { getPatientReceivableSummary } from "@/lib/admin/accounts-receivable";
import { parseThresholdDays } from "@/lib/admin/validate";

import {
  authorizeAndResolvePatient,
  buildPatientNotResolvedError,
  type DoctorAccessContext,
} from "../access";

const listOverdueBalancesInputSchema = z.object({
  patientPhone: z
    .string()
    .trim()
    .optional()
    .describe(
      "Teléfono registrado del paciente en el consultorio (cualquier formato; se normaliza a E.164)",
    ),
  patientName: z
    .string()
    .trim()
    .optional()
    .describe("Nombre del paciente tal como está registrado en el consultorio"),
  thresholdDays: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Días de tolerancia antes de marcar un plan como vencido"),
});

type ListOverdueBalancesInput = z.infer<typeof listOverdueBalancesInputSchema>;

type OverduePlanView = {
  treatmentPlanId: string;
  name: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  daysPastDue: number;
  isPastDue: true;
};

function buildOverduePlanView(plan: {
  treatmentPlanId: string;
  name: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  daysPastDue: number;
  isPastDue: boolean;
}): OverduePlanView {
  return {
    treatmentPlanId: plan.treatmentPlanId,
    name: plan.name,
    status: plan.status,
    totalAmount: plan.totalAmount,
    paidAmount: plan.paidAmount,
    balance: plan.balance,
    daysPastDue: plan.daysPastDue,
    isPastDue: true,
  };
}

function buildOverdueMessage(patientName: string, count: number): string {
  if (count === 0) {
    return `${patientName} no tiene planes vencidos en este momento.`;
  }
  return `${patientName} tiene ${count} ${count === 1 ? "plan vencido" : "planes vencidos"} en el consultorio.`;
}

export default defineTool({
  description:
    "Lista los planes vencidos del paciente que el doctor indica por teléfono registrado o nombre. Exclusiva para doctores autorizados; solo lectura; los montos y filtros de vencido se calculan en la base de datos.",
  inputSchema: listOverdueBalancesInputSchema,
  async execute(input: ListOverdueBalancesInput, ctx: DoctorAccessContext) {
    const target = await authorizeAndResolvePatient(ctx, {
      patientPhone: input.patientPhone,
      patientName: input.patientName,
    });
    if ("error" in target) {
      return { success: false, error: target.error };
    }
    if (!("patient" in target)) {
      return buildPatientNotResolvedError(target);
    }
    const patient = target.patient;

    try {
      const thresholdDays = parseThresholdDays(input.thresholdDays);
      const summary = await getPatientReceivableSummary(patient.id, {
        thresholdDays,
      });

      const overduePlans = summary.planBalances
        .filter((plan) => plan.isPastDue)
        .map(buildOverduePlanView);

      return {
        success: true,
        patientFound: true,
        patientName: patient.full_name,
        overduePlans,
        message: buildOverdueMessage(patient.full_name, overduePlans.length),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo consultar los planes vencidos del paciente.",
      };
    }
  },
});
