import { defineAgent } from "eve";

import { createDynamicModel } from "./model";

/**
 * Clara — agente raíz del seguimiento de pacientes del consultorio dental.
 *
 * Canal Discord propio (`channels/discord.ts`) para staff administrativo y
 * doctores autorizados: revisan la lista diaria, redactan y aprueban borradores
 * y marcan el contacto con el paciente. No atiende WhatsApp, no atiende
 * pacientes y no envía mensajes.
 */
export default defineAgent({
  model: createDynamicModel(),
  limits: { sessionTimeoutMs: 1800000 },
});
