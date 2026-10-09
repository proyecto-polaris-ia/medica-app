import { defineTool } from "eve/tools";
import { z } from "zod";

import {
  getDashboardMetrics,
  type DashboardMetricsView,
} from "@/lib/admin/metrics/loader";
import type { ProviderMetrics } from "@/lib/admin/metrics/types";

import { requireDoctor, type DoctorAccessContext } from "../access";

/**
 * Tool `get-provider-metrics` (issue #162, Fase 5).
 *
 * Proyecta un solo `ProviderMetrics` del `DashboardMetricsView`: resuelve al
 * proveedor por `providerId` o `providerName` (sin distinguir mayúsculas)
 * dentro del desglose que ya calculó el motor y devuelve únicamente sus
 * métricas. No hay segunda aritmética ni consulta adicional.
 *
 * Un proveedor que no aparece en el desglose del rango devuelve
 * `{ success: false, error }` nombrando el problema; nunca métricas vacías
 * ambiguas ni datos de otro proveedor. Nunca lanza.
 */

const RANGE_INPUT_ERROR =
  "Revisa el rango solicitado: usa 'preset' con week o month, o bien 'from' y 'to' juntos (formato YYYY-MM-DD); no combines preset con from/to.";

const PROVIDER_INPUT_ERROR =
  "Indica el proveedor del consultorio por identificador ('providerId') o por nombre ('providerName') para consultar sus métricas.";

const getProviderMetricsInputSchema = z
  .object({
    providerId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Identificador del proveedor en el consultorio."),
    providerName: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Nombre del proveedor tal como aparece registrado en el consultorio."),
    preset: z
      .enum(["week", "month"])
      .optional()
      .describe(
        "Periodo predefinido: 'week' (semana clínica actual) o 'month' (mes clínico actual). No lo combines con 'from'/'to'.",
      ),
    from: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        "Inicio del rango personalizado en formato YYYY-MM-DD (requiere 'to').",
      ),
    to: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        "Fin del rango personalizado en formato YYYY-MM-DD, inclusivo (requiere 'from').",
      ),
  })
  .refine((value) => Boolean(value.providerId || value.providerName), {
    message: PROVIDER_INPUT_ERROR,
  })
  .refine(
    (value) =>
      !(value.preset !== undefined && (value.from !== undefined || value.to !== undefined)),
    { message: RANGE_INPUT_ERROR },
  )
  .refine((value) => (value.from === undefined) === (value.to === undefined), {
    message: RANGE_INPUT_ERROR,
  });

type GetProviderMetricsInput = z.infer<typeof getProviderMetricsInputSchema>;

function loaderParams(input: GetProviderMetricsInput): {
  preset: string;
  from?: string;
  to?: string;
} {
  if (input.from && input.to) {
    return { preset: "custom", from: input.from, to: input.to };
  }
  return { preset: input.preset ?? "week" };
}

function buildRange(view: DashboardMetricsView) {
  return {
    preset: view.preset,
    label: view.rangeLabel,
    startAt: view.range.startAt,
    endAt: view.range.endAt,
  };
}

function describeEmptyState(view: DashboardMetricsView): string {
  if (!view.isSupabaseConfigured) {
    return "No puedo consultar métricas: la base de datos del consultorio no está configurada en este entorno.";
  }
  if (view.isConfiguredButUnavailable) {
    return "No pude consultar las métricas: la base de datos no respondió en este momento. Intenta de nuevo más tarde.";
  }
  return `No hay citas ni horarios registrados en el rango ${view.rangeLabel}. No hay métricas que reportar para ese periodo.`;
}

/** Referencia que el doctor escribió, priorizando el identificador. */
function providerReference(input: GetProviderMetricsInput): string {
  return input.providerId?.trim() || input.providerName?.trim() || "";
}

/**
 * Resuelve el proveedor en el desglose del motor: primero por id, luego por
 * nombre, siempre en minúsculas para que la comparación no dependa de
 * mayúsculas ni espacios.
 */
function findProvider(
  providers: ProviderMetrics[],
  input: GetProviderMetricsInput,
): ProviderMetrics | null {
  const id = input.providerId?.trim().toLowerCase();
  if (id) {
    const byId = providers.find(
      (provider) => provider.providerId.toLowerCase() === id,
    );
    if (byId) return byId;
  }

  const name = input.providerName?.trim().toLowerCase();
  if (name) {
    const byName = providers.find(
      (provider) => provider.providerName.toLowerCase() === name,
    );
    if (byName) return byName;
  }

  return null;
}

function formatRate(value: number | null): string {
  return value === null ? "sin denominador" : `${value}%`;
}

export default defineTool({
  description:
    "Devuelve las métricas de un solo proveedor del consultorio para el rango solicitado (preset week/month o from/to): ocupación, tasa y conteo de no-shows, citas atendidas y totales. El proveedor se identifica por 'providerId' o 'providerName'. Solo lectura y exclusiva para doctores autorizados.",
  inputSchema: getProviderMetricsInputSchema,
  async execute(input: GetProviderMetricsInput, ctx: DoctorAccessContext) {
    const access = requireDoctor(ctx);
    if ("error" in access) {
      return { success: false, error: access.error };
    }

    const parsed = getProviderMetricsInputSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message;
      return {
        success: false,
        error: issue === PROVIDER_INPUT_ERROR ? PROVIDER_INPUT_ERROR : RANGE_INPUT_ERROR,
      };
    }

    try {
      const view = await getDashboardMetrics(loaderParams(parsed.data));
      const range = buildRange(view);

      if (!view.metrics) {
        return {
          success: true,
          dataAvailable: false,
          emptyState: true,
          range,
          message: describeEmptyState(view),
        };
      }

      const provider = findProvider(view.metrics.providers, parsed.data);
      if (!provider) {
        return {
          success: false,
          error: `No encontré datos del proveedor "${providerReference(parsed.data)}" en el rango ${view.rangeLabel}. Verifica el identificador o el nombre, o prueba con otro rango.`,
        };
      }

      return {
        success: true,
        dataAvailable: true,
        emptyState: false,
        range,
        providerId: provider.providerId,
        providerName: provider.providerName,
        occupancyPct: provider.occupancyPct,
        occupiedMinutes: provider.occupiedMinutes,
        capacityMinutes: provider.capacityMinutes,
        noShowRatePct: provider.noShowRatePct,
        noShowCount: provider.noShowCount,
        attendedCount: provider.attendedCount,
        cancelledCount: provider.cancelledCount,
        totalAppointments: provider.totalAppointments,
        statusCounts: provider.statusCounts,
        message: `Métricas de ${provider.providerName} en el rango ${view.rangeLabel}: ocupación ${provider.occupancyPct}%, no-show ${formatRate(provider.noShowRatePct)} (${provider.noShowCount} citas), ${provider.attendedCount} atendidas de ${provider.totalAppointments} citas.`,
      };
    } catch {
      return {
        success: false,
        error:
          "No se pudieron consultar las métricas del proveedor en este momento. Intenta de nuevo más tarde.",
      };
    }
  },
});
