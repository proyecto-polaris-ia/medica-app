import type { MedicalHistorySource } from './types';

/**
 * Estado de onboarding derivado (design.md D10, requirement ST-R1).
 *
 * Es un estado **derivado**, no un campo persistido: `pendiente` cuando el
 * paciente no tiene fila en `patient_medical_history`; `completo` cuando la
 * fila existe (incluida una capturada por staff, que es historia ya validada
 * por el consultorio y por tanto no debe recibir nudge).
 *
 * La `source` se conserva como dato de procedencia para accesibilidad/mostrado,
 * pero no participa en el resultado binario.
 */
export type OnboardingStatus = 'pendiente' | 'completo';

export function deriveOnboardingStatus(input: {
  historyExists: boolean;
  source: MedicalHistorySource | null;
}): OnboardingStatus {
  return input.historyExists ? 'completo' : 'pendiente';
}
