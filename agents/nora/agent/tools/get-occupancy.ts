import { defineTool } from "eve/tools";
import { z } from "zod";

import {
  getDashboardMetrics,
  type DashboardMetricsView,
} from "@/lib/admin/metrics/loader";
import type { MetricsResult } from "@/lib/admin/metrics/types";

import { requireDoctor, type DoctorAccessContext } from "../access";

/**
 * Tool `get-occupancy` (issue #162, Fase 5).
 *
 * Proyecta la ocupación del `DashboardMetricsView`: total y por proveedor,
 * exactamente como la produce el motor de métricas (Σ ocupados / Σ capacidad).
 * La tool no recalcula porcentajes ni decide disponibilidad: solo lee el
 * agregado y lo redacta en español.
 *
 * Nunca lanza: cualquier fallo devuelve `{ success: false, error }`.
 */

const RANGE_INPUT_ERROR =
  "Revisa el rango solicitado: usa 'preset' con week o month, o bien 'from' y 'to' juntos (formato YYYY-MM-DD); no combines preset con from/to.";

const getOccupancyInputSchema = z
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

type GetOccupancyInput = z.infer<typeof getOccupancyInputSchema>;

function loaderParams(input: GetOccupancyInput): {
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
  return `No hay citas ni horarios registrados en el rango ${view.rangeLabel}. No hay ocupación que reportar para ese periodo.`;
}

function buildOccupancyMessage(view: DashboardMetricsView, metrics: MetricsResult): string {
  return `Ocupación del rango ${view.rangeLabel}: ${metrics.occupancyPct}% en total (${metrics.occupiedMinutes} de ${metrics.capacityMinutes} minutos ocupados).`;
}

export default defineTool({
  description:
    "Devuelve la ocupación del rango solicitado (preset week/month o from/to) por proveedor y en total, tal como la calcula el motor de métricas. Solo lectura y exclusiva para doctores autorizados.",
  inputSchema: getOccupancyInputSchema,
  async execute(input: GetOccupancyInput, ctx: DoctorAccessContext) {
    const access = requireDoctor(ctx);
    if ("error" in access) {
      return { success: false, error: access.error };
    }

    const parsed = getOccupancyInputSchema.safeParse(input);
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
        occupancyPct: metrics.occupancyPct,
        occupiedMinutes: metrics.occupiedMinutes,
        capacityMinutes: metrics.capacityMinutes,
        providers: metrics.providers.map((provider) => ({
          providerId: provider.providerId,
          providerName: provider.providerName,
          occupancyPct: provider.occupancyPct,
          occupiedMinutes: provider.occupiedMinutes,
          capacityMinutes: provider.capacityMinutes,
        })),
        message: buildOccupancyMessage(view, metrics),
      };
    } catch {
      return {
        success: false,
        error:
          "No se pudo consultar la ocupación del consultorio en este momento. Intenta de nuevo más tarde.",
      };
    }
  },
});
