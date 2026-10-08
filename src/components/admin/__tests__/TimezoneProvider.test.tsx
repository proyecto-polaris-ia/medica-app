import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CLINIC_TZ } from '@/lib/admin/timezone';
import { TimezoneProvider, useViewerTimezone } from '../TimezoneProvider';

/**
 * Sonda que expone la zona horaria del observador resuelta por el contexto.
 * Se usa para verificar el valor provisto y el default fuera de provider.
 */
function TimezoneProbe() {
  return <span data-testid="viewer-tz">{useViewerTimezone()}</span>;
}

describe('useViewerTimezone', () => {
  it('devuelve la zona provista por TimezoneProvider', () => {
    render(
      <TimezoneProvider timezone="America/New_York">
        <TimezoneProbe />
      </TimezoneProvider>
    );

    expect(screen.getByTestId('viewer-tz')).toHaveTextContent(
      'America/New_York'
    );
  });

  it('devuelve CLINIC_TZ cuando no hay provider', () => {
    render(<TimezoneProbe />);

    expect(screen.getByTestId('viewer-tz')).toHaveTextContent(CLINIC_TZ);
  });
});
