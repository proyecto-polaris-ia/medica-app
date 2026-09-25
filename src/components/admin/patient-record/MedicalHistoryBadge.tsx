import type { MedicalHistory } from '@/lib/admin/types';

type MedicalHistoryBadgeProps = {
  history: MedicalHistory;
};

export function MedicalHistoryBadge({ history }: MedicalHistoryBadgeProps) {
  const hasAllergies = history.allergies.length > 0;
  const hasConditions = history.systemicConditions.length > 0;

  if (!hasAllergies && !hasConditions) {
    return null;
  }

  let detail: string;
  if (hasAllergies && hasConditions) {
    detail = 'Alergias y condiciones registradas';
  } else if (hasAllergies) {
    detail = 'Alergias registradas';
  } else {
    detail = 'Condiciones registradas';
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800"
      role="status"
      aria-label={`Advertencia clínica: ${detail}`}
    >
      <span>Advertencia</span>
      <span aria-hidden="true">—</span>
      <span>{detail}</span>
    </span>
  );
}
