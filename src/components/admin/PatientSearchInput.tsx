'use client';

import { useEffect, useId, useRef, useState } from 'react';

export type PatientOption = { id: string; name: string };

type PatientSearchInputProps = {
  value: PatientOption | null;
  onChange: (selection: PatientOption | null) => void;
  label?: string;
  className?: string;
  minChars?: number;
  debounceMs?: number;
};

const DEFAULT_MIN_CHARS = 2;
const DEFAULT_DEBOUNCE_MS = 300;

// Clases del panel de filtros (mismas que el resto de los controles).
const INPUT_CLASSES =
  'mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 pr-8 text-sm';

type Segment = { text: string; match: boolean };

type ApiPatient = { id: string; fullName: string };

// URL de consulta del endpoint de pacientes (contrato vigente, sin cambios).
export function patientsSearchUrl(term: string): string {
  return `/api/admin/patients?q=${encodeURIComponent(term)}`;
}

// Próximo índice activo sin ciclado en los extremos (D9).
export function nextActiveIndex(
  current: number | null,
  direction: 1 | -1,
  length: number
): number {
  if (direction === 1) {
    return current === null ? 0 : Math.min(current + 1, length - 1);
  }
  return current === null ? length - 1 : Math.max(current - 1, 0);
}

// Segmenta el nombre en [antes, coincidencia, después]. Si el término no
// aparece literalmente (coincidencia por teléfono/correo) devuelve un solo
// segmento sin resaltar, de modo que la opción se muestre en texto plano.
export function highlightSegments(name: string, term: string): Segment[] {
  const needle = term.trim().toLowerCase();
  if (needle.length === 0) return [{ text: name, match: false }];

  const index = name.toLowerCase().indexOf(needle);
  if (index === -1) return [{ text: name, match: false }];

  const before = name.slice(0, index);
  const match = name.slice(index, index + needle.length);
  const after = name.slice(index + needle.length);

  const segments: Segment[] = [];
  if (before.length > 0) segments.push({ text: before, match: false });
  segments.push({ text: match, match: true });
  if (after.length > 0) segments.push({ text: after, match: false });
  return segments;
}

export function PatientSearchInput({
  value,
  onChange,
  label = 'Paciente',
  className,
  minChars = DEFAULT_MIN_CHARS,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: PatientSearchInputProps) {
  const inputId = useId();
  const labelId = `${inputId}-label`;
  const listboxId = `${inputId}-listbox`;
  const optionId = (index: number) => `${inputId}-option-${index}`;

  const [query, setQuery] = useState(value?.name ?? '');
  const [options, setOptions] = useState<PatientOption[]>([]);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedTerm, setSearchedTerm] = useState<string | null>(null);
  // Distingue las emisiones propias (selección) de los resets externos
  // ("Limpiar filtros") para no pisar el tecleo ni crear un ciclo padre↔hijo.
  // `undefined` = aún no hubo emisión; `null` = se emitió una limpieza.
  const lastEmittedIdRef = useRef<string | null | undefined>(undefined);

  const term = query.trim();
  const showPanel = focused && open && options.length > 0;
  const showNoMatches =
    focused &&
    !loading &&
    !error &&
    term.length >= minChars &&
    searchedTerm === term &&
    options.length === 0;

  // Sincronización externa (D17): adopta el valor del padre solo cuando cambió
  // respecto a la última emisión propia.
  useEffect(() => {
    const incomingId = value?.id ?? null;
    if (incomingId === lastEmittedIdRef.current) return;
    setQuery(value?.name ?? '');
    setOptions([]);
    setOpen(false);
    setActiveIndex(null);
    setError(null);
    setSearchedTerm(null);
  }, [value]);

  // Búsqueda progresiva (D2, D3, D4): umbral, debounce y descarte de respuestas
  // obsoletas con AbortController.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < minChars) {
      setOptions([]);
      setOpen(false);
      setActiveIndex(null);
      setError(null);
      setLoading(false);
      setSearchedTerm(null);
      return;
    }

    setLoading(true);
    setError(null);
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(patientsSearchUrl(trimmed), {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        if (!res.ok) {
          setError(
            res.status === 401
              ? 'Tu sesión expiró. Inicia sesión de nuevo.'
              : 'No se pudieron buscar los pacientes.'
          );
          setOptions([]);
          setOpen(false);
          setActiveIndex(null);
          setSearchedTerm(trimmed);
          return;
        }

        const data = (await res.json()) as { patients?: ApiPatient[] };
        if (controller.signal.aborted) return;

        const list = (data.patients ?? []).map((patient) => ({
          id: patient.id,
          name: patient.fullName,
        }));
        setOptions(list);
        setSearchedTerm(trimmed);
        setActiveIndex(null);
        setOpen(list.length > 0);
      } catch {
        if (controller.signal.aborted) return;
        setError('No se pudieron buscar los pacientes.');
        setOptions([]);
        setOpen(false);
        setActiveIndex(null);
        setSearchedTerm(trimmed);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, minChars, debounceMs]);

  function selectOption(option: PatientOption) {
    lastEmittedIdRef.current = option.id;
    setQuery(option.name);
    setOptions([]);
    setOpen(false);
    setActiveIndex(null);
    setError(null);
    setSearchedTerm(null);
    onChange(option);
  }

  function clearSelection() {
    lastEmittedIdRef.current = null;
    setQuery('');
    setOptions([]);
    setOpen(false);
    setActiveIndex(null);
    setError(null);
    setSearchedTerm(null);
    onChange(null);
  }

  function handleChange(next: string) {
    setQuery(next);
    setActiveIndex(null);
    setOpen(false);
    // Editar tras una selección desincroniza el filtro aplicado del texto
    // visible: se emite `null` antes de buscar el texto nuevo (D13).
    if (value && next !== value.name) {
      lastEmittedIdRef.current = null;
      onChange(null);
    }
  }

  function handleFocus() {
    setFocused(true);
    if (options.length > 0 && term.length >= minChars) {
      setOpen(true);
    }
  }

  function handleBlur() {
    setFocused(false);
    setOpen(false);
    setActiveIndex(null);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      if (options.length === 0) return;
      event.preventDefault();
      if (!showPanel) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      setActiveIndex((prev) => nextActiveIndex(prev, 1, options.length));
      return;
    }

    if (event.key === 'ArrowUp') {
      if (!showPanel) return;
      event.preventDefault();
      setActiveIndex((prev) => nextActiveIndex(prev, -1, options.length));
      return;
    }

    if (event.key === 'Enter') {
      if (showPanel && activeIndex !== null && options[activeIndex]) {
        event.preventDefault();
        selectOption(options[activeIndex]);
      }
      return;
    }

    if (event.key === 'Escape') {
      if (showPanel) {
        event.preventDefault();
        setOpen(false);
        setActiveIndex(null);
      }
    }
  }

  return (
    <div>
      <label
        id={labelId}
        htmlFor={inputId}
        className="block text-xs font-medium text-gray-600"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            showPanel && activeIndex !== null ? optionId(activeIndex) : undefined
          }
          aria-labelledby={labelId}
          value={query}
          placeholder="Buscar paciente…"
          onChange={(event) => handleChange(event.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={[INPUT_CLASSES, className].filter(Boolean).join(' ')}
        />
        {query !== '' && (
          <button
            type="button"
            aria-label="Limpiar paciente"
            onMouseDown={(event) => event.preventDefault()}
            onClick={clearSelection}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        )}
        {showPanel && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Sugerencias de pacientes"
            className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg"
          >
            {options.map((option, index) => (
              <li
                key={option.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
              >
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOption(option)}
                  className={[
                    'w-full px-3 py-2 text-left text-sm hover:bg-gray-50',
                    index === activeIndex ? 'bg-gray-100' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {highlightSegments(option.name, term).map((segment, segmentIndex) => (
                    <span
                      key={segmentIndex}
                      className={segment.match ? 'font-semibold text-blue-700' : undefined}
                    >
                      {segment.text}
                    </span>
                  ))}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {loading && (
        <p role="status" className="mt-1 text-xs text-gray-500">
          Buscando…
        </p>
      )}
      {error && (
        <p role="status" aria-live="polite" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
      {showNoMatches && (
        <p className="mt-1 text-xs text-gray-500">Sin coincidencias</p>
      )}
    </div>
  );
}
