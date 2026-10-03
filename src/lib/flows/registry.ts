/**
 * Flow Registry
 *
 * Punto de composición de los flujos disponibles (design.md D3). Registra el
 * flujo de reserva y el de onboarding, y los expone por nombre.
 */

import { bookAppointmentFlow } from './definitions/book-appointment.flow';
import { onboardingFlow } from './definitions/onboarding.flow';
import type { FlowDefinition } from './types';

export const flowRegistry: Record<string, FlowDefinition> = {
  book_appointment: bookAppointmentFlow,
  onboarding: onboardingFlow,
};

export function getFlowDefinition(flowName: string): FlowDefinition {
  const flow = flowRegistry[flowName];
  if (!flow) {
    throw new Error(`Flow no encontrado: ${flowName}`);
  }
  return flow;
}
