import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClinicalVisit } from '@/lib/admin/types';
import { PatientVisitsTab } from '../patient-record/PatientVisitsTab';

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const MAX_LENGTH = 150;

const SUBJECTIVE = `Subjetivo: ${'dolor leve al masticar '.repeat(20)}`.slice(0, 400);
const OBJECTIVE = `Objetivo: ${'sin hallazgos relevantes '.repeat(25)}`.slice(0, 500);
const TRUNCATED_OBJECTIVE = `${OBJECTIVE.slice(0, MAX_LENGTH)}...`;

const VISIT: ClinicalVisit = {
  id: 'visit-1',
  patientId: PATIENT_ID,
  appointmentId: null,
  providerId: null,
  subjective: SUBJECTIVE,
  objective: OBJECTIVE,
  assessment: null,
  plan: 'Control en 6 meses.',
  treatment: null,
  notes: null,
  createdAt: '2026-09-01T10:00:00Z',
  updatedAt: '2026-09-01T10:00:00Z',
};

function renderTab(visits: ClinicalVisit[]) {
  return render(
    <PatientVisitsTab
      patientId={PATIENT_ID}
      visits={visits}
      loading={false}
      error={null}
      onVisitsChanged={vi.fn()}
    />
  );
}

describe('PatientVisitsTab — truncamiento de notas SOAP', () => {
  it('trunca el campo Objetivo largo y ofrece "Ver más" sin truncar el Subjetivo', async () => {
    const user = userEvent.setup();
    renderTab([VISIT]);

    // El campo objetivo largo se muestra truncado con su botón.
    expect(screen.getByText(TRUNCATED_OBJECTIVE)).toBeInTheDocument();
    expect(screen.queryByText(OBJECTIVE)).not.toBeInTheDocument();
    const objectiveButton = screen.getByRole('button', { name: 'Ver más' });
    expect(objectiveButton).toHaveAttribute('aria-expanded', 'false');

    // El título "Subjetivo" (h4) conserva el texto completo y no tiene botón.
    const heading = screen.getByRole('heading', { level: 4 });
    expect(heading).toHaveTextContent(SUBJECTIVE);
    expect(within(heading).queryByRole('button')).not.toBeInTheDocument();

    // La expansión muestra el objetivo completo.
    await user.click(objectiveButton);
    expect(screen.getByText(OBJECTIVE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver menos' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('los campos cortos o nulos no generan botón', () => {
    renderTab([VISIT]);

    // Plan (corto) y valoración/tratamiento/notas (null) no generan botones.
    expect(screen.getByText('Control en 6 meses.')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(3);
    // Solo el objetivo largo aporta un botón de expansión.
    expect(screen.getAllByRole('button', { name: 'Ver más' })).toHaveLength(1);
  });
});
