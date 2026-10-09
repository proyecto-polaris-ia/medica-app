'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Patient, PatientRecordAppointment } from '@/lib/admin/types';
import { useViewerTimezone } from '@/components/admin/TimezoneProvider';
import { ErrorState } from '@/components/admin/ErrorState';
import { Pagination } from '@/components/admin/Pagination';

/** Tamaño de página fijo del expediente (contrato de los endpoints). */
const PAGE_SIZE = 10;
/** Filas del skeleton de carga, con la misma estructura que la tabla real. */
const SKELETON_ROWS = 3;

type SectionVariant = 'upcoming' | 'attended';

const SECTION_CONFIG: Record<
  SectionVariant,
  {
    title: string;
    emptyMessage: string;
    errorMessage: string;
    paginationLabel: string;
  }
> = {
  upcoming: {
    title: 'Citas futuras',
    emptyMessage: 'No hay citas futuras para este paciente.',
    errorMessage: 'Error al cargar las citas futuras.',
    paginationLabel: 'Paginación de citas futuras',
  },
  attended: {
    title: 'Citas asistidas',
    emptyMessage: 'No hay citas asistidas registradas para este paciente.',
    errorMessage: 'Error al cargar las citas asistidas.',
    paginationLabel: 'Paginación de citas asistidas',
  },
};

function formatDateTime(iso: string, timeZone: string): string {
  // Zona del observador (preferencia del usuario); nunca la del navegador.
  return new Date(iso).toLocaleString('es-MX', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function valueOrDash(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : '—';
}

/** Página inicial desde un parámetro de URL; cualquier valor inválido es 1. */
function initialPageFromParam(raw: string | null | undefined): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function appointmentsUrl(
  patientId: string,
  variant: SectionVariant,
  page: number
): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });
  return `/api/admin/patients/${patientId}/appointments/${variant}?${params.toString()}`;
}

async function fetchAppointmentsPage(
  patientId: string,
  variant: SectionVariant,
  page: number
): Promise<{ appointments: PatientRecordAppointment[]; total: number }> {
  const res = await fetch(appointmentsUrl(patientId, variant, page));
  if (!res.ok) throw new Error(SECTION_CONFIG[variant].errorMessage);

  const data = (await res.json()) as {
    appointments?: PatientRecordAppointment[];
    pagination?: { total?: number };
  };

  return {
    appointments: data?.appointments ?? [],
    total: typeof data?.pagination?.total === 'number' ? data.pagination.total : 0,
  };
}

const HEAD_CELL_CLASS =
  'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500';

function AppointmentTableHead() {
  return (
    <thead className="bg-gray-50">
      <tr>
        <th className={HEAD_CELL_CLASS}>Fecha</th>
        <th className={HEAD_CELL_CLASS}>Servicio</th>
        <th className={HEAD_CELL_CLASS}>Doctor</th>
        <th className={HEAD_CELL_CLASS}>Estado</th>
      </tr>
    </thead>
  );
}

function AppointmentTable({
  appointments,
  timeZone,
}: {
  appointments: PatientRecordAppointment[];
  timeZone: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <AppointmentTableHead />
        <tbody className="divide-y divide-gray-200 bg-white">
          {appointments.map((appointment) => (
            <tr key={appointment.id}>
              <td className="px-3 py-2 text-sm text-gray-900">
                {formatDateTime(appointment.startAt, timeZone)}
              </td>
              <td className="px-3 py-2 text-sm text-gray-900">{appointment.serviceName}</td>
              <td className="px-3 py-2 text-sm text-gray-900">{appointment.providerName}</td>
              <td className="px-3 py-2 text-sm text-gray-600">{appointment.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Skeleton de carga con la misma estructura de tabla, solo para una sección. */
function AppointmentsSkeleton() {
  return (
    <div
      data-testid="appointments-skeleton"
      aria-hidden="true"
      className="overflow-hidden rounded-lg border border-gray-200"
    >
      <table className="min-w-full divide-y divide-gray-200">
        <AppointmentTableHead />
        <tbody className="animate-pulse divide-y divide-gray-200 bg-white">
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <tr key={index}>
              <td className="px-3 py-2">
                <div className="h-4 w-32 rounded bg-gray-200" />
              </td>
              <td className="px-3 py-2">
                <div className="h-4 w-24 rounded bg-gray-200" />
              </td>
              <td className="px-3 py-2">
                <div className="h-4 w-28 rounded bg-gray-200" />
              </td>
              <td className="px-3 py-2">
                <div className="h-4 w-16 rounded bg-gray-200" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type PatientAppointmentsSectionProps = {
  patientId: string;
  variant: SectionVariant;
  /** Página con la que arranca la sección (deep link); cambios posteriores se
   * gestionan con el estado local. */
  initialPage: number;
  /** Notifica al dueño de la URL cuando el usuario cambia de página. */
  onPageChange?: (page: number) => void;
};

function PatientAppointmentsSection({
  patientId,
  variant,
  initialPage,
  onPageChange,
}: PatientAppointmentsSectionProps) {
  const { title, emptyMessage, errorMessage, paginationLabel } = SECTION_CONFIG[variant];
  const viewerTz = useViewerTimezone();

  const [page, setPage] = useState(initialPage);
  const [rows, setRows] = useState<PatientRecordAppointment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Un fetch por (paciente, sección, página); la bandera descarta respuestas
  // obsoletas cuando el usuario navega rápido entre páginas.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchAppointmentsPage(patientId, variant, page);
        if (cancelled) return;
        setRows(result.appointments);
        setTotal(result.total);
      } catch {
        if (cancelled) return;
        setRows([]);
        setTotal(0);
        setError(errorMessage);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [patientId, variant, page, reloadToken, errorMessage]);

  function handlePageChange(nextPage: number) {
    setPage(nextPage);
    onPageChange?.(nextPage);
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-lg font-semibold text-gray-900">{title}</h3>

      {error && (
        <ErrorState
          message={error}
          onRetry={() => setReloadToken((token) => token + 1)}
        />
      )}

      {!error && loading && <AppointmentsSkeleton />}

      {!error && !loading && (
        <>
          {rows.length === 0 ? (
            <p className="text-sm text-gray-500">{emptyMessage}</p>
          ) : (
            <AppointmentTable appointments={rows} timeZone={viewerTz} />
          )}
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={handlePageChange}
            ariaLabel={paginationLabel}
          />
        </>
      )}
    </section>
  );
}

type PageState = Record<SectionVariant, number>;

type PatientRecordSectionsProps = {
  patient: Patient;
  pages?: PageState;
  onPageChange?: (variant: SectionVariant, page: number) => void;
};

/** Cuerpo compartido por la página y el modal: datos del paciente + secciones. */
function PatientRecordSections({
  patient,
  pages,
  onPageChange,
}: PatientRecordSectionsProps) {
  const viewerTz = useViewerTimezone();

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-1">
          <h2 className="text-xl font-semibold text-gray-900">{patient.fullName}</h2>
          <p className="text-sm text-gray-500">Expediente inicial del paciente</p>
        </div>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Teléfono</dt>
            <dd className="text-sm text-gray-900">{valueOrDash(patient.phoneE164)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Correo</dt>
            <dd className="text-sm text-gray-900">{valueOrDash(patient.email)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Registrado</dt>
            <dd className="text-sm text-gray-900">{formatDateTime(patient.createdAt, viewerTz)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notas</dt>
            <dd className="text-sm text-gray-900">{valueOrDash(patient.notes)}</dd>
          </div>
        </dl>
      </section>

      <PatientAppointmentsSection
        patientId={patient.id}
        variant="upcoming"
        initialPage={pages?.upcoming ?? 1}
        onPageChange={
          onPageChange ? (page) => onPageChange('upcoming', page) : undefined
        }
      />

      <PatientAppointmentsSection
        patientId={patient.id}
        variant="attended"
        initialPage={pages?.attended ?? 1}
        onPageChange={
          onPageChange ? (page) => onPageChange('attended', page) : undefined
        }
      />
    </div>
  );
}

/**
 * Variante con sincronía de URL (`/patients/[id]`): estado local como fuente
 * de verdad, inicialización única desde `?upcomingPage=&attendedPage=` y
 * `router.replace` sin entradas nuevas de historial. Compone ambos parámetros
 * en un solo builder para que las secciones no se pisen.
 */
function UrlSyncedPatientRecordView({ patient }: { patient: Patient }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [pages, setPages] = useState<PageState>(() => ({
    upcoming: initialPageFromParam(searchParams?.get('upcomingPage')),
    attended: initialPageFromParam(searchParams?.get('attendedPage')),
  }));

  const currentQueryString = searchParams?.toString() ?? '';

  useEffect(() => {
    const params = new URLSearchParams(currentQueryString);
    if (pages.upcoming > 1) params.set('upcomingPage', String(pages.upcoming));
    else params.delete('upcomingPage');
    if (pages.attended > 1) params.set('attendedPage', String(pages.attended));
    else params.delete('attendedPage');

    const next = params.toString();
    // Guardia de redundancia: evita reescribir la URL cuando ya coincide.
    if (next !== currentQueryString) {
      router.replace(next ? `${pathname}?${next}` : pathname);
    }
  }, [pages, currentQueryString, router, pathname]);

  const handlePageChange = useCallback((variant: SectionVariant, page: number) => {
    setPages((prev) => (prev[variant] === page ? prev : { ...prev, [variant]: page }));
  }, []);

  return (
    <PatientRecordSections
      patient={patient}
      pages={pages}
      onPageChange={handlePageChange}
    />
  );
}

type PatientRecordViewProps = {
  patient: Patient;
  /** `true` solo en `/patients/[id]`; el modal usa estado local. */
  syncUrl?: boolean;
};

export function PatientRecordView({ patient, syncUrl = false }: PatientRecordViewProps) {
  if (syncUrl) return <UrlSyncedPatientRecordView patient={patient} />;
  return <PatientRecordSections patient={patient} />;
}
