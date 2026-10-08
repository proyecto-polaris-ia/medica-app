import { defineTool } from "eve/tools";
import { z } from "zod";

import { getFreeSlots } from "@/lib/booking/availability";
import { resolveProviderByName, resolveServiceByName } from "@/lib/booking/catalog";

const CLINIC_TIMEZONE = "America/Mexico_City";
const MAX_RETURNED_SLOTS = 5;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseLocalDate(date: string): Date | null {
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

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: CLINIC_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default defineTool({
  description:
    "Consulta horarios disponibles para una cita dental por servicio, doctor y fecha. Solo lectura.",
  inputSchema: z.object({
    serviceName: z.string().min(1).describe("Nombre del servicio (ej: 'Limpieza dental')"),
    providerName: z.string().min(1).describe("Nombre del doctor (ej: 'Dra. Ana Martínez')"),
    date: z.string().describe("Fecha en formato YYYY-MM-DD"),
  }),
  async execute({ serviceName, providerName, date }: { serviceName: string; providerName: string; date: string }) {
    const localDate = parseLocalDate(date);
    if (!localDate) {
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

      const slots = await getFreeSlots({
        providerId: provider.id,
        serviceId: service.id,
        localDate,
        timezone: CLINIC_TIMEZONE,
      });

      if (slots.length === 0) {
        return {
          success: true,
          available: false,
          slots: [],
          service: service.name,
          provider: provider.name,
          date,
          message: "No hay horarios disponibles para esa fecha. Sugiere otra fecha al paciente.",
        };
      }

      return {
        success: true,
        available: true,
        slots: slots.slice(0, MAX_RETURNED_SLOTS).map((slot) => ({
          start: formatTime(slot.start_at),
          end: formatTime(slot.end_at),
        })),
        service: service.name,
        provider: provider.name,
        date,
      };
    } catch (error) {
      return {
        success: false,
        available: false,
        error: error instanceof Error ? error.message : "No se pudo consultar disponibilidad.",
      };
    }
  },
});
