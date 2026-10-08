import { defineAgent } from "eve";

import { createDynamicModel } from "./model";

/**
 * Mora — agente independiente de cobranza del consultorio dental.
 *
 * Agente raíz con canal Discord propio (`channels/discord.ts`): los doctores
 * hablan directo con Mora para consultar saldos, planes vencidos y registrar
 * intención de pago. No atiende WhatsApp ni agenda citas; eso es de Eva.
 */
export default defineAgent({
  model: createDynamicModel(),
  limits: { sessionTimeoutMs: 1800000 },
});
