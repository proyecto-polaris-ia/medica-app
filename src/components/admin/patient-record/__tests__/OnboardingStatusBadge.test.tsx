import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OnboardingStatusBadge } from '../OnboardingStatusBadge';

describe('OnboardingStatusBadge', () => {
  it('renderiza una pill ámbar "Onboarding pendiente" con role="status" cuando no hay historia', () => {
    render(<OnboardingStatusBadge hasMedicalHistory={false} source={null} />);

    const badge = screen.getByRole('status');
    expect(badge).toHaveTextContent('Onboarding pendiente');
    expect(badge).toHaveClass('bg-amber-100');
    expect(badge).toHaveClass('text-amber-800');
  });

  it('renderiza una pill verde "Onboarding completo" cuando existe historia', () => {
    render(<OnboardingStatusBadge hasMedicalHistory source="patient_autoreport" />);

    const badge = screen.getByRole('status');
    expect(badge).toHaveTextContent('Onboarding completo');
    expect(badge).toHaveClass('bg-green-100');
    expect(badge).toHaveClass('text-green-800');
  });

  it('incluye la procedencia de autoreporte en el aria-label', () => {
    render(<OnboardingStatusBadge hasMedicalHistory source="patient_autoreport" />);

    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Historia de autoreporte del paciente')
    );
  });

  it('no menciona autoreporte cuando la historia la capturó staff', () => {
    render(<OnboardingStatusBadge hasMedicalHistory source="staff" />);

    expect(screen.getByRole('status')).not.toHaveAttribute(
      'aria-label',
      expect.stringContaining('Historia de autoreporte del paciente')
    );
  });

  it('no tiene estado propio ni fetch: renderiza sólo desde props', () => {
    const { rerender } = render(<OnboardingStatusBadge hasMedicalHistory={false} source={null} />);
    expect(screen.getByText('Onboarding pendiente')).toBeInTheDocument();

    rerender(<OnboardingStatusBadge hasMedicalHistory source="staff" />);
    expect(screen.getByText('Onboarding completo')).toBeInTheDocument();
    expect(screen.queryByText('Onboarding pendiente')).not.toBeInTheDocument();
  });
});
