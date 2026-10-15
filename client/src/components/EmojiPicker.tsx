import { useMemo, useState } from "react";
import Emoji from "@/components/Emoji";
import { EMOJI_CATEGORIES, searchEmojis } from "@/lib/emojiData";

/**
 * A self-contained, dependency-free emoji picker. The app already avoids
 * pulling in heavyweight pickers, and a curated set is enough for reactions,
 * so this ships the data inline and renders a tabbed, searchable grid.
 */
interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  /** Max height of the scrolling grid, in pixels. */
  maxHeight?: number;
  className?: string;
}

export default function EmojiPicker({ onSelect, maxHeight = 208, className = "" }: EmojiPickerProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(EMOJI_CATEGORIES[0].name);

  const filtered = useMemo(() => searchEmojis(query), [query]);

  const showSearchResults = query.trim().length > 0;
  const category = useMemo(
    () => EMOJI_CATEGORIES.find((c) => c.name === active) ?? EMOJI_CATEGORIES[0],
    [active]
  );

  const results = showSearchResults ? filtered : category.emojis;

  return (
    <div className={`flex w-full flex-col ${className}`}>
      <div className="px-1 pb-1">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emojis"
          className="field h-8 rounded-lg px-2 text-xs"
          aria-label="Search emojis"
        />
      </div>
      {!showSearchResults && (
        <div className="flex items-center gap-0.5 px-1 pb-1.5 pt-1">
          {EMOJI_CATEGORIES.map((c) => (
            <button
              key={c.name}
              type="button"
              title={c.name}
              onClick={() => setActive(c.name)}
              className={`flex h-7 w-7 items-center justify-center rounded-lg text-base transition-colors ${
                active === c.name ? "bg-white/10" : "hover:bg-white/5"
              }`}
            >
              <Emoji emoji={c.icon} className="h-5 w-5" decorative />
            </button>
          ))}
        </div>
      )}

      <div
        className="grid grid-cols-8 gap-0.5 overflow-y-auto px-1 pb-1"
        style={{ maxHeight }}
      >
        {results.map((entry) => (
          <button
            key={entry.n}
            type="button"
            title={`:${entry.n}:`}
            onClick={() => onSelect(entry.e)}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
          >
            <Emoji emoji={entry.e} className="h-6 w-6" />
          </button>
        ))}
        {showSearchResults && results.length === 0 && (
          <p className="col-span-8 px-1 py-4 text-center text-xs text-gray-500">
            No emojis found
          </p>
        )}
      </div>
    </div>
  );
}
