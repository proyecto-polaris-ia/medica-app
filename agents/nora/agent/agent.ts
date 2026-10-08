import { defineAgent } from "eve";

import { createDynamicModel } from "./model";

/**
 * Nora — agente raíz de métricas del consultorio dental.
 *
 * Agente raíz con canal Discord propio (`channels/discord.ts`): los doctores
 * autorizados hablan directo con Nora para consultar ocupación, no-shows y
 * estadísticas de citas. Su superficie es de SOLO LECTURA: no reprograma ni
 * cancela citas, no escribe en la base de datos y no envía WhatsApps; eso es
 * de Eva y del panel administrativo.
 */
export default defineAgent({
  model: createDynamicModel(),
  limits: { sessionTimeoutMs: 1800000 },
});
