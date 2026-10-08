import { defineTool } from "eve/tools";
import { z } from "zod";

import { getPatientReceivableSummary } from "@/lib/admin/accounts-receivable";
import { parseThresholdDays } from "@/lib/admin/validate";

import {
  authorizeAndResolvePatient,
  buildPatientNotResolvedError,
  type DoctorAccessContext,
} from "../access";

const getPatientBalanceInputSchema = z.object({
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

type GetPatientBalanceInput = z.infer<typeof getPatientBalanceInputSchema>;

type PlanBalanceView = {
  treatmentPlanId: string;
  name: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  daysPastDue: number;
  isPastDue: boolean;
};

function buildPlanBalanceView(plan: {
  treatmentPlanId: string;
  name: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  daysPastDue: number;
  isPastDue: boolean;
}): PlanBalanceView {
  return {
    treatmentPlanId: plan.treatmentPlanId,
    name: plan.name,
    status: plan.status,
    totalAmount: plan.totalAmount,
    paidAmount: plan.paidAmount,
    balance: plan.balance,
    daysPastDue: plan.daysPastDue,
    isPastDue: plan.isPastDue,
  };
}

function buildBalanceMessage(params: {
  patientName: string;
  balance: number;
  creditAmount: number;
  planBalances: PlanBalanceView[];
}): string {
  const { patientName, balance, creditAmount, planBalances } = params;
  if (balance <= 0 && creditAmount === 0) {
    return `${patientName} no tiene saldo pendiente en el consultorio.`;
  }
  if (balance < 0) {
    return `${patientName} tiene un crédito a su favor de ${formatMoney(creditAmount)} en el consultorio.`;
  }
  const overdueCount = planBalances.filter((plan) => plan.isPastDue).length;
  const overdueNote =
    overdueCount > 0
      ? ` De ellos, ${overdueCount} ${overdueCount === 1 ? "está vencido" : "están vencidos"}.`
      : "";
  return `El saldo pendiente de ${patientName} es de ${formatMoney(balance)}, distribuido en ${planBalances.length} ${planBalances.length === 1 ? "plan aceptado" : "planes aceptados"}.${overdueNote}`;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(value);
}

export default defineTool({
  description:
    "Consulta el saldo pendiente del paciente que el doctor indica por teléfono registrado o nombre. Exclusiva para doctores autorizados; solo lectura; los montos vienen de la base de datos y nunca de lo que el doctor escriba en el chat.",
  inputSchema: getPatientBalanceInputSchema,
  async execute(input: GetPatientBalanceInput, ctx: DoctorAccessContext) {
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

      const planBalances = summary.planBalances.map(buildPlanBalanceView);
      return {
        success: true,
        patientFound: true,
        patientName: patient.full_name,
        balance: summary.balance,
        totalEligibleAmount: summary.totalEligibleAmount,
        paidAmount: summary.paidAmount,
        creditAmount: summary.creditAmount,
        lastPaymentAt: summary.lastPaymentAt,
        planBalances,
        message: buildBalanceMessage({
          patientName: patient.full_name,
          balance: summary.balance,
          creditAmount: summary.creditAmount,
          planBalances,
        }),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo consultar el saldo del paciente.",
      };
    }
  },
});
