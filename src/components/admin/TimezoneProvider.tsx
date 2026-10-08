'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { CLINIC_TZ } from '@/lib/admin/timezone';

/**
 * Zona horaria del observador para los componentes cliente del panel admin.
 *
 * El layout (server) lee la preferencia una vez por request y la inyecta aquí;
 * fuera de un provider el default es la zona de la clínica, de modo que los
 * componentes son utilizables en pruebas y en superficies sin preferencia.
 */
const TimezoneContext = createContext<string>(CLINIC_TZ);

export function TimezoneProvider({
  timezone,
  children,
}: {
  timezone: string;
  children: ReactNode;
}) {
  return (
    <TimezoneContext.Provider value={timezone}>
      {children}
    </TimezoneContext.Provider>
  );
}

export function useViewerTimezone(): string {
  return useContext(TimezoneContext);
}
