import { deriveOnboardingStatus } from '@/lib/admin/onboarding-status';
import type { MedicalHistorySource } from '@/lib/admin/types';

type OnboardingStatusBadgeProps = {
  hasMedicalHistory: boolean;
  source: MedicalHistorySource | null;
};

const STATUS_STYLES: Record<'pendiente' | 'completo', string> = {
  pendiente: 'bg-amber-100 text-amber-800',
  completo: 'bg-green-100 text-green-800',
};

const STATUS_LABELS: Record<'pendiente' | 'completo', string> = {
  pendiente: 'Onboarding pendiente',
  completo: 'Onboarding completo',
};

/**
 * Badge de estado de onboarding en el expediente (design.md D10, ST-R3).
 *
 * Superficie aditiva: no altera el badge de advertencia clínica
 * (`MedicalHistoryBadge`) ni el resto del expediente. Sin estado ni fetch: el
 * estado se deriva de props con `deriveOnboardingStatus`.
 */
export function OnboardingStatusBadge({ hasMedicalHistory, source }: OnboardingStatusBadgeProps) {
  const status = deriveOnboardingStatus({ historyExists: hasMedicalHistory, source });
  const label = STATUS_LABELS[status];
  const ariaLabel =
    source === 'patient_autoreport'
      ? `${label} — Historia de autoreporte del paciente`
      : label;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
      role="status"
      aria-label={ariaLabel}
    >
      {label}
    </span>
  );
}
