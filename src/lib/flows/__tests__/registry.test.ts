import { describe, it, expect } from 'vitest';
import { flowRegistry, getFlowDefinition } from '../registry';
import { bookAppointmentFlow } from '../definitions/book-appointment.flow';
import { onboardingFlow } from '../definitions/onboarding.flow';

describe('flow registry', () => {
  it('expone el flujo de reserva y el de onboarding', () => {
    expect(getFlowDefinition('book_appointment')).toBe(bookAppointmentFlow);
    expect(getFlowDefinition('onboarding')).toBe(onboardingFlow);
    expect(flowRegistry.book_appointment).toBe(bookAppointmentFlow);
    expect(flowRegistry.onboarding).toBe(onboardingFlow);
  });

  it('lanza un error que incluye el nombre cuando el flujo no existe', () => {
    expect(() => getFlowDefinition('flujo_desconocido')).toThrowError(
      /flujo_desconocido/
    );
  });
});
