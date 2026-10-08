import { defineTool } from "eve/tools";
import { z } from "zod";

import { createPaymentIntent } from "@/lib/payments/payment-intents";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { createEveWhatsAppEscalation } from "@/lib/whatsapp/eve-escalation";

import {
  resolveCollectionsPatientPhone,
  type CollectionsToolContext,
} from "../identity";

const ELIGIBLE_PLAN_STATUSES = ["accepted", "in_progress", "completed"] as const;

const SECURITY_REFUSAL =
  "No puedo registrar una intención de pago sin un teléfono confiable de WhatsApp.";

const PAYMENT_METHODS = ["cash", "card", "transfer", "other"] as const;

const registerPaymentIntentInputSchema = z.object({
  amount: z
    .number()
    .positive()
    .optional()
    .describe("Monto en pesos mexicanos que el paciente indica querer pagar"),
  treatmentPlanName: z
    .string()
    .trim()
    .optional()
    .describe("Nombre del plan a liquidar (debe existir y estar aceptado para ligarlo)"),
  commitment: z
    .string()
    .trim()
    .optional()
    .describe("Compromiso del paciente, por ejemplo 'la próxima semana' o 'el viernes'"),
  method: z
    .enum(PAYMENT_METHODS)
    .optional()
    .describe("Forma de pago indicada por el paciente"),
  notes: z
    .string()
    .trim()
    .optional()
    .describe("Notas adicionales para el equipo que dará seguimiento"),
});

type RegisterPaymentIntentInput = z.infer<typeof registerPaymentIntentInputSchema>;

type PatientRow = {
  id: string;
  full_name: string;
};

type PlanRow = {
  id: string;
  patient_id: string;
  name: string;
  status: string;
  total_amount: number | string;
};

type ResolvedPlanResult =
  | { kind: "resolved"; planId: string; planName: string }
  | { kind: "ambiguous"; planName: string; matches: PlanRow[] }
  | { kind: "not_eligible"; planName: string; status: string }
  | { kind: "not_found"; planName: string };

async function findPatientByTrustedPhone(phone: string): Promise<PatientRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("patients")
    .select("id, full_name")
    .eq("phone_e164", phone)
    .maybeSingle();

  if (error) throw new Error(`No se pudo buscar el paciente: ${error.message}`);
  return (data as PatientRow | null) ?? null;
}

async function fetchEligiblePlans(
  patientId: string,
  planName: string,
): Promise<PlanRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("treatment_plans")
    .select("id, patient_id, name, status, total_amount")
    .eq("patient_id", patientId)
    .ilike("name", planName)
    .in("status", [...ELIGIBLE_PLAN_STATUSES])
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw new Error(`No se pudo buscar el plan: ${error.message}`);
  return ((data ?? []) as unknown as PlanRow[]).map((row) => ({
    ...row,
    name: row.name.trim().toLowerCase() === planName.trim().toLowerCase() ? row.name : row.name,
  }));
}

async function resolveEligiblePlan(
  patientId: string,
  planName: string,
): Promise<ResolvedPlanResult> {
  // Re-query without the status filter to detect non-eligible plans (so we
  // can surface a precise error instead of silently dropping them).
  const { data: anyPlans, error: anyError } = await getSupabaseAdmin()
    .from("treatment_plans")
    .select("id, patient_id, name, status, total_amount")
    .eq("patient_id", patientId)
    .ilike("name", planName)
    .limit(10);

  if (anyError) throw new Error(`No se pudo buscar el plan: ${anyError.message}`);
  const trimmedName = planName.trim().toLowerCase();
  const allMatches = ((anyPlans ?? []) as unknown as PlanRow[]).filter(
    (plan) => plan.name.trim().toLowerCase() === trimmedName,
  );

  if (allMatches.length === 0) {
    return { kind: "not_found", planName };
  }

  const eligible = allMatches.filter((plan) =>
    (ELIGIBLE_PLAN_STATUSES as readonly string[]).includes(plan.status),
  );

  if (eligible.length === 0) {
    return {
      kind: "not_eligible",
      planName,
      status: allMatches[0]?.status ?? "desconocido",
    };
  }

  if (eligible.length > 1) {
    return { kind: "ambiguous", planName, matches: eligible };
  }

  const plan = eligible[0];
  return plan
    ? { kind: "resolved", planId: plan.id, planName: plan.name }
    : { kind: "not_found", planName };
}

function buildIntentSummary(params: {
  patientName: string;
  amount?: number;
  planName?: string;
  resolvedPlanId?: string;
  planResolutionNote?: string;
  commitment?: string;
  method?: string;
}): string {
  const {
    patientName,
    amount,
    planName,
    resolvedPlanId,
    planResolutionNote,
    commitment,
    method,
  } = params;

  const lines: string[] = [`Intención de pago de ${patientName}.`];
  if (typeof amount === "number") {
    lines.push(`Monto indicado: $${amount.toFixed(2)} MXN.`);
  }
  if (planName) {
    if (resolvedPlanId) {
      lines.push(`Plan a liquidar: ${planName}.`);
    } else if (planResolutionNote) {
      lines.push(`Plan mencionado (${planName}): ${planResolutionNote}.`);
    } else {
      lines.push(`Plan mencionado: ${planName}.`);
    }
  }
  if (commitment) {
    lines.push(`Compromiso: ${commitment}.`);
  }
  if (method) {
    lines.push(`Forma de pago indicada: ${method}.`);
  }
  return lines.join(" ");
}

function buildSuccessMessage(params: {
  patientName: string;
  amount?: number;
  planName?: string;
}): string {
  const { patientName, amount, planName } = params;
  const amountText = typeof amount === "number" ? ` por $${amount.toFixed(2)} MXN` : "";
  const planText = planName ? ` del plan ${planName}` : "";
  return `Gracias, ${patientName}. Registré tu intención de pago${amountText}${planText}. Un miembro del consultorio te contactará para coordinar el pago; yo no proceso pagos ni genero links.`;
}

export default defineTool({
  description:
    "Registra la intención de pago del paciente (paciente verificado) en payment_intents y escala a un humano. Nunca mueve dinero, nunca genera links de pago, nunca marca nada como pagado.",
  inputSchema: registerPaymentIntentInputSchema,
  async execute(input: RegisterPaymentIntentInput, ctx: CollectionsToolContext) {
    const patientPhone = await resolveCollectionsPatientPhone(ctx, SECURITY_REFUSAL);
    if ("error" in patientPhone) {
      return { success: false, error: patientPhone.error };
    }

    try {
      const patient = await findPatientByTrustedPhone(patientPhone.phone);
      if (!patient) {
        return {
          success: false,
          error:
            "No encontré un paciente vinculado a este WhatsApp. Para registrar la intención de pago necesito que el número esté registrado en el consultorio.",
        };
      }

      let planResolution: ResolvedPlanResult | null = null;
      let planResolutionNote: string | undefined;
      let resolvedPlanId: string | undefined;

      if (input.treatmentPlanName?.trim()) {
        const planName = input.treatmentPlanName.trim();
        planResolution = await resolveEligiblePlan(patient.id, planName);

        if (planResolution.kind === "resolved") {
          resolvedPlanId = planResolution.planId;
        } else if (planResolution.kind === "ambiguous") {
          planResolutionNote = `se mencionaron ${planResolution.matches.length} planes con ese nombre y no es posible elegir uno sin tu ayuda`;
        } else if (planResolution.kind === "not_eligible") {
          planResolutionNote = `el plan existe pero está en estado ${planResolution.status}, no se puede ligar todavía`;
        } else {
          planResolutionNote = "no se encontró un plan con ese nombre vinculado al paciente";
        }
      }

      const intent = await createPaymentIntent({
        patientId: patient.id,
        treatmentPlanId: resolvedPlanId ?? null,
        amount: input.amount ?? null,
        commitmentText: input.commitment ?? null,
        method: input.method ?? null,
        notes: [input.notes, planResolutionNote].filter(Boolean).join(" | ") || null,
        source: "whatsapp",
      });

      const summary = buildIntentSummary({
        patientName: patient.full_name,
        amount: input.amount,
        planName: input.treatmentPlanName,
        resolvedPlanId,
        planResolutionNote,
        commitment: input.commitment,
        method: input.method,
      });

      const escalation = await createEveWhatsAppEscalation({
        patientPhone: patientPhone.phone,
        reason: "payment_intent",
        summary,
        intent: "support",
      });

      return {
        success: true,
        intent: {
          id: intent.id,
          status: intent.status,
        },
        escalation: {
          id: escalation.escalationId,
          created: escalation.created,
        },
        humanAlert: {
          configured: escalation.humanAlertPhoneConfigured,
          sent: Boolean(escalation.humanAlertSend?.ok),
          skipped: escalation.humanAlertSend?.skipped ?? !escalation.humanAlertPhoneConfigured,
        },
        message: buildSuccessMessage({
          patientName: patient.full_name,
          amount: input.amount,
          planName: input.treatmentPlanName,
        }),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo registrar la intención de pago.",
      };
    }
  },
});