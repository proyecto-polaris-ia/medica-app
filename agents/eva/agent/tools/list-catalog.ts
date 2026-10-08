import { defineTool } from "eve/tools";
import { z } from "zod";

import { listProviders, listServices } from "@/lib/booking/catalog";

function formatDuration(minutes: number): string {
  return `${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
}

export default defineTool({
  description:
    "Lista los servicios dentales y doctores disponibles del catálogo del consultorio. Solo lectura.",
  inputSchema: z.object({}).describe("No requiere parámetros."),
  async execute() {
    try {
      const [services, providers] = await Promise.all([listServices(), listProviders()]);

      return {
        success: true,
        services: services.map((service) => ({
          id: service.id,
          name: service.name,
          duration: formatDuration(service.durationMinutes),
        })),
        providers: providers.map((provider) => ({
          id: provider.id,
          name: provider.name,
        })),
      };
    } catch (error) {
      return {
        success: false,
        services: [],
        providers: [],
        error: error instanceof Error ? error.message : "No se pudo leer el catálogo.",
      };
    }
  },
});
