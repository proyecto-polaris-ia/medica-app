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

const listOverdueBalancesInputSchema = z.object({
  thresholdDays: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Días de tolerancia antes de marcar un plan como vencido"),
});

type ListOverdueBalancesInput = z.infer<typeof listOverdueBalancesInputSchema>;

type PatientRow = {
  id: string;
  full_name: string;
};

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

async function findPatientByTrustedPhone(phone: string): Promise<PatientRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("patients")
    .select("id, full_name")
    .eq("phone_e164", phone)
    .maybeSingle();

  if (error) throw new Error(`No se pudo buscar el paciente: ${error.message}`);
  return (data as PatientRow | null) ?? null;
}

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
    return `Hola, ${patientName}. No tienes planes vencidos en este momento.`;
  }
  return `Hola, ${patientName}. Tienes ${count} ${count === 1 ? "plan vencido" : "planes vencidos"} en el consultorio.`;
}

export default defineTool({
  description:
    "Lista los planes vencidos del paciente identificado por el WhatsApp confiable del canal. Solo lectura; los montos y filtros de vencido se calculan en la base de datos. Nunca usa datos de otros pacientes.",
  inputSchema: listOverdueBalancesInputSchema,
  async execute(input: ListOverdueBalancesInput, ctx: TrustedContactToolContext) {
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
          overduePlans: [],
          message:
            "No encontré un paciente vinculado a este WhatsApp. Para revisar tus planes vencidos necesito que el número esté registrado en el consultorio.",
        };
      }

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