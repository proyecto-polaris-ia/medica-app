import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientFilesTab } from './PatientFilesTab';
import type { ClinicalVisit, PatientFile } from '@/lib/admin/types';

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const VISIT_ID = '660e8400-e29b-41d4-a716-446655440000';

const clinicalVisits: ClinicalVisit[] = [
  {
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
  },
];

const imageFile: PatientFile = {
  id: '770e8400-e29b-41d4-a716-446655440000',
  patientId: PATIENT_ID,
  clinicalVisitId: VISIT_ID,
  category: 'radiograph',
  storagePath: `${PATIENT_ID}/image.jpg`,
  fileName: 'radiografia.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 2 * 1024 * 1024,
  uploadedBy: 'user-1',
  createdAt: '2026-09-10T10:00:00Z',
  signedUrl: 'https://storage.example.com/signed-image',
};

const pdfFile: PatientFile = {
  id: '880e8400-e29b-41d4-a716-446655440000',
  patientId: PATIENT_ID,
  clinicalVisitId: null,
  category: 'consent',
  storagePath: `${PATIENT_ID}/document.pdf`,
  fileName: 'consentimiento.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 512 * 1024,
  uploadedBy: 'user-1',
  createdAt: '2026-09-11T10:00:00Z',
  signedUrl: 'https://storage.example.com/signed-pdf',
};

function renderTab(
  overrides: Partial<React.ComponentProps<typeof PatientFilesTab>> = {}
) {
  const onFilesChanged = vi.fn();
  const view = render(
    <PatientFilesTab
      patientId={PATIENT_ID}
      clinicalVisits={clinicalVisits}
      files={[imageFile, pdfFile]}
      loading={false}
      error={null}
      onFilesChanged={onFilesChanged}
      {...overrides}
    />
  );
  return { onFilesChanged, view };
}

describe('PatientFilesTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
    global.fetch = vi.fn(async () =>
      Response.json({ file: imageFile }, { status: 201 })
    ) as typeof fetch;
  });

  it('shows the empty state and keeps the upload controls available', () => {
    renderTab({ files: [] });

    expect(
      screen.getByText('Sin archivos. Sube el primer estudio del paciente.')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Seleccionar archivos')).toBeInTheDocument();
    expect(screen.getByLabelText('Categoría')).toBeInTheDocument();
    expect(screen.getByLabelText('Consulta')).toBeInTheDocument();
  });

  it('lists files with an image thumbnail and a PDF download button', () => {
    renderTab();

    const thumbnail = screen.getByRole('img', { name: 'radiografia.jpg' });
    expect(thumbnail).toHaveAttribute('src', imageFile.signedUrl);
    expect(screen.getByText('radiografia.jpg')).toBeInTheDocument();
    expect(screen.getByText(/Radiografía · 2 MB/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Descargar consentimiento.pdf' })
    ).toBeInTheDocument();
    // Las imágenes no muestran botón de descarga por PDF.
    expect(
      screen.queryByRole('button', { name: 'Descargar radiografia.jpg' })
    ).not.toBeInTheDocument();
  });

  it('shows loading and recoverable error states', () => {
    const { view } = renderTab({ files: [], loading: true });

    expect(screen.getByText('Cargando archivos...')).toBeInTheDocument();

    const retry = vi.fn();
    view.rerender(
      <PatientFilesTab
        patientId={PATIENT_ID}
        clinicalVisits={clinicalVisits}
        files={[]}
        loading={false}
        error="Error al cargar los archivos"
        onFilesChanged={retry}
      />
    );

    expect(screen.getByText('Error al cargar los archivos')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Intentar de nuevo' }).click();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('uploads a selected file as multipart/form-data and refreshes the list', async () => {
    const user = userEvent.setup();
    const { onFilesChanged } = renderTab({ files: [] });

    await user.selectOptions(screen.getByLabelText('Categoría'), 'radiograph');
    await user.selectOptions(screen.getByLabelText('Consulta'), VISIT_ID);

    const file = new File(['contenido'], 'radiografia.jpg', {
      type: 'image/jpeg',
    });
    await user.upload(screen.getByLabelText('Seleccionar archivos'), file);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/admin/patients/${PATIENT_ID}/files`,
        expect.objectContaining({ method: 'POST' })
      );
    });

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('category')).toBe('radiograph');
    expect(body.get('clinicalVisitId')).toBe(VISIT_ID);
    expect((body.get('file') as File).name).toBe('radiografia.jpg');
    expect(onFilesChanged).toHaveBeenCalledTimes(1);
  });

  it('hides the visit selector and sends the fixed clinicalVisitId in visit mode', async () => {
    const user = userEvent.setup();
    const { onFilesChanged } = renderTab({
      files: [],
      clinicalVisitId: VISIT_ID,
    });

    expect(screen.queryByLabelText('Consulta')).not.toBeInTheDocument();

    const file = new File(['contenido'], 'radiografia.jpg', {
      type: 'image/jpeg',
    });
    await user.upload(screen.getByLabelText('Seleccionar archivos'), file);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/admin/patients/${PATIENT_ID}/files`,
        expect.objectContaining({ method: 'POST' })
      );
    });

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('clinicalVisitId')).toBe(VISIT_ID);
    expect(onFilesChanged).toHaveBeenCalledTimes(1);
  });

  it('keeps the visit selector in the default (expediente) mode', () => {
    renderTab({ files: [] });

    expect(screen.getByLabelText('Consulta')).toBeInTheDocument();
  });

  it('shows the Spanish API validation message when an upload is rejected', async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'invalid_file',
        message: 'El archivo no debe superar 10 MB.',
      }),
    })) as unknown as typeof fetch;

    const { onFilesChanged } = renderTab({ files: [] });

    const file = new File(['grande'], 'estudio.pdf', {
      type: 'application/pdf',
    });
    await user.upload(screen.getByLabelText('Seleccionar archivos'), file);

    await waitFor(() => {
      expect(
        screen.getByText('El archivo no debe superar 10 MB.')
      ).toBeInTheDocument();
    });
    expect(onFilesChanged).not.toHaveBeenCalled();
  });

  it('does not refresh the list when a rejected file keeps the current files visible', async () => {
    const user = userEvent.setup({ applyAccept: false });
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'invalid_file',
        message: 'Solo se permiten archivos JPG, PNG, WEBP o PDF.',
      }),
    })) as unknown as typeof fetch;

    const { onFilesChanged } = renderTab();

    const file = new File(['nota'], 'nota.txt', { type: 'text/plain' });
    await user.upload(screen.getByLabelText('Seleccionar archivos'), file);

    await waitFor(() => {
      expect(
        screen.getByText('Solo se permiten archivos JPG, PNG, WEBP o PDF.')
      ).toBeInTheDocument();
    });
    expect(onFilesChanged).not.toHaveBeenCalled();
    expect(screen.getByText('radiografia.jpg')).toBeInTheDocument();
  });

  it('downloads a PDF through the signed URL endpoint', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    global.fetch = vi.fn(async () =>
      Response.json({
        url: 'https://storage.example.com/signed-download',
        fileName: 'consentimiento.pdf',
      })
    ) as typeof fetch;

    renderTab();

    await user.click(
      screen.getByRole('button', { name: 'Descargar consentimiento.pdf' })
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/admin/patients/${PATIENT_ID}/files/${pdfFile.id}`
      );
    });
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        'https://storage.example.com/signed-download',
        '_blank',
        expect.anything()
      );
    });
  });

  it('deletes a file with confirmation and refreshes the list', async () => {
    const user = userEvent.setup();
    const { onFilesChanged } = renderTab();

    await user.click(
      screen.getByRole('button', { name: 'Eliminar radiografia.jpg' })
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/admin/patients/${PATIENT_ID}/files/${imageFile.id}`,
        expect.objectContaining({ method: 'DELETE' })
      );
    });
    expect(onFilesChanged).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state after deleting the last file', async () => {
    const user = userEvent.setup();
    const onFilesChanged = vi.fn();
    const view = render(
      <PatientFilesTab
        patientId={PATIENT_ID}
        clinicalVisits={clinicalVisits}
        files={[imageFile]}
        loading={false}
        error={null}
        onFilesChanged={onFilesChanged}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Eliminar radiografia.jpg' })
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/admin/patients/${PATIENT_ID}/files/${imageFile.id}`,
        expect.objectContaining({ method: 'DELETE' })
      );
    });
    expect(onFilesChanged).toHaveBeenCalledTimes(1);

    view.rerender(
      <PatientFilesTab
        patientId={PATIENT_ID}
        clinicalVisits={clinicalVisits}
        files={[]}
        loading={false}
        error={null}
        onFilesChanged={onFilesChanged}
      />
    );

    expect(
      screen.getByText('Sin archivos. Sube el primer estudio del paciente.')
    ).toBeInTheDocument();
  });
});
