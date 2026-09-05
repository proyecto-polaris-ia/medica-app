/**
 * Flow Definition: Book Appointment
 * 
 * Flujo determinístico para agendar citas.
 * Estados: date → service → provider → availability → slot → confirm → notes → complete
 */

import type { FlowDefinition } from '../types';

export const bookAppointmentFlow: FlowDefinition = {
  name: 'book_appointment',
  initialState: 'collect_date',
  states: {
    collect_date: {
      required: ['localDate'],
      prompt: '¿Para qué día te gustaría agendar la cita?',
      transitions: {
        has_date: 'collect_service',
      },
    },

    collect_service: {
      required: ['serviceId'],
      prompt: '¿Qué servicio necesitas? Tenemos: {services}',
      transitions: {
        has_service: 'collect_provider',
      },
    },

    collect_provider: {
      required: ['providerId'],
      prompt: '¿Con qué doctor te gustaría agendar? Disponibles: {providers}',
      transitions: {
        has_provider: 'check_availability',
      },
    },

    check_availability: {
      action: 'getFreeSlots',
      prompt: 'Tengo estos horarios disponibles para el {date}:\n{slots}\n\nResponde con el número de la opción que prefieras.',
      transitions: {
        has_slots: 'select_slot',
        no_slots: 'suggest_alternative',
      },
    },

    select_slot: {
      required: ['startAt', 'endAt'],
      prompt: 'Perfecto, ¿confirmas que quieres agendar el horario {slotTime}?',
      transitions: {
        confirmed: 'confirm_booking',
      },
    },

    confirm_booking: {
      action: 'bookAppointment',
      prompt: 'Tu cita quedó agendada para el {datetime} con {provider}.\n\n¿Deseas agregar alguna nota u observación adicional? (opcional)',
      transitions: {
        has_notes: 'collect_notes',
        skip_notes: 'complete',
      },
    },

    collect_notes: {
      optional: ['notes'],
      prompt: '¿Alguna observación adicional para el doctor? (puedes escribir "no" para omitir)',
      transitions: {
        done: 'complete',
      },
    },

    suggest_alternative: {
      prompt: 'No encontré horarios disponibles para el {date}. ¿Te gustaría consultar disponibilidad para otro día?',
      transitions: {
        try_another_date: 'collect_date',
        escalate: 'complete',
      },
    },

    complete: {
      terminal: true,
      prompt: '¡Listo! Tu cita está confirmada. Gracias por contactarnos.',
    },
  },
};

/**
 * Registry de todos los flujos disponibles
 */
export const flowRegistry: Record<string, FlowDefinition> = {
  book_appointment: bookAppointmentFlow,
};

/**
 * Obtiene un flujo por nombre
 */
export function getFlowDefinition(flowName: string): FlowDefinition {
  const flow = flowRegistry[flowName];
  if (!flow) {
    throw new Error(`Flow no encontrado: ${flowName}`);
  }
  return flow;
}
