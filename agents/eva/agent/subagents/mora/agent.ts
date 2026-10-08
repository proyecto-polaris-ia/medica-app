import { defineAgent } from "eve";

import { createDynamicModel } from "../../model";

/**
 * Mora — agente de cobranza del consultorio dental.
 *
 * Se declara como subagente de Eva (agente raíz ligado a WhatsApp). Eva decide
 * cuándo delegar leyendo esta `description`; Mora nunca se liga al canal ni
 * envía mensajes por su cuenta, solo responde a la delegación.
 */
export default defineAgent({
  description:
    "Mora atiende el tema de cobranza del consultorio: saldos pendientes, planes vencidos, registro de intención de pago y escalación a un humano. Delega aquí cuando el paciente pregunte cuánto debe o pida un resumen de su saldo, pregunte por planes vencidos, exprese intención de pagar, pida un descuento o waiver, dispute un saldo, reporte un problema con un pago o pida un precio nuevo. No agenda, reprograma ni consulta disponibilidad de citas; eso es de Eva.",
  model: createDynamicModel(),
  limits: { sessionTimeoutMs: 1800000 },
});
