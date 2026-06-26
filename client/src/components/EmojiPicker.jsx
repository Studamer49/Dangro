import React, { useState } from "react";

const EMOJIS = [
  "😀","😁","😂","🤣","😃","😄","😅","😆","😉","😊","😋","😎","😍","😘","🥰","😗","😙","😚","🙂","🤗","🤩","🤔","🤨","😐","😑","😶","🙄","😏","😣","😥","😮","🤐","😯","😪","😫","😴","😌","😛","😜","😝","🤤","😒","😓","😔","😕","🙃","🤑","😲","☹️","🙁","😖","😞","😟","😤","😢","😭","😦","😧","😨","😩","🤯","😬","😰","😱","🥵","🥶","😳","🤪","😵","😡","😠","🤬","👍","👎","👊","✊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✌️","🤟","🤘","👌","💪","❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💕","💞","💗","💖","💘","💝","💟","❣️","💌","💔","🔥","⭐","🌟","✨","💫","🎉","🎊","🎈","🎁","🎀","🏆","🥇","🥈","🥉","🏅","🎯","🎮","🎲","♟️","🎰","🎭","🎨","🎬","🎤","🎧","🎼","🎹","🥁","🎷","🎺","🎸","🎻","🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🚚","🚛","🚜","✈️","🚀","🛸","🏠","🏡","🏢","🏬","🏣","🏤","🏥","🏦","🏪","🏫","🏩","💒","🏛️","⛪","🕌","🕍","🕋","⛩️","🎠","🎡","🎢","🎪","🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🥦","🥬","🥒","🌽","🥕","🥔","🍠","🥐","🍞","🥖","🥨","🧀","🥚","🍳","🥞","🧇","🥓","🥩","🍗","🍖","🌭","🍔","🍟","🍕","🥪","🥙","🌮","🌯","🥘","🍝","🍜","🍲","🍛","🍣","🍱","🥟","🍤","🍙","🍚","🍘","🍥","🍧","🍨","🍦","🥧","🧁","🍰","🎂","🍮","🍭","🍬","🍫","🍿","🍩","🍪","🌰","🥜","☕","🍵","🧃","🥤","🧋","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🍾","🌸","💮","🏵️","🌹","🥀","🌺","🌻","🌼","🌷","🌱","🌿","☘️","🍀","🍃","🍂","🍁","🌾","💐","🌲","🌳","🌴","🌵","🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐴","🦄","🐝","🦋","🐌","🐞","🐢","🐍","🦎","🐙","🐠","🐟","🐬","🐳","🐋","🦈","🌞","🌝","🌛","🌜","🌚","🌕","🌖","🌗","🌘","🌑","🌒","🌓","🌔","🌙","🌎","🌍","🌏","⭐","🌟","✨","☀️","🌤️","⛅","🌥️","☁️","🌦️","🌧️","⛈️","🌩️","🌨️","❄️","☃️","⛄","🌊",
];

const CATEGORIES = [
  { id: "smileys", label: "😀", filter: e => /[\u{1F600}-\u{1F64F}]/u.test(e) || EMOJIS.indexOf(e) < 72 },
  { id: "gestures", label: "👍", filter: e => ["👍","👎","👊","✊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✌️","🤟","🤘","👌","💪","👋","🤚","🖐️","✋","🖖","👈","👉","👆","👇","☝️","✍️","🤳","💅","🦵","🦶"].includes(e) },
  { id: "food", label: "🍔", filter: e => /[\u{1F32D}-\u{1F37F}]/u.test(e) || /[\u{1F950}-\u{1F96F}]/u.test(e) || /[\u{1F980}-\u{1F9C0}]/u.test(e) || e === "☕" || e === "🍿" },
  { id: "nature", label: "🌿", filter: e => /[\u{1F300}-\u{1F32F}]/u.test(e) || /[\u{1F330}-\u{1F37F}]/u.test(e) || /[\u{1F400}-\u{1F4FF}]/u.test(e) },
  { id: "objects", label: "💻", filter: e => /[\u{1F4A0}-\u{1F4FF}]/u.test(e) || /[\u{1F500}-\u{1F5FF}]/u.test(e) || /[\u{1F600}-\u{1F7FF}]/u.test(e) },
  { id: "symbols", label: "❤️", filter: e => /[\u{1F300}-\u{1F5FF}]/u.test(e) || /[\u{2600}-\u{27BF}]/u.test(e) || /[\u{1F900}-\u{1F9FF}]/u.test(e) || /[\u{1FA00}-\u{1FA6F}]/u.test(e) },
  { id: "flags", label: "🚩", filter: e => e.length >= 2 && e.codePointAt(0) >= 127462 && e.codePointAt(0) <= 127487 },
];

export default function EmojiPicker({ onSelect, onClose }) {
  const [activeCat, setActiveCat] = useState("smileys");
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? EMOJIS.filter(e => e.toLowerCase().includes(search.toLowerCase()))
    : EMOJIS.filter(CATEGORIES.find(c => c.id === activeCat)?.filter || (() => true));

  return (
    <div className="emoji-picker" onClick={(e) => e.stopPropagation()}>
      <div className="emoji-picker-tabs">
        {CATEGORIES.map(cat => (
          <button key={cat.id} className={"emoji-cat-btn" + (activeCat === cat.id ? " active" : "")}
            onClick={() => setActiveCat(cat.id)}>
            {cat.label}
          </button>
        ))}
      </div>
      <div className="emoji-picker-search">
        <input type="text" placeholder="Search emojis..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="emoji-picker-grid">
        {filtered.slice(0, 200).map((emoji, i) => (
          <span key={i} className="emoji-item" onClick={() => { onSelect(emoji); onClose(); }}>
            {emoji}
          </span>
        ))}
      </div>
    </div>
  );
}
