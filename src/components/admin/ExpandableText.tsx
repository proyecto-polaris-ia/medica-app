'use client';

import { useState } from 'react';

type ExpandableTextProps = {
  /** Texto del campo; `null` se renderiza como fallback. */
  text: string | null;
  /** Longitud máxima antes de truncar. Por defecto 150 caracteres. */
  maxLength?: number;
  /** Texto a mostrar cuando `text` es `null`. Por defecto '—'. */
  fallback?: string;
};

/**
 * Muestra un texto de la nota SOAP truncado a `maxLength` caracteres con un
 * botón "Ver más"/"Ver menos". El estado es local a cada instancia, así que
 * cada campo (y cada nota) expande de forma independiente.
 */
export function ExpandableText({
  text,
  maxLength = 150,
  fallback = '—',
}: ExpandableTextProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (text === null || text.length <= maxLength) {
    return <span>{text ?? fallback}</span>;
  }

  const truncated = `${text.slice(0, maxLength)}...`;

  return (
    <span>
      {isExpanded ? text : truncated}
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((prev) => !prev)}
        className="ml-2 text-sm font-medium text-blue-600 hover:text-blue-800"
      >
        {isExpanded ? 'Ver menos' : 'Ver más'}
      </button>
    </span>
  );
}
