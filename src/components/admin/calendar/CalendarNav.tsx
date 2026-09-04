type CalendarNavProps = {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
};

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export function CalendarNav({ year, month, onChange }: CalendarNavProps) {
  function goPrevious() {
    if (month === 1) {
      onChange(year - 1, 12);
    } else {
      onChange(year, month - 1);
    }
  }

  function goNext() {
    if (month === 12) {
      onChange(year + 1, 1);
    } else {
      onChange(year, month + 1);
    }
  }

  const yearOptions = Array.from({ length: 21 }, (_, i) => year - 10 + i);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={goPrevious}
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        aria-label="Mes anterior"
      >
        Anterior
      </button>

      <span className="min-w-[8rem] text-center text-base font-semibold text-gray-900">
        {MONTH_NAMES[month - 1]} {year}
      </span>

      <button
        type="button"
        onClick={goNext}
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        aria-label="Mes siguiente"
      >
        Siguiente
      </button>

      <label className="sr-only" htmlFor="calendar-year">
        Año
      </label>
      <select
        id="calendar-year"
        value={year}
        onChange={(e) => onChange(parseInt(e.target.value, 10), month)}
        className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700"
        aria-label="Año"
      >
        {yearOptions.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
