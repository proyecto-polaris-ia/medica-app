import { defineTool } from "eve/tools";
import { z } from "zod";

import { getPatientReceivableSummary } from "@/lib/admin/accounts-receivable";
import { parseThresholdDays } from "@/lib/admin/validate";
import { getSupabaseAdmin } from "@/lib/supabase/server";

import {
  requireTrustedWhatsAppPhone,
  type TrustedContactToolContext,
} from "../trusted-contact-context";

const SECURITY_REFUSAL =
  "Por seguridad no puedo consultar saldos sin un WhatsApp vinculado al paciente.";

const getPatientBalanceInputSchema = z.object({
  thresholdDays: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Días de tolerancia antes de marcar un plan como vencido"),
});

type GetPatientBalanceInput = z.infer<typeof getPatientBalanceInputSchema>;

type PatientRow = {
  id: string;
  full_name: string;
};

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

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(value);
}

async function findPatientByTrustedPhone(phone: string): Promise<PatientRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("patients")
    .select("id, full_name")
    .eq("phone_e164", phone)
    .maybeSingle();

  if (error) throw new Error(`No se pudo buscar el paciente: ${error.message}`);
  return (data as PatientRow | null) ?? null;
}

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
    return `Hola, ${patientName}. No tienes saldo pendiente en el consultorio.`;
  }
  if (balance < 0) {
    return `Hola, ${patientName}. Tienes un crédito a tu favor de ${formatMoney(creditAmount)} en el consultorio.`;
  }
  const overdueCount = planBalances.filter((plan) => plan.isPastDue).length;
  const overdueNote =
    overdueCount > 0
      ? ` De ellos, ${overdueCount} ${overdueCount === 1 ? "está vencido" : "están vencidos"}.`
      : "";
  return `Hola, ${patientName}. Tu saldo pendiente actual es de ${formatMoney(balance)}, distribuido en ${planBalances.length} ${planBalances.length === 1 ? "plan aceptado" : "planes aceptados"}.${overdueNote}`;
}

export default defineTool({
  description:
    "Consulta el saldo pendiente del paciente identificado por el WhatsApp confiable del canal. Solo lectura; los montos vienen de la base de datos y nunca de lo que el paciente escriba en el chat.",
  inputSchema: getPatientBalanceInputSchema,
  async execute(input: GetPatientBalanceInput, ctx: TrustedContactToolContext) {
    const trustedPhone = requireTrustedWhatsAppPhone(ctx, SECURITY_REFUSAL);
    if ("error" in trustedPhone) {
      return { success: false, error: trustedPhone.error };
    }

    try {
      const patient = await findPatientByTrustedPhone(trustedPhone.phone);
      if (!patient) {
        return {
          success: true,
          patientFound: false,
          planBalances: [],
          message:
            "No encontré un paciente vinculado a este WhatsApp. Para revisar tu saldo necesito que el número esté registrado en el consultorio.",
        };
      }

      const thresholdDays = parseThresholdDays(input.thresholdDays);
      const summary = await getPatientReceivableSummary(patient.id, {
        thresholdDays,
      });

      const planBalances = summary.planBalances.map(buildPlanBalanceView);
      const result = {
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
      return result;
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