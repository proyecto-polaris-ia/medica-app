import type { AppointmentStatus } from './types';

// Etiquetas en español de México para el estado de una cita. Única fuente de
// verdad compartida por la vista de Lista y el calendario (modal del día).
export function statusLabel(status: AppointmentStatus): string {
  switch (status) {
    case 'confirmed':
      return 'Confirmada';
    case 'requested':
    case 'pending':
      return 'Sin confirmar';
    case 'cancelled':
      return 'Cancelada';
    case 'rescheduled':
      return 'Reagendada';
    case 'no_show':
      return 'No asistió';
    case 'attended':
      return 'Atendida';
    default:
      return status;
  }
}
