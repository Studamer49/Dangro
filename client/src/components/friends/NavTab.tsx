interface NavTabProps {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}

/**
 * A section of the Friends nav column.
 *
 * The active tab is a lit accent pill (`row-active`) rather than a filled block,
 * which keeps "you are here" readable against the glass column without adding
 * another opaque rectangle to an already translucent layout. The count moves
 * out of the label into its own badge — `tabular` so it stops jittering as it
 * ticks up — and it only appears when there is something to count.
 */
export default function NavTab({ label, active, count = 0, onClick }: NavTabProps) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-all duration-200 ${
        active
          ? "row-active font-semibold"
          : "font-medium text-gray-400 hover:bg-gray-800/60 hover:text-gray-100"
      }`}
    >
      <span className="truncate">{label}</span>

      {count > 0 && (
        <span
          className={`tabular rounded-md px-1.5 py-0.5 text-[11px] font-bold leading-none transition-colors duration-200 ${
            active
              ? "bg-white/15 text-white"
              : "bg-gray-800/70 text-gray-500 group-hover:text-gray-300"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}