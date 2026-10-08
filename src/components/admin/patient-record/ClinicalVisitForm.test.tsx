import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClinicalVisitForm } from './ClinicalVisitForm';
import type { ClinicalVisit } from '@/lib/admin/types';

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const VISIT_ID = '660e8400-e29b-41d4-a716-446655440000';
const FILE_ID = '770e8400-e29b-41d4-a716-446655440000';

const savedVisit: ClinicalVisit = {
  id: VISIT_ID,
  patientId: PATIENT_ID,
  appointmentId: null,
  providerId: null,
  subjective: 'Dolor en molar inferior',
  objective: null,
  assessment: null,
  plan: null,
  treatment: null,
  notes: null,
  createdAt: '2026-09-02T10:00:00Z',
  updatedAt: '2026-09-02T10:00:00Z',
};

// Consulta con todos los campos SOAP poblados para verificar la pre-población.
const savedVisitFull: ClinicalVisit = {
  ...savedVisit,
  objective: 'Caries oclusal en primer molar inferior derecho',
  assessment: 'Pulpitis reversible',
  plan: 'Resina compuesta en dos citas',
  treatment: 'Profilaxis y aplicación de flúor',
  notes: 'Paciente toleró bien el procedimiento',
};

// Segunda consulta para verificar el cambio de una edición a otra.
const otherVisit: ClinicalVisit = {
  ...savedVisit,
  id: '880e8400-e29b-41d4-a716-446655440000',
  subjective: 'Control postoperatorio',
  objective: 'Sin dolor a la percusión',
  assessment: 'Evolución favorable',
  plan: 'Observación por seis meses',
  treatment: 'Revisión de restauración',
  notes: 'Revisión programada en seis meses',
};

type FetchOptions = {
  visitResponse?: ClinicalVisit;
  files?: Record<string, unknown>[];
};

function buildFetch(options: FetchOptions = {}) {
  const visitResponse = options.visitResponse ?? savedVisit;
  const files = options.files ?? [];

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (
      url === `/api/admin/patients/${PATIENT_ID}/clinical-visits` &&
      method === 'POST'
    ) {
      return Response.json({ clinicalVisit: visitResponse });
    }
    if (
      url === `/api/admin/patients/${PATIENT_ID}/clinical-visits/${VISIT_ID}` &&
      method === 'PATCH'
    ) {
      return Response.json({ clinicalVisit: visitResponse });
    }
    if (
      url.startsWith(`/api/admin/patients/${PATIENT_ID}/files`) &&
      method === 'GET'
    ) {
      return Response.json({ files });
    }
    if (url === `/api/admin/patients/${PATIENT_ID}/files` && method === 'POST') {
      return Response.json({ file: { id: FILE_ID } }, { status: 201 });
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });
}

function renderForm(
  overrides: Partial<React.ComponentProps<typeof ClinicalVisitForm>> = {}
) {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <ClinicalVisitForm
      patientId={PATIENT_ID}
      visit={null}
      isOpen
      onClose={onClose}
      onSaved={onSaved}
      {...overrides}
    />
  );
  return { onSaved, onClose, view };
}

// Simula el montaje persistente del padre: React reutiliza la misma instancia
// cuando cambia la prop `visit` (de null a una consulta, entre consultas o de
// vuelta a null al cerrar).
function rerenderForm(
  view: ReturnType<typeof render>,
  overrides: Partial<React.ComponentProps<typeof ClinicalVisitForm>> = {}
) {
  view.rerender(
    <ClinicalVisitForm
      patientId={PATIENT_ID}
      visit={null}
      isOpen
      onClose={vi.fn()}
      onSaved={vi.fn()}
      {...overrides}
    />
  );
}

describe('ClinicalVisitForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.confirm = vi.fn(() => true);
  });

  it('saves the visit as JSON and then offers file upload for the saved visit', async () => {
    const user = userEvent.setup();
    const fetchMock = buildFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { onSaved } = renderForm();

    await user.type(screen.getByLabelText('Subjetivo'), 'Dolor en molar');
    await user.click(screen.getByRole('button', { name: 'Guardar consulta' }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(savedVisit);
    });

    const visitCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === `/api/admin/patients/${PATIENT_ID}/clinical-visits` &&
        init?.method === 'POST'
    );
    expect(visitCall).toBeDefined();
    const visitInit = visitCall?.[1] as RequestInit;
    // El cuerpo de la consulta sigue siendo JSON de texto, sin binarios.
    expect(visitInit.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(typeof visitInit.body).toBe('string');
    expect(JSON.parse(visitInit.body as string)).toEqual({
      subjective: 'Dolor en molar',
      objective: null,
      assessment: null,
      plan: null,
      treatment: null,
      notes: null,
    });

    expect(
      screen.getByText('Adjuntar archivos a esta consulta')
    ).toBeInTheDocument();

    // La carga viaja después, a la API de archivos con el id de la consulta.
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/admin/patients/${PATIENT_ID}/files?clinicalVisitId=${VISIT_ID}`
      );
    });
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          url === `/api/admin/patients/${PATIENT_ID}/files` &&
          init?.method === 'POST'
      )
    ).toBe(false);
  });

  it('does not upload nor call the visits API when the form is canceled', async () => {
    const user = userEvent.setup();
    const fetchMock = buildFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { onClose, onSaved } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reuses the existing visit id when editing and attaching a file', async () => {
    const user = userEvent.setup();
    const fetchMock = buildFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { onSaved } = renderForm({ visit: savedVisit });

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(savedVisit);
    });

    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url ===
          `/api/admin/patients/${PATIENT_ID}/clinical-visits/${VISIT_ID}` &&
        init?.method === 'PATCH'
    );
    expect(patchCall).toBeDefined();

    await waitFor(() => {
      expect(
        screen.getByText('Adjuntar archivos a esta consulta')
      ).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Consulta')).not.toBeInTheDocument();

    const file = new File(['contenido'], 'radiografia.jpg', {
      type: 'image/jpeg',
    });
    await user.upload(screen.getByLabelText('Seleccionar archivos'), file);

    await waitFor(() => {
      const uploadCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === `/api/admin/patients/${PATIENT_ID}/files` &&
          init?.method === 'POST'
      );
      expect(uploadCall).toBeDefined();
      const body = uploadCall?.[1]?.body as FormData;
      expect(body.get('clinicalVisitId')).toBe(VISIT_ID);
      expect((body.get('file') as File).name).toBe('radiografia.jpg');
    });
  });

  describe('pre-población al cambiar la consulta seleccionada', () => {
    beforeEach(() => {
      global.fetch = buildFetch() as unknown as typeof fetch;
    });

    it('precarga todos los campos al abrir la edición de una consulta existente', () => {
      const { view } = renderForm({ visit: null });

      rerenderForm(view, { visit: savedVisitFull });

      expect(screen.getByLabelText('Subjetivo')).toHaveValue(
        'Dolor en molar inferior'
      );
      expect(screen.getByLabelText('Objetivo')).toHaveValue(
        'Caries oclusal en primer molar inferior derecho'
      );
      expect(screen.getByLabelText('Valoración')).toHaveValue(
        'Pulpitis reversible'
      );
      expect(screen.getByLabelText('Plan')).toHaveValue(
        'Resina compuesta en dos citas'
      );
      expect(screen.getByLabelText('Tratamiento realizado')).toHaveValue(
        'Profilaxis y aplicación de flúor'
      );
      expect(screen.getByLabelText('Notas')).toHaveValue(
        'Paciente toleró bien el procedimiento'
      );
    });

    it('vacía los campos al pasar de edición a una consulta nueva', () => {
      const { view } = renderForm({ visit: savedVisitFull });

      rerenderForm(view, { visit: null });

      expect(screen.getByLabelText('Subjetivo')).toHaveValue('');
      expect(screen.getByLabelText('Objetivo')).toHaveValue('');
      expect(screen.getByLabelText('Valoración')).toHaveValue('');
      expect(screen.getByLabelText('Plan')).toHaveValue('');
      expect(screen.getByLabelText('Tratamiento realizado')).toHaveValue('');
      expect(screen.getByLabelText('Notas')).toHaveValue('');
    });

    it('no filtra datos escritos hacia una consulta nueva', async () => {
      const user = userEvent.setup();
      const { view } = renderForm({ visit: savedVisitFull });

      await user.type(screen.getByLabelText('Subjetivo'), ' editado');

      rerenderForm(view, { visit: null });

      expect(screen.getByLabelText('Subjetivo')).toHaveValue('');
      expect(screen.getByLabelText('Objetivo')).toHaveValue('');
      expect(screen.getByLabelText('Valoración')).toHaveValue('');
      expect(screen.getByLabelText('Plan')).toHaveValue('');
      expect(screen.getByLabelText('Tratamiento realizado')).toHaveValue('');
      expect(screen.getByLabelText('Notas')).toHaveValue('');
    });

    it('actualiza los campos al cambiar a otra consulta', async () => {
      const user = userEvent.setup();
      const { view } = renderForm({ visit: savedVisitFull });

      await user.type(screen.getByLabelText('Subjetivo'), ' editado');

      rerenderForm(view, { visit: otherVisit });

      expect(screen.getByLabelText('Subjetivo')).toHaveValue(
        'Control postoperatorio'
      );
      expect(screen.getByLabelText('Objetivo')).toHaveValue(
        'Sin dolor a la percusión'
      );
      expect(screen.getByLabelText('Valoración')).toHaveValue(
        'Evolución favorable'
      );
      expect(screen.getByLabelText('Plan')).toHaveValue(
        'Observación por seis meses'
      );
      expect(screen.getByLabelText('Tratamiento realizado')).toHaveValue(
        'Revisión de restauración'
      );
      expect(screen.getByLabelText('Notas')).toHaveValue(
        'Revisión programada en seis meses'
      );
    });
  });
});
