'use client';

import { useState } from 'react';
import type { Patient } from '@/lib/admin/types';
import { ErrorState } from '@/components/admin/ErrorState';

type PatientDataTabProps = {
  patient: Patient;
  onPatientUpdated: (patient: Patient) => void;
};

const SEX_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '—' },
  { value: 'male', label: 'Masculino' },
  { value: 'female', label: 'Femenino' },
  { value: 'other', label: 'Otro' },
];

export function PatientDataTab({ patient, onPatientUpdated }: PatientDataTabProps) {
  const [formData, setFormData] = useState<Patient>(patient);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(field: keyof Patient, value: string | null) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/patients/${patient.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: formData.fullName,
          phoneE164: formData.phoneE164,
          email: formData.email,
          notes: formData.notes,
          birthDate: formData.birthDate,
          sex: formData.sex,
          address: formData.address,
          occupation: formData.occupation,
          referralSource: formData.referralSource,
          secondaryPhone: formData.secondaryPhone,
          emergencyContactName: formData.emergencyContactName,
          emergencyContactPhone: formData.emergencyContactPhone,
          emergencyContactRelationship: formData.emergencyContactRelationship,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al guardar los datos');
      }

      const data = await res.json();
      onPatientUpdated(data.patient);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
  const labelClass = 'block text-sm font-medium text-gray-700';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <ErrorState message={error} />}

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Datos de identificación</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="fullName" className={labelClass}>
              Nombre completo
            </label>
            <input
              id="fullName"
              type="text"
              value={formData.fullName}
              onChange={(e) => handleChange('fullName', e.target.value)}
              className={inputClass}
              required
            />
          </div>

          <div>
            <label htmlFor="phoneE164" className={labelClass}>
              Teléfono
            </label>
            <input
              id="phoneE164"
              type="tel"
              value={formData.phoneE164 ?? ''}
              onChange={(e) => handleChange('phoneE164', e.target.value || null)}
              placeholder="Sin registrar"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="email" className={labelClass}>
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              value={formData.email ?? ''}
              onChange={(e) => handleChange('email', e.target.value || null)}
              placeholder="Sin registrar"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="birthDate" className={labelClass}>
              Fecha de nacimiento
            </label>
            <input
              id="birthDate"
              type="date"
              value={formData.birthDate ? formData.birthDate.slice(0, 10) : ''}
              onChange={(e) => handleChange('birthDate', e.target.value || null)}
              placeholder="Sin registrar"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="sex" className={labelClass}>
              Sexo
            </label>
            <select
              id="sex"
              value={formData.sex ?? ''}
              onChange={(e) =>
                handleChange('sex', e.target.value === '' ? null : e.target.value)
              }
              className={inputClass}
            >
              {SEX_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="occupation" className={labelClass}>
              Ocupación
            </label>
            <input
              id="occupation"
              type="text"
              value={formData.occupation ?? ''}
              onChange={(e) => handleChange('occupation', e.target.value || null)}
              placeholder="Sin registrar"
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Dirección y contacto</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="address" className={labelClass}>
              Dirección
            </label>
            <input
              id="address"
              type="text"
              value={formData.address ?? ''}
              onChange={(e) => handleChange('address', e.target.value || null)}
              placeholder="Sin registrar"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="secondaryPhone" className={labelClass}>
              Teléfono secundario
            </label>
            <input
              id="secondaryPhone"
              type="tel"
              value={formData.secondaryPhone ?? ''}
              onChange={(e) => handleChange('secondaryPhone', e.target.value || null)}
              placeholder="Sin registrar"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="referralSource" className={labelClass}>
              Referido por
            </label>
            <input
              id="referralSource"
              type="text"
              value={formData.referralSource ?? ''}
              onChange={(e) => handleChange('referralSource', e.target.value || null)}
              placeholder="Sin registrar"
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Contacto de emergencia</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="emergencyContactName" className={labelClass}>
              Nombre
            </label>
            <input
              id="emergencyContactName"
              type="text"
              value={formData.emergencyContactName ?? ''}
              onChange={(e) =>
                handleChange('emergencyContactName', e.target.value || null)
              }
              placeholder="Sin registrar"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="emergencyContactPhone" className={labelClass}>
              Teléfono
            </label>
            <input
              id="emergencyContactPhone"
              type="tel"
              value={formData.emergencyContactPhone ?? ''}
              onChange={(e) =>
                handleChange('emergencyContactPhone', e.target.value || null)
              }
              placeholder="Sin registrar"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="emergencyContactRelationship" className={labelClass}>
              Parentesco
            </label>
            <input
              id="emergencyContactRelationship"
              type="text"
              value={formData.emergencyContactRelationship ?? ''}
              onChange={(e) =>
                handleChange('emergencyContactRelationship', e.target.value || null)
              }
              placeholder="Sin registrar"
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Notas</h3>
        <div>
          <label htmlFor="notes" className={labelClass}>
            Notas generales
          </label>
          <textarea
            id="notes"
            rows={4}
            value={formData.notes ?? ''}
            onChange={(e) => handleChange('notes', e.target.value || null)}
            placeholder="Sin notas registradas"
            className={inputClass}
          />
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar datos'}
        </button>
      </div>
    </form>
  );
}
