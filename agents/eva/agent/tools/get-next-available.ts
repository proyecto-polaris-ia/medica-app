import { defineTool } from "eve/tools";
import { z } from "zod";

import { resolveProviderByName, resolveServiceByName } from "@/lib/booking/catalog";
import { findNextAvailable } from "@/lib/booking/next-available";

const CLINIC_TIMEZONE = "America/Mexico_City";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const nextAvailableInputSchema = z.object({
  serviceName: z.string().min(1).describe("Nombre del servicio"),
  providerName: z.string().min(1).describe("Nombre del doctor"),
  afterDate: z.string().describe("Fecha desde la cual buscar en formato YYYY-MM-DD"),
});

type NextAvailableInput = z.infer<typeof nextAvailableInputSchema>;

function parseLocalSearchDate(date: string): Date | null {
  if (!DATE_PATTERN.test(date)) return null;
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;

  const [year, month, day] = date.split("-").map(Number);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function formatSlot(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: CLINIC_TIMEZONE,
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default defineTool({
  description:
    "Busca el siguiente horario disponible para un servicio y doctor. Solo consulta disponibilidad; no agenda por sí misma.",
  inputSchema: nextAvailableInputSchema,
  async execute({ serviceName, providerName, afterDate }: NextAvailableInput) {
    const after = parseLocalSearchDate(afterDate);
    if (!after) {
      return {
        success: false,
        available: false,
        error: "Fecha inválida. Usa el formato YYYY-MM-DD.",
      };
    }

    try {
      const service = await resolveServiceByName(serviceName);
      if (!service) {
        return {
          success: false,
          available: false,
          error: `Servicio no encontrado: ${serviceName}`,
        };
      }

      const provider = await resolveProviderByName(providerName);
      if (!provider) {
        return {
          success: false,
          available: false,
          service: service.name,
          error: `Doctor no encontrado: ${providerName}`,
        };
      }

      const slot = await findNextAvailable({
        providerId: provider.id,
        serviceId: service.id,
        after,
        timezone: CLINIC_TIMEZONE,
      });

      if (!slot) {
        return {
          success: true,
          available: false,
          service: service.name,
          provider: provider.name,
          message:
            "No encontré disponibilidad en los próximos días. No inventes horarios; pide otra fecha o escala a humano.",
        };
      }

      return {
        success: true,
        available: true,
        slot: {
          start: slot.start_at.toISOString(),
          end: slot.end_at.toISOString(),
          formatted: formatSlot(slot.start_at),
        },
        service: service.name,
        provider: provider.name,
      };
    } catch (error) {
      return {
        success: false,
        available: false,
        error: error instanceof Error ? error.message : "No se pudo buscar la siguiente disponibilidad.",
      };
    }
  },
});
