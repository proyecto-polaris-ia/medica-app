import { getCalendarGrid } from '@/lib/admin/timezone';
import type { CalendarBlock } from '@/lib/admin/timezone';
import { DayCell } from './DayCell';

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

type MonthCalendarProps = {
  year: number;
  month: number;
  blocksByDay: Record<string, CalendarBlock[]>;
  onSelectBlock: (id: string) => void;
};

export function MonthCalendar({
  year,
  month,
  blocksByDay,
  onSelectBlock,
}: MonthCalendarProps) {
  const grid = getCalendarGrid(year, month);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 grid grid-cols-7 gap-0">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            data-testid="weekday-label"
            className="py-2 text-center text-xs font-semibold uppercase tracking-wider text-gray-500"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0 border-b border-r border-gray-200">
        {grid.map((cell, index) => (
          <DayCell
            key={index}
            day={cell.day}
            inMonth={cell.inMonth}
            blocks={cell.dayKey ? blocksByDay[cell.dayKey] ?? [] : []}
            onSelectBlock={onSelectBlock}
          />
        ))}
      </div>
    </div>
  );
}
