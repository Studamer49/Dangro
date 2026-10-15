import { dayLabel } from "@/lib/time";

/**
 * The date rule that breaks a chat thread into days, Discord-style: a hairline
 * either side of a small centred label.
 */
export default function ChatDayDivider({ iso }: { iso: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-3" role="separator" aria-label={dayLabel(iso)}>
      <div className="h-px flex-1 bg-gray-700/60" />
      <span className="tabular text-xs font-semibold text-gray-400">{dayLabel(iso)}</span>
      <div className="h-px flex-1 bg-gray-700/60" />
    </div>
  );
}
