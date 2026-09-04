import type { CalendarBlock } from '@/lib/admin/timezone';
import { FALLBACK_COLOR } from '@/lib/admin/timezone';

const DIMMED_STATUSES = new Set(['cancelled', 'no_show']);
const MAX_VISIBLE_BLOCKS = 4;

type DayCellProps = {
  day: number;
  inMonth: boolean;
  blocks: CalendarBlock[];
  onSelectBlock: (id: string) => void;
};

export function DayCell({ day, inMonth, blocks, onSelectBlock }: DayCellProps) {
  const visibleBlocks = blocks.slice(0, MAX_VISIBLE_BLOCKS);
  const overflowCount = blocks.length - visibleBlocks.length;

  if (!inMonth) {
    return (
      <div
        data-testid="calendar-day-padding"
        className="min-h-[6rem] bg-gray-50/50"
      />
    );
  }

  return (
    <div
      data-testid="calendar-day"
      className="flex min-h-[6rem] flex-col border-t border-l border-gray-200 bg-white p-1"
    >
      <span className="mb-1 text-xs font-medium text-gray-700">{day}</span>
      <div className="flex flex-1 flex-col gap-1">
        {visibleBlocks.map((block) => (
          <button
            key={block.id}
            type="button"
            onClick={() => onSelectBlock(block.id)}
            style={{ backgroundColor: block.color || FALLBACK_COLOR }}
            className={[
              'rounded px-1.5 py-0.5 text-left text-xs text-white',
              DIMMED_STATUSES.has(block.status) ? 'opacity-50' : '',
            ].join(' ')}
            aria-label={`${block.startLabel} ${block.label}`}
          >
            <span className="font-medium">{block.startLabel}</span>{' '}
            <span className="truncate">{block.label}</span>
          </button>
        ))}
        {overflowCount > 0 && (
          <span className="text-xs text-gray-500">+{overflowCount} más</span>
        )}
      </div>
    </div>
  );
}
