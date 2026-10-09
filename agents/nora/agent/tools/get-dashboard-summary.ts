import { defineTool } from "eve/tools";
import { z } from "zod";

import {
  getDashboardMetrics,
  type DashboardMetricsView,
} from "@/lib/admin/metrics/loader";
import { computeTrendDelta } from "@/lib/admin/metrics/trend";
import type { MetricsResult } from "@/lib/admin/metrics/types";

import { requireDoctor, type DoctorAccessContext } from "../access";

/**
 * Tool `get-dashboard-summary` (issue #162, Fase 5).
 *
 * Es una proyección del `DashboardMetricsView` que produce
 * `getDashboardMetrics` (`src/lib/admin/metrics/loader.ts`): resuelve el rango
 * (`preset` o `from`/`to`), autoriza al doctor y devuelve el resumen completo
 * del consultorio sin recalcular nada. La aritmética es del motor de métricas;
 * aquí solo se proyecta y se redacta en español.
 *
 * La comparación contra el periodo anterior sale de `view.trend`, que el motor
 * resuelve en la misma lectura; cuando el rango no trae tendencia el campo es
 * `null` y la respuesta lo dice en vez de inventar un comparativo.
 *
 * Nunca lanza: cualquier fallo devuelve `{ success: false, error }`.
 */

const RANGE_INPUT_ERROR =
  "Revisa el rango solicitado: usa 'preset' con week o month, o bien 'from' y 'to' juntos (formato YYYY-MM-DD); no combines preset con from/to.";

const getDashboardSummaryInputSchema = z
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

type GetDashboardSummaryInput = z.infer<typeof getDashboardSummaryInputSchema>;

function loaderParams(input: GetDashboardSummaryInput): {
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

function formatRate(value: number | null): string {
  return value === null ? "sin denominador" : `${value}%`;
}

function buildTrend(view: DashboardMetricsView, current: MetricsResult) {
  if (!view.trend) return null;
  const delta = computeTrendDelta(current, view.trend.previous);
  return {
    previousRange: {
      startAt: view.trend.previousRange.start.toISOString(),
      endAt: view.trend.previousRange.end.toISOString(),
    },
    hasComparison: view.trend.previous !== null,
    previousOccupancyPct: view.trend.previous?.occupancyPct ?? null,
    previousNoShowRatePct: view.trend.previous?.noShowRatePct ?? null,
    occupancyDeltaPct: delta.occupancyPct,
    noShowRateDeltaPct: delta.noShowRatePct,
  };
}

function buildSummaryMessage(view: DashboardMetricsView, metrics: MetricsResult): string {
  return `Resumen del rango ${view.rangeLabel}: ocupación ${metrics.occupancyPct}%, no-show ${formatRate(metrics.noShowRatePct)} (${metrics.noShowCount} citas), ${metrics.totalAppointments} citas en total y ${metrics.attendedCount} atendidas.`;
}

export default defineTool({
  description:
    "Devuelve el resumen general del consultorio para el rango solicitado (preset week/month o from/to): ocupación total, tasa y conteo de no-shows, conteos por status y desglose por proveedor, con comparación contra el periodo anterior cuando el motor la tiene. Solo lectura y exclusiva para doctores autorizados.",
  inputSchema: getDashboardSummaryInputSchema,
  async execute(input: GetDashboardSummaryInput, ctx: DoctorAccessContext) {
    const access = requireDoctor(ctx);
    if ("error" in access) {
      return { success: false, error: access.error };
    }

    const parsed = getDashboardSummaryInputSchema.safeParse(input);
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
        generatedAt: view.generatedAt,
        occupancyPct: metrics.occupancyPct,
        occupiedMinutes: metrics.occupiedMinutes,
        capacityMinutes: metrics.capacityMinutes,
        noShowRatePct: metrics.noShowRatePct,
        noShowCount: metrics.noShowCount,
        attendedCount: metrics.attendedCount,
        cancelledCount: metrics.cancelledCount,
        totalAppointments: metrics.totalAppointments,
        statusCounts: metrics.statusCounts,
        providers: metrics.providers.map((provider) => ({
          providerId: provider.providerId,
          providerName: provider.providerName,
          occupancyPct: provider.occupancyPct,
          noShowRatePct: provider.noShowRatePct,
          noShowCount: provider.noShowCount,
          attendedCount: provider.attendedCount,
          totalAppointments: provider.totalAppointments,
          cancelledCount: provider.cancelledCount,
        })),
        trend: buildTrend(view, metrics),
        message: buildSummaryMessage(view, metrics),
      };
    } catch {
      return {
        success: false,
        error:
          "No se pudieron consultar las métricas del consultorio en este momento. Intenta de nuevo más tarde.",
      };
    }
  },
});
