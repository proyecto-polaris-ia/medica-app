'use client';

import { useState } from 'react';
import type { ClinicalVisit, ClinicalVisitInput } from '@/lib/admin/types';
import { FormModal } from '@/components/admin/FormModal';

type ClinicalVisitFormProps = {
  patientId: string;
  visit: ClinicalVisit | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (visit: ClinicalVisit) => void;
};

function emptyInput(): ClinicalVisitInput & { subjective: string } {
  return {
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
    treatment: '',
    notes: '',
  };
}

function visitToInput(visit: ClinicalVisit | null): ClinicalVisitInput & { subjective: string } {
  if (!visit) return emptyInput();
  return {
    subjective: visit.subjective,
    objective: visit.objective ?? '',
    assessment: visit.assessment ?? '',
    plan: visit.plan ?? '',
    treatment: visit.treatment ?? '',
    notes: visit.notes ?? '',
  };
}

export function ClinicalVisitForm({
  patientId,
  visit,
  isOpen,
  onClose,
  onSaved,
}: ClinicalVisitFormProps) {
  const [formData, setFormData] = useState(visitToInput(visit));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(field: keyof typeof formData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);

    try {
      const url = visit
        ? `/api/admin/patients/${patientId}/clinical-visits/${visit.id}`
        : `/api/admin/patients/${patientId}/clinical-visits`;
      const method = visit ? 'PATCH' : 'POST';

      const payload: ClinicalVisitInput = {
        subjective: formData.subjective,
        objective: formData.objective || null,
        assessment: formData.assessment || null,
        plan: formData.plan || null,
        treatment: formData.treatment || null,
        notes: formData.notes || null,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al guardar la consulta');
      }

      const data = await res.json();
      onSaved(data.clinicalVisit);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  const inputClass =
    'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
  const labelClass = 'block text-sm font-medium text-gray-700';
  const textareaClass = `${inputClass} resize-y`;

  return (
    <FormModal
      title={visit ? 'Editar consulta' : 'Nueva consulta'}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={visit ? 'Guardar cambios' : 'Guardar consulta'}
      isSubmitting={saving}
    >
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div>
        <label htmlFor="subjective" className={labelClass}>
          Subjetivo
        </label>
        <textarea
          id="subjective"
          rows={3}
          value={formData.subjective}
          onChange={(e) => handleChange('subjective', e.target.value)}
          placeholder="Motivo de la consulta"
          className={textareaClass}
          required
        />
      </div>

      <div>
        <label htmlFor="objective" className={labelClass}>
          Objetivo
        </label>
        <textarea
          id="objective"
          rows={3}
          value={formData.objective ?? ''}
          onChange={(e) => handleChange('objective', e.target.value)}
          placeholder="Hallazgos clínicos"
          className={textareaClass}
        />
      </div>

      <div>
        <label htmlFor="assessment" className={labelClass}>
          Valoración
        </label>
        <textarea
          id="assessment"
          rows={3}
          value={formData.assessment ?? ''}
          onChange={(e) => handleChange('assessment', e.target.value)}
          placeholder="Valoración clínica (texto libre del dentista)"
          className={textareaClass}
        />
      </div>

      <div>
        <label htmlFor="plan" className={labelClass}>
          Plan
        </label>
        <textarea
          id="plan"
          rows={3}
          value={formData.plan ?? ''}
          onChange={(e) => handleChange('plan', e.target.value)}
          placeholder="Plan de tratamiento"
          className={textareaClass}
        />
      </div>

      <div>
        <label htmlFor="treatment" className={labelClass}>
          Tratamiento realizado
        </label>
        <input
          id="treatment"
          type="text"
          value={formData.treatment ?? ''}
          onChange={(e) => handleChange('treatment', e.target.value)}
          placeholder="Tratamiento realizado"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="notes" className={labelClass}>
          Notas
        </label>
        <textarea
          id="notes"
          rows={3}
          value={formData.notes ?? ''}
          onChange={(e) => handleChange('notes', e.target.value)}
          placeholder="Notas adicionales"
          className={textareaClass}
        />
      </div>
    </FormModal>
  );
}
