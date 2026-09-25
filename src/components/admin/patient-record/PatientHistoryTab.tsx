'use client';

import { useState } from 'react';
import type { MedicalHistory } from '@/lib/admin/types';
import { ErrorState } from '@/components/admin/ErrorState';
import { stringArrayToText, textToStringArray } from './array-helpers';

type PatientHistoryTabProps = {
  patientId: string;
  history: MedicalHistory;
  onHistoryUpdated: (history: MedicalHistory) => void;
};

const PREGNANCY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '—' },
  { value: 'not_applicable', label: 'No aplica' },
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Sí' },
];

const SMOKING_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '—' },
  { value: 'never', label: 'Nunca' },
  { value: 'former', label: 'Exfumador' },
  { value: 'current', label: 'Fumador activo' },
];

const ALCOHOL_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '—' },
  { value: 'never', label: 'Nunca' },
  { value: 'occasional', label: 'Ocasional' },
  { value: 'frequent', label: 'Frecuente' },
];

export function PatientHistoryTab({
  patientId,
  history,
  onHistoryUpdated,
}: PatientHistoryTabProps) {
  const [formData, setFormData] = useState<MedicalHistory>(history);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleTextChange(field: keyof MedicalHistory, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value || null }));
  }

  function handleArrayChange(field: keyof MedicalHistory, value: string) {
    setFormData((prev) => ({ ...prev, [field]: textToStringArray(value) }));
  }

  function handleStatusChange(
    field: 'pregnancyStatus' | 'smoking' | 'alcohol',
    value: string
  ) {
    setFormData((prev) => ({
      ...prev,
      [field]: value === '' ? null : value,
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/patients/${patientId}/medical-history`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allergies: formData.allergies,
          systemicConditions: formData.systemicConditions,
          medications: formData.medications,
          pregnancyStatus: formData.pregnancyStatus,
          coagulationDisorders: formData.coagulationDisorders,
          anticoagulants: formData.anticoagulants,
          surgeries: formData.surgeries,
          infectiousDiseases: formData.infectiousDiseases,
          smoking: formData.smoking,
          alcohol: formData.alcohol,
          dentalHistory: formData.dentalHistory,
          oralHabits: formData.oralHabits,
          clinicalNotes: formData.clinicalNotes,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al guardar la historia clínica');
      }

      const data = await res.json();
      onHistoryUpdated(data.medicalHistory);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
  const labelClass = 'block text-sm font-medium text-gray-700';
  const textareaClass = `${inputClass} resize-y`;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <ErrorState message={error} />}

      <h3 className="text-lg font-semibold text-gray-900">Historia clínica</h3>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h4 className="mb-4 text-base font-semibold text-gray-900">Alergias y condiciones</h4>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="allergies" className={labelClass}>
              Alergias
            </label>
            <p className="text-xs text-gray-500">Una por línea</p>
            <textarea
              id="allergies"
              rows={3}
              value={stringArrayToText(formData.allergies)}
              onChange={(e) => handleArrayChange('allergies', e.target.value)}
              placeholder="Ninguna registrada"
              className={textareaClass}
            />
          </div>

          <div>
            <label htmlFor="systemicConditions" className={labelClass}>
              Condiciones sistémicas
            </label>
            <p className="text-xs text-gray-500">Una por línea</p>
            <textarea
              id="systemicConditions"
              rows={3}
              value={stringArrayToText(formData.systemicConditions)}
              onChange={(e) =>
                handleArrayChange('systemicConditions', e.target.value)
              }
              placeholder="Ninguna registrada"
              className={textareaClass}
            />
          </div>

          <div>
            <label htmlFor="medications" className={labelClass}>
              Medicamentos
            </label>
            <p className="text-xs text-gray-500">Uno por línea</p>
            <textarea
              id="medications"
              rows={3}
              value={stringArrayToText(formData.medications)}
              onChange={(e) => handleArrayChange('medications', e.target.value)}
              placeholder="Ninguno registrado"
              className={textareaClass}
            />
          </div>

          <div>
            <label htmlFor="pregnancyStatus" className={labelClass}>
              Embarazo
            </label>
            <select
              id="pregnancyStatus"
              value={formData.pregnancyStatus ?? ''}
              onChange={(e) => handleStatusChange('pregnancyStatus', e.target.value)}
              className={inputClass}
            >
              {PREGNANCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h4 className="mb-4 text-base font-semibold text-gray-900">Antecedentes médicos</h4>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="coagulationDisorders" className={labelClass}>
              Trastornos de coagulación
            </label>
            <input
              id="coagulationDisorders"
              type="text"
              value={formData.coagulationDisorders ?? ''}
              onChange={(e) =>
                handleTextChange('coagulationDisorders', e.target.value)
              }
              placeholder="Sin registrar"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="anticoagulants" className={labelClass}>
              Anticoagulantes
            </label>
            <input
              id="anticoagulants"
              type="text"
              value={formData.anticoagulants ?? ''}
              onChange={(e) => handleTextChange('anticoagulants', e.target.value)}
              placeholder="Sin registrar"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="surgeries" className={labelClass}>
              Antecedentes quirúrgicos
            </label>
            <input
              id="surgeries"
              type="text"
              value={formData.surgeries ?? ''}
              onChange={(e) => handleTextChange('surgeries', e.target.value)}
              placeholder="Sin registrar"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="infectiousDiseases" className={labelClass}>
              Enfermedades infecciosas
            </label>
            <input
              id="infectiousDiseases"
              type="text"
              value={formData.infectiousDiseases ?? ''}
              onChange={(e) =>
                handleTextChange('infectiousDiseases', e.target.value)
              }
              placeholder="Sin registrar"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="smoking" className={labelClass}>
              Tabaquismo
            </label>
            <select
              id="smoking"
              value={formData.smoking ?? ''}
              onChange={(e) => handleStatusChange('smoking', e.target.value)}
              className={inputClass}
            >
              {SMOKING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="alcohol" className={labelClass}>
              Alcoholismo
            </label>
            <select
              id="alcohol"
              value={formData.alcohol ?? ''}
              onChange={(e) => handleStatusChange('alcohol', e.target.value)}
              className={inputClass}
            >
              {ALCOHOL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h4 className="mb-4 text-base font-semibold text-gray-900">Historia dental</h4>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="dentalHistory" className={labelClass}>
              Historia dental
            </label>
            <textarea
              id="dentalHistory"
              rows={3}
              value={formData.dentalHistory ?? ''}
              onChange={(e) => handleTextChange('dentalHistory', e.target.value)}
              placeholder="Sin registrar"
              className={textareaClass}
            />
          </div>

          <div>
            <label htmlFor="oralHabits" className={labelClass}>
              Hábitos orales (uno por línea)
            </label>
            <textarea
              id="oralHabits"
              rows={3}
              value={stringArrayToText(formData.oralHabits)}
              onChange={(e) => handleArrayChange('oralHabits', e.target.value)}
              placeholder="Ninguno registrado"
              className={textareaClass}
            />
          </div>

          <div>
            <label htmlFor="clinicalNotes" className={labelClass}>
              Notas clínicas
            </label>
            <textarea
              id="clinicalNotes"
              rows={3}
              value={formData.clinicalNotes ?? ''}
              onChange={(e) => handleTextChange('clinicalNotes', e.target.value)}
              placeholder="Sin notas registradas"
              className={textareaClass}
            />
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar historia'}
        </button>
      </div>
    </form>
  );
}
