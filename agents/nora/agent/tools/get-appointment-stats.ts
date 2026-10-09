import { defineTool } from "eve/tools";
import { z } from "zod";

import {
  getDashboardMetrics,
  type DashboardMetricsView,
} from "@/lib/admin/metrics/loader";
import type { MetricsResult } from "@/lib/admin/metrics/types";

import { requireDoctor, type DoctorAccessContext } from "../access";

/**
 * Tool `get-appointment-stats` (issue #162, Fase 5).
 *
 * Proyecta los `StatusCounts` del `DashboardMetricsView` para el rango
 * solicitado. Los conteos salen íntegros del motor; la suma de todos ellos
 * iguala `totalAppointments` porque ambos derivan del mismo conjunto de citas
 * que solapan el rango.
 *
 * Nunca lanza: cualquier fallo devuelve `{ success: false, error }`.
 */

const RANGE_INPUT_ERROR =
  "Revisa el rango solicitado: usa 'preset' con week o month, o bien 'from' y 'to' juntos (formato YYYY-MM-DD); no combines preset con from/to.";

const getAppointmentStatsInputSchema = z
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

type GetAppointmentStatsInput = z.infer<typeof getAppointmentStatsInputSchema>;

function loaderParams(input: GetAppointmentStatsInput): {
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
  return `No hay citas ni horarios registrados en el rango ${view.rangeLabel}. No hay estadísticas de citas que reportar para ese periodo.`;
}

function buildAppointmentStatsMessage(
  view: DashboardMetricsView,
  metrics: MetricsResult,
): string {
  return `Citas del rango ${view.rangeLabel}: ${metrics.totalAppointments} en total, desglosadas por status (${metrics.attendedCount} atendidas, ${metrics.cancelledCount} canceladas, ${metrics.noShowCount} no-show).`;
}

export default defineTool({
  description:
    "Devuelve el conteo de citas por status del rango solicitado (preset week/month o from/to): requested, confirmed, pending, cancelled, rescheduled, no_show y attended. La suma de los conteos iguala el total de citas del rango. Solo lectura y exclusiva para doctores autorizados.",
  inputSchema: getAppointmentStatsInputSchema,
  async execute(input: GetAppointmentStatsInput, ctx: DoctorAccessContext) {
    const access = requireDoctor(ctx);
    if ("error" in access) {
      return { success: false, error: access.error };
    }

    const parsed = getAppointmentStatsInputSchema.safeParse(input);
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
        totalAppointments: metrics.totalAppointments,
        statusCounts: metrics.statusCounts,
        providers: metrics.providers.map((provider) => ({
          providerId: provider.providerId,
          providerName: provider.providerName,
          totalAppointments: provider.totalAppointments,
          statusCounts: provider.statusCounts,
        })),
        message: buildAppointmentStatsMessage(view, metrics),
      };
    } catch {
      return {
        success: false,
        error:
          "No se pudieron consultar las estadísticas de citas en este momento. Intenta de nuevo más tarde.",
      };
    }
  },
});
