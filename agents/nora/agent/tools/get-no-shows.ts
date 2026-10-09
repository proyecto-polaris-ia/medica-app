import { defineTool } from "eve/tools";
import { z } from "zod";

import {
  getDashboardMetrics,
  type DashboardMetricsView,
} from "@/lib/admin/metrics/loader";
import type { MetricsResult } from "@/lib/admin/metrics/types";

import { requireDoctor, type DoctorAccessContext } from "../access";

/**
 * Tool `get-no-shows` (issue #162, Fase 5).
 *
 * Proyecta la tasa y el conteo de no-shows del `DashboardMetricsView`: total y
 * por proveedor, tal como los calcula el motor. Conserva `null` cuando el
 * motor no tiene denominador (no hay citas elegibles), en lugar de convertirlo
 * en 0%.
 *
 * Nunca lanza: cualquier fallo devuelve `{ success: false, error }`.
 */

const RANGE_INPUT_ERROR =
  "Revisa el rango solicitado: usa 'preset' con week o month, o bien 'from' y 'to' juntos (formato YYYY-MM-DD); no combines preset con from/to.";

const getNoShowsInputSchema = z
  .object({
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
  .refine(
    (value) =>
      !(value.preset !== undefined && (value.from !== undefined || value.to !== undefined)),
    { message: RANGE_INPUT_ERROR },
  )
  .refine((value) => (value.from === undefined) === (value.to === undefined), {
    message: RANGE_INPUT_ERROR,
  });

type GetNoShowsInput = z.infer<typeof getNoShowsInputSchema>;

function loaderParams(input: GetNoShowsInput): {
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
  return `No hay citas ni horarios registrados en el rango ${view.rangeLabel}. No hay no-shows que reportar para ese periodo.`;
}

function formatRate(value: number | null): string {
  return value === null ? "sin denominador" : `${value}%`;
}

function buildNoShowsMessage(view: DashboardMetricsView, metrics: MetricsResult): string {
  return `No-shows del período ${view.rangeLabel}: ${formatRate(metrics.noShowRatePct)} (${metrics.noShowCount} citas marcadas como no-show) sobre ${metrics.totalAppointments} citas.`;
}

export default defineTool({
  description:
    "Devuelve la tasa y el conteo de no-shows del rango solicitado (preset week/month o from/to), por proveedor y en total, tal como los calcula el motor de métricas. Solo lectura y exclusiva para doctores autorizados.",
  inputSchema: getNoShowsInputSchema,
  async execute(input: GetNoShowsInput, ctx: DoctorAccessContext) {
    const access = requireDoctor(ctx);
    if ("error" in access) {
      return { success: false, error: access.error };
    }

    const parsed = getNoShowsInputSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: RANGE_INPUT_ERROR };
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

      const metrics = view.metrics;
      return {
        success: true,
        dataAvailable: true,
        emptyState: false,
        range,
        noShowRatePct: metrics.noShowRatePct,
        noShowCount: metrics.noShowCount,
        totalAppointments: metrics.totalAppointments,
        providers: metrics.providers.map((provider) => ({
          providerId: provider.providerId,
          providerName: provider.providerName,
          noShowRatePct: provider.noShowRatePct,
          noShowCount: provider.noShowCount,
        })),
        message: buildNoShowsMessage(view, metrics),
      };
    } catch {
      return {
        success: false,
        error:
          "No se pudieron consultar los no-shows del consultorio en este momento. Intenta de nuevo más tarde.",
      };
    }
  },
});
