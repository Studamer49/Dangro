import { useMemo, useState } from "react";
import Emoji from "@/components/Emoji";

/**
 * A self-contained, dependency-free emoji picker. The app already avoids
 * pulling in heavyweight pickers, and a curated set is enough for reactions,
 * so this ships the data inline and renders a tabbed, searchable grid.
 */
interface EmojiCategory {
  name: string;
  icon: string;
  emojis: string[];
}

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    name: "Smileys",
    icon: "😀",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇",
      "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚",
      "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🥳",
      "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "😣", "😖", "😫",
      "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳",
      "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭",
      "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧",
      "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢",
      "🤮", "🤧", "😷", "🤒", "🤕",
    ],
  },
  {
    name: "Gestures",
    icon: "👋",
    emojis: [
      "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤏", "✌️", "🤞", "🤟",
      "🤘", "🤙", "👈", "👉", "👆", "👇", "☝️", "👍", "👎", "✊",
      "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️",
      "💅", "🤳", "💪", "🦾", "🦵", "🦶", "👂", "👃", "👀", "👁️",
      "👅", "👄",
    ],
  },
  {
    name: "Hearts",
    icon: "❤️",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
      "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "♥️",
      "💋", "💌",
    ],
  },
  {
    name: "Animals",
    icon: "🐶",
    emojis: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯",
      "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🐤", "🦆",
      "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🐛", "🦋",
      "🐌", "🐞", "🐢", "🐍", "🦎", "🐙", "🦑", "🦀", "🐠", "🐟",
      "🐬", "🐳", "🐋", "🦈", "🐊", "🐅", "🐆", "🦓", "🦍", "🐘",
      "🦏", "🐪", "🦒",
    ],
  },
  {
    name: "Food",
    icon: "🍔",
    emojis: [
      "🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐",
      "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🥑", "🥦",
      "🥕", "🌽", "🌶️", "🥒", "🥬", "🧄", "🧅", "🍄", "🥜", "🍞",
      "🥐", "🥖", "🥨", "🧀", "🥚", "🍳", "🥞", "🧇", "🥓", "🍔",
      "🍟", "🍕", "🌭", "🥪", "🌮", "🌯", "🥗", "🍿", "🧈", "🍫",
      "🍬", "🍭", "🍩", "🍪", "🎂", "🍰", "🧁", "🍦",
    ],
  },
  {
    name: "Activity",
    icon: "⚽",
    emojis: [
      "⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱",
      "🏓", "🏸", "🥅", "⛳", "🏌️", "🏄", "🏊", "🤽", "🚣", "🧗",
      "🚴", "🚵", "🎿", "⛷️", "🏂", "🛹", "🏋️", "🤸", "🤼", "🤺",
      "🤾", "🏇", "🧘", "🏆", "🥇", "🥈", "🥉", "🎖️", "🏅", "🎗️",
      "🎫", "🎟️", "🎪", "🤹", "🎭", "🎨", "🎬", "🎤", "🎧", "🎼",
      "🎹", "🥁", "🎷", "🎺", "🎸", "🎻",
    ],
  },
  {
    name: "Objects",
    icon: "💡",
    emojis: [
      "🔥", "💧", "✨", "⭐", "🌟", "💫", "⚡", "💥", "☄️", "🎉",
      "🎊", "🎈", "🎁", "🎀", "🔔", "🔕", "📣", "📢", "💬", "💭",
      "🗯️", "📱", "💻", "⌨️", "🖥️", "🖨️", "🖱️", "💾", "💿", "📷",
      "📸", "🎥", "📹", "🔍", "🔎", "💡", "🔦", "🕯️", "💸", "💵",
      "💰", "💳", "💎", "⚖️", "🔧", "🔨", "⚒️", "🛠️", "⛏️", "🔩",
      "⚙️", "🧲", "🔫", "💣", "🔪", "🗡️", "🛡️", "🔮", "📿", "🧿",
      "💊", "💉", "🩸", "🩹", "🩺", "🌡️", "🧹", "🧺", "🧻", "🚿",
      "🛁", "🧼", "🪒", "🧽", "🧴", "🔑", "🗝️", "🚪", "🪑", "🛋️",
      "🖼️", "🛍️", "🛒", "🧧",
    ],
  },
  {
    name: "Symbols",
    icon: "✅",
    emojis: [
      "✅", "❌", "❎", "➕", "➖", "➗", "✖️", "♾️", "💯", "🔢",
      "🔤", "🔡", "🔠", "❓", "❔", "‼️", "⁉️", "❗", "❕", "💲",
      "💱", "♻️", "©️", "®️", "™️", "☑️", "✔️", "🔘", "🔴", "🟠",
      "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🟤", "🔺", "🔻", "🔸",
      "🔹", "🔶", "🔷", "🔳", "🔲", "▪️", "▫️", "◾", "◽", "◼️",
      "◻️", "🟥", "🟧", "🟨", "🟩", "🟦", "🟪", "⬛", "⬜", "🟫",
      "🔀", "🔁", "🔂", "🔄", "🔃", "🔆", "🔅", "🎵", "🎶", "✳️",
      "✴️", "❇️",
    ],
  },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  /** Max height of the scrolling grid, in pixels. */
  maxHeight?: number;
  className?: string;
}

export default function EmojiPicker({ onSelect, maxHeight = 208, className = "" }: EmojiPickerProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(EMOJI_CATEGORIES[0].name);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const results: string[] = [];
    const seen = new Set<string>();
    for (const cat of EMOJI_CATEGORIES) {
      for (const emoji of cat.emojis) {
        if (seen.has(emoji)) continue;
        seen.add(emoji);
        results.push(emoji);
      }
    }
    // Simple substring match over glyphs; can be expanded later.
    return results.filter((emoji) => emoji.includes(q)).slice(0, 200);
  }, [query]);

  const showSearchResults = filtered !== null;
  const category = useMemo(
    () => EMOJI_CATEGORIES.find((c) => c.name === active) ?? EMOJI_CATEGORIES[0],
    [active]
  );

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
        {(showSearchResults ? filtered ?? [] : category.emojis).map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onSelect(emoji)}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
          >
            <Emoji emoji={emoji} className="h-6 w-6" />
          </button>
        ))}
      </div>
    </div>
  );
}
