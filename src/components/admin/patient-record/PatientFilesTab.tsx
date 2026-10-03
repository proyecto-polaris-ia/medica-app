'use client';

import { ChangeEvent, DragEvent, useMemo, useState } from 'react';
import { EmptyState } from '@/components/admin/EmptyState';
import { ErrorState } from '@/components/admin/ErrorState';
import { LoadingState } from '@/components/admin/LoadingState';
import type {
  ClinicalVisit,
  PatientFile,
  PatientFileCategory,
} from '@/lib/admin/types';

type PatientFilesTabProps = {
  patientId: string;
  clinicalVisits: ClinicalVisit[];
  files: PatientFile[];
  loading: boolean;
  error: string | null;
  onFilesChanged: () => void;
  /**
   * Modo consulta: cuando viene un id fijo, la subida se asocia a esa consulta
   * y se oculta el selector de consulta.
   */
  clinicalVisitId?: string | null;
};

const CATEGORY_LABELS: Record<PatientFileCategory, string> = {
  radiograph: 'Radiografía',
  clinical_photo: 'Foto clínica',
  document: 'Documento',
  consent: 'Consentimiento',
  other: 'Otro',
};

const ACCEPTED_MIME_TYPES =
  'image/jpeg,image/png,image/webp,application/pdf';

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function isImage(file: PatientFile): boolean {
  return IMAGE_MIME_TYPES.has(file.mimeType);
}

function isPdf(file: PatientFile): boolean {
  return file.mimeType === 'application/pdf';
}

function formatSize(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  const useMegabytes = megabytes >= 1;
  const value = useMegabytes ? megabytes : bytes / 1024;
  const unit = useMegabytes ? 'MB' : 'KB';
  return `${new Intl.NumberFormat('es-MX', {
    maximumFractionDigits: 1,
  }).format(value)} ${unit}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { dateStyle: 'medium' });
}

export function PatientFilesTab({
  patientId,
  clinicalVisits,
  files,
  loading,
  error,
  onFilesChanged,
  clinicalVisitId = null,
}: PatientFilesTabProps) {
  const [category, setCategory] = useState<PatientFileCategory>('document');
  const [selectedVisitId, setSelectedVisitId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isVisitMode = clinicalVisitId !== null;
  const effectiveVisitId = isVisitMode ? clinicalVisitId : selectedVisitId;

  const visitLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const visit of clinicalVisits) {
      map.set(visit.id, `${formatDate(visit.createdAt)} · ${visit.subjective}`);
    }
    return map;
  }, [clinicalVisits]);

  async function handleFiles(selected: FileList | File[] | null) {
    const incoming = selected ? Array.from(selected) : [];
    if (incoming.length === 0) return;

    setUploading(true);
    setUploadError(null);
    try {
      for (const file of incoming) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', category);
        if (effectiveVisitId)
          formData.append('clinicalVisitId', effectiveVisitId);

        const res = await fetch(`/api/admin/patients/${patientId}/files`, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(payload?.message ?? 'No se pudo subir el archivo.');
        }
      }
      onFilesChanged();
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'No se pudo subir el archivo.'
      );
    } finally {
      setUploading(false);
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFiles(event.target.files);
    event.target.value = '';
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    void handleFiles(event.dataTransfer?.files ?? null);
  }

  async function handleDownload(file: PatientFile) {
    setActionError(null);
    try {
      const res = await fetch(
        `/api/admin/patients/${patientId}/files/${file.id}`
      );
      if (!res.ok) throw new Error('No se pudo descargar el archivo.');
      const data = await res.json();
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'No se pudo descargar el archivo.'
      );
    }
  }

  async function handleDelete(file: PatientFile) {
    if (
      !window.confirm(
        '¿Eliminar este archivo? Esta acción no se puede deshacer.'
      )
    ) {
      return;
    }

    setDeletingId(file.id);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/admin/patients/${patientId}/files/${file.id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('No se pudo eliminar el archivo.');
      onFilesChanged();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'No se pudo eliminar el archivo.'
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) return <LoadingState message="Cargando archivos..." />;
  if (error) return <ErrorState message={error} onRetry={onFilesChanged} />;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900">Subir archivos</h3>
        <p className="text-sm text-gray-500">
          Radiografías, fotos clínicas, documentos y consentimientos (JPG, PNG,
          WEBP o PDF, hasta 10 MB).
        </p>

        <div
          className={`mt-4 grid grid-cols-1 gap-4 ${
            isVisitMode ? '' : 'sm:grid-cols-2'
          }`}
        >
          <label className="block text-sm font-medium text-gray-700">
            Categoría
            <select
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as PatientFileCategory)
              }
              disabled={uploading}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {!isVisitMode && (
            <label className="block text-sm font-medium text-gray-700">
              Consulta
              <select
                value={selectedVisitId}
                onChange={(event) => setSelectedVisitId(event.target.value)}
                disabled={uploading}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Sin consulta</option>
                {clinicalVisits.map((visit) => (
                  <option key={visit.id} value={visit.id}>
                    {visitLabelById.get(visit.id) ?? visit.id}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          aria-label="Arrastra y suelta archivos aquí"
          className={`mt-4 rounded-lg border-2 border-dashed p-6 text-center ${
            isDragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 bg-gray-50'
          }`}
        >
          <p className="text-sm text-gray-600">
            Arrastra y suelta archivos aquí
          </p>
          <label className="mt-2 inline-block cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-800">
            Seleccionar archivos
            <input
              type="file"
              multiple
              accept={ACCEPTED_MIME_TYPES}
              onChange={handleInputChange}
              disabled={uploading}
              className="sr-only"
            />
          </label>
        </div>

        {uploading && (
          <p className="mt-2 text-sm text-gray-500">Subiendo archivos...</p>
        )}
        {uploadError && (
          <p className="mt-2 text-sm text-red-700">{uploadError}</p>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900">
          Archivos del paciente
        </h3>
        {actionError && (
          <p className="mt-2 text-sm text-red-700">{actionError}</p>
        )}

        {files.length === 0 ? (
          <EmptyState message="Sin archivos. Sube el primer estudio del paciente." />
        ) : (
          <ul className="mt-4 space-y-3">
            {files.map((file) => (
              <li
                key={file.id}
                className="rounded-md border border-gray-200 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-3">
                    {isImage(file) && file.signedUrl && (
                      <img
                        src={file.signedUrl}
                        alt={file.fileName}
                        className="h-16 w-16 rounded-md border border-gray-200 object-cover"
                      />
                    )}
                    <div>
                      <p className="font-semibold text-gray-900">
                        {file.fileName}
                      </p>
                      <p className="text-sm text-gray-500">
                        {CATEGORY_LABELS[file.category]} ·{' '}
                        {formatSize(file.sizeBytes)} ·{' '}
                        {formatDate(file.createdAt)}
                      </p>
                      {file.clinicalVisitId && (
                        <p className="text-sm text-gray-500">
                          Consulta:{' '}
                          {visitLabelById.get(file.clinicalVisitId) ??
                            file.clinicalVisitId}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3 self-start">
                    {isPdf(file) && (
                      <button
                        type="button"
                        onClick={() => handleDownload(file)}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800"
                      >
                        Descargar {file.fileName}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(file)}
                      disabled={deletingId === file.id}
                      className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      {deletingId === file.id
                        ? 'Eliminando...'
                        : `Eliminar ${file.fileName}`}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
