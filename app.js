const EMOJIS = ["😀","😃","😄","😁","😅","😂","🤣","☺️","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🤨","😐","😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🥴","😵","🤯","🤠","🥳","🥺","😢","😭","😤","😡","🤬","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","👾","🤖","😺","😸","😹","😻","😼","😽","🙀","😿","😾","💋","👋","🤚","🖐️","✋","🖖","👌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍️","💅","🤳","💪","🦵","🦶","👂","🦻","👃","🧠","🦷","🦴","👀","👁️","👅","👄","👶","🧒","👦","👧","🧑","👨","👩","🧔","👨‍🦰","👨‍🦱","👨‍🦳","👨‍🦲","👩‍🦰","👩‍🦱","👩‍🦳","👩‍🦲","🧑‍🦰","🧑‍🦱","🧑‍🦳","🧑‍🦲","👱","👱‍♂️","👱‍♀️","🧓","👴","👵","🙍","🙍‍♂️","🙍‍♀️","🙎","🙎‍♂️","🙎‍♀️","🙅","🙅‍♂️","🙅‍♀️","🙆","🙆‍♂️","🙆‍♀️","💁","💁‍♂️","💁‍♀️","🙋","🙋‍♂️","🙋‍♀️","🧏","🧏‍♂️","🧏‍♀️","🙇","🙇‍♂️","🙇‍♀️","🤦","🤦‍♂️","🤦‍♀️","🤷","🤷‍♂️","🤷‍♀️","👨‍⚕️","👩‍⚕️","👨‍🎓","👩‍🎓","👨‍🏫","👩‍🏫","👨‍⚖️","👩‍⚖️","👨‍🌾","👩‍🌾","👨‍🍳","👩‍🍳","👨‍🔧","👩‍🔧","👨‍🏭","👩‍🏭","👨‍💼","👩‍💼","👨‍🔬","👩‍🔬","👨‍💻","👩‍💻","👨‍🎤","👩‍🎤","👨‍🎨","👩‍🎨","👨‍✈️","👩‍✈️","👨‍🚀","👩‍🚀","👨‍🚒","👩‍🚒","👮","👮‍♂️","👮‍♀️","🕵️","🕵️‍♂️","🕵️‍♀️","💂","💂‍♂️","💂‍♀️","👷","👷‍♂️","👷‍♀️","🤴","👸","👳","👳‍♂️","👳‍♀️","👲","🧕","🤵","🤵‍♂️","🤵‍♀️","👰","👰‍♂️","👰‍♀️","🤰","🤱","👼","🎅","🤶","🧑‍🎄","🦸","🦸‍♂️","🦸‍♀️","🦹","🦹‍♂️","🦹‍♀️","🧙","🧙‍♂️","🧙‍♀️","🧚","🧚‍♂️","🧚‍♀️","🧛","🧛‍♂️","🧛‍♀️","🧜","🧜‍♂️","🧜‍♀️","🧝","🧝‍♂️","🧝‍♀️","🧞","🧞‍♂️","🧞‍♀️","🧟","🧟‍♂️","🧟‍♀️","💏","👩‍❤️‍💋‍👨","👨‍❤️‍💋‍👨","👩‍❤️‍💋‍👩","💑","👩‍❤️‍👨","👨‍❤️‍👨","👩‍❤️‍👩","👪","👨‍👩‍👦","👨‍👩‍👧","👨‍👩‍👧‍👦","👨‍👩‍👦‍👦","👨‍👩‍👧‍👧","👨‍👨‍👦","👨‍👨‍👧","👨‍👨‍👧‍👦","👨‍👨‍👦‍👦","👨‍👨‍👧‍👧","👩‍👩‍👦","👩‍👩‍👧","👩‍👩‍👧‍👦","👩‍👩‍👦‍👦","👩‍👩‍👧‍👧","👨‍👦","👨‍👧","👨‍👧‍👦","👨‍👦‍👦","👨‍👧‍👧","👩‍👦","👩‍👧","👩‍👧‍👦","👩‍👦‍👦","👩‍👧‍👧","🗣️","👤","👥","👣","🧳","🌂","☂️","🧵","🧶","👓","🕶️","🥽","🥼","🦺","👔","👕","👖","🧣","🧤","🧥","🧦","👗","👘","👙","👚","👛","👜","👝","🛍️","🎒","👞","👟","🥾","🥿","👠","👡","👢","👑","👒","🎩","🎓","🧢","⛑️","💄","💍","💎","🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐴","🦄","🐝","🦋","🐌","🐞","🐢","🐍","🦎","🐙","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓","🦍","🐘","🦏","🐪","🐫","🦒","🐃","🐂","🐄","🐎","🐖","🐏","🐑","🐐","🦌","🐕","🐩","🐈","🐓","🦃","🕊️","🐇","🐁","🐀","🐿️","🦔","🐾","🐉","🐲","🌵","🎄","🌲","🌳","🌴","🌱","🌿","☘️","🍀","🎍","🍃","🍂","🍁","🍄","🌾","💐","🌷","🌹","🥀","🌺","🌸","🌼","🌻","🌞","🌝","🌛","🌜","🌚","🌕","🌖","🌗","🌘","🌑","🌒","🌓","🌔","🌙","🌎","🌍","🌏","⭐","🌟","✨","☀️","🌤️","⛅","🌥️","☁️","🌦️","🌧️","⛈️","🌩️","🌨️","❄️","☃️","⛄","🌊","💧","☔","💦","🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🥦","🥬","🥒","🌽","🥕","🥔","🍠","🥐","🍞","🥖","🥨","🧀","🥚","🍳","🥞","🧇","🥓","🥩","🍗","🍖","🌭","🍔","🍟","🍕","🥪","🥙","🌮","🌯","🥘","🍝","🍜","🍲","🍛","🍣","🍱","🥟","🍤","🍙","🍚","🍘","🍥","🥠","🥮","🍡","🍧","🍨","🍦","🥧","🧁","🍰","🎂","🍮","🍭","🍬","🍫","🍿","🍩","🍪","🌰","🥜","☕","🍵","🧃","🥤","🧋","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🍾","🥄","🍴","🍽️","🥣","🥡","🥢","🧂","🎃","🎄","🎆","🎇","✨","🎈","🎉","🎊","🎋","🎍","🎎","🎏","🎐","🎑","🎀","🎁","🎗️","🎟️","🎫","🎖️","🏆","🏅","🥇","🥈","🥉","⚽","⚾","🥎","🏀","🏐","🏈","🏉","🎾","🥏","🎳","🏏","🏑","🏒","🥍","🏓","🏸","🥊","🥋","🎣","🤿","🥅","🎯","🪀","🪁","🔫","🎱","🔮","🎮","🕹️","🎰","🎲","♠️","♥️","♦️","♣️","♟️","🃏","🀄","🎴","🎭","🎨","🧵","🧶","🎬","🎤","🎧","🎼","🎹","🥁","🎷","🎺","🎸","🎻","🎙️","📻","📱","📲","☎️","📞","📟","📠","🔋","🔌","💻","🖥️","🖨️","⌨️","🖱️","🖲️","💽","💾","💿","📀","🎥","🎞️","📽️","🎬","📺","📷","📸","📹","📼","🔍","🔎","🕯️","💡","🔦","🏮","📔","📕","📖","📗","📘","📙","📚","📓","📒","📃","📜","📄","📰","🗞️","📑","🔖","🏷️","💰","💴","💵","💶","💷","💸","💳","🧾","✉️","📧","📨","📩","📤","📥","📦","📫","📪","📬","📭","📮","🗳️","✏️","✒️","🖊️","🖌️","🖍️","📝","📎","🖇️","📐","📏","✂️","🔒","🔓","🔏","🔐","🔑","🗝️","🔨","🪓","⛏️","⚒️","🛠️","🗡️","⚔️","🔫","🏹","🛡️","🔧","🔩","⚙️","🗜️","⚖️","🦯","🔗","⛓️","🧰","🧲","🔮","💊","💉","🩸","🩹","🩺","🚪","🛏️","🛋️","🪑","🚽","🚿","🛁","🧴","🧷","🧹","🧺","🧻","🧼","🧽","🧯","🛒","🚬","⚰️","⚱️","🗿","🏠","🏡","🏢","🏣","🏤","🏥","🏦","🏨","🏩","🏪","🏫","🏬","🏭","🏯","🏰","💒","🗼","🗽","⛪","🕌","🕍","⛩️","🕋","⛲","⛺","🌁","🌃","🏙️","🌄","🌅","🌆","🌇","🌉","🌌","🎠","🎡","🎢","💈","🎪","🎭","🎨","🎰","🚂","🚃","🚄","🚅","🚆","🚇","🚈","🚉","🚊","🚝","🚞","🚋","🚌","🚍","🚎","🚐","🚑","🚒","🚓","🚔","🚕","🚖","🚗","🚘","🚙","🚚","🚛","🚜","🏎️","🏍️","🛵","🛴","🛹","🚲","🛴","🛵","🚏","🛣️","🛤️","⛽","🛳️","⛴️","🛥️","🚢","✈️","🛩️","🛫","🛬","🪂","💺","🚁","🚟","🚠","🚡","🛰️","🚀","🛸","🏠","🏡","🏢","🏣","🏤","🏥","🏦","🏨","🏩","🏪","🏫","🏬","🏭","🏯","🏰","💒","🗼","🗽","⛪","🕌","🕍","⛩️","🕋","⛲","⛺","🌁","🌃","🏙️","🌄","🌅","🌆","🌇","🌉","🌌","🎠","🎡","🎢","💈","🎪","🎭","🎨","🎰","🚂","🚃","🚄","🚅","🚆","🚇","🚈","🚉","🚊","🚝","🚞","🚋","🚌","🚍","🚎","🚐","🚑","🚒","🚓","🚔","🚕","🚖","🚗","🚘","🚙","🚚","🚛","🚜","🏎️","🏍️","🛵","🛴","🛹","🚲","🛴","🛵","🚏","🛣️","🛤️","⛽","🛳️","⛴️","🛥️","🚢","✈️","🛩️","🛫","🛬","🪂","💺","🚁","🚟","🚠","🚡","🛰️","🚀","🛸","⌛","⏳","⏰","⌚","🕰️","🗓️","📅","📆","📇","📋","📉","📊","📈","🔅","🔆","❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💕","💞","💗","💖","💘","💝","💟","❣️","💌","💔","🔥","💫","💥","💢","💨","💦","💤","💪","👊","✊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✌️","🤟","🤘","👌","👈","👉","👆","👇","☝️","✍️","🤳","💅","🦵","🦶","👂","👃","👀","👁️","🧠","🦷","🦴","👅","👄","🇦🇫","🇦🇱","🇩🇿","🇦🇸","🇦🇩","🇦🇴","🇦🇮","🇦🇶","🇦🇬","🇦🇷","🇦🇲","🇦🇼","🇦🇺","🇦🇹","🇦🇿","🇧🇸","🇧🇭","🇧🇩","🇧🇧","🇧🇾","🇧🇪","🇧🇿","🇧🇯","🇧🇲","🇧🇹","🇧🇴","🇧🇦","🇧🇼","🇧🇷","🇧🇳","🇧🇬","🇧🇫","🇧🇮","🇨🇻","🇰🇭","🇨🇲","🇨🇦","🇨🇫","🇹🇩","🇨🇱","🇨🇳","🇨🇴","🇰🇲","🇨🇬","🇨🇩","🇨🇰","🇨🇷","🇭🇷","🇨🇺","🇨🇾","🇨🇿","🇩🇰","🇩🇯","🇩🇲","🇩🇴","🇪🇨","🇪🇬","🇸🇻","🇬🇶","🇪🇷","🇪🇪","🇸🇿","🇪🇹","🇫🇯","🇫🇮","🇫🇷","🇬🇦","🇬🇲","🇬🇪","🇩🇪","🇬🇭","🇬🇷","🇬🇩","🇬🇹","🇬🇳","🇬🇼","🇬🇾","🇭🇹","🇭🇳","🇭🇺","🇮🇸","🇮🇳","🇮🇩","🇮🇷","🇮🇶","🇮🇪","🇮🇱","🇮🇹","🇯🇲","🇯🇵","🇯🇴","🇰🇿","🇰🇪","🇰🇮","🇰🇼","🇰🇬","🇱🇦","🇱🇻","🇱🇧","🇱🇸","🇱🇷","🇱🇾","🇱🇮","🇱🇹","🇱🇺","🇲🇬","🇲🇼","🇲🇾","🇲🇻","🇲🇱","🇲🇹","🇲🇭","🇲🇷","🇲🇺","🇲🇽","🇫🇲","🇲🇩","🇲🇨","🇲🇳","🇲🇪","🇲🇦","🇲🇿","🇲🇲","🇳🇦","🇳🇷","🇳🇵","🇳🇱","🇳🇿","🇳🇮","🇳🇪","🇳🇬","🇳🇴","🇴🇲","🇵🇰","🇵🇼","🇵🇸","🇵🇦","🇵🇬","🇵🇾","🇵🇪","🇵🇭","🇵🇱","🇵🇹","🇶🇦","🇷🇴","🇷🇺","🇷🇼","🇰🇳","🇱🇨","🇻🇨","🇼🇸","🇸🇲","🇸🇹","🇸🇦","🇸🇳","🇷🇸","🇸🇨","🇸🇱","🇸🇬","🇸🇰","🇸🇮","🇸🇧","🇸🇴","🇿🇦","🇰🇷","🇸🇸","🇪🇸","🇱🇰","🇸🇩","🇸🇷","🇸🇪","🇨🇭","🇸🇾","🇹🇼","🇹🇯","🇹🇿","🇹🇭","🇹🇱","🇹🇬","🇹🇴","🇹🇹","🇹🇳","🇹🇷","🇹🇲","🇹🇻","🇺🇬","🇺🇦","🇦🇪","🇬🇧","🇺🇸","🇺🇾","🇺🇿","🇻🇺","🇻🇦","🇻🇪","🇻🇳","🇾🇪","🇿🇲","🇿🇼"];

document.addEventListener("DOMContentLoaded", () => {
  let ws = null;
  let token = localStorage.getItem("dangro_token") || null;
  let currentUser = null;
  let friends = [];
  let pendingRequests = { incoming: [], outgoing: [] };
  let servers = [];
  let groupChats = [];
  let messages = {};
  let allUsers = [];
  let onlineUserIds = new Set();

  let replyTarget = null;
  let msgReplyTarget = null;
  let callInterval = null;
  let callStartTime = null;
  let localStream = null;
  let remoteStream = null;
  let isMicMuted = false;
  let isVideoOff = false;
  let isScreenSharing = false;
  let isVolumeMuted = false;
  let callParticipants = ["You"];
  let callActive = false;
  let currentPeerConnection = null;
  let pendingCallOffer = null;
  let callTargetUserId = null;

  let activeChatType = "channel";
  let activeServerId = null;
  let activeChannelId = null;
  let activeDmFriendId = null;
  let activeGroupChatId = null;
  let activeLeftTab = "youtube-client";
  let activeFriendSubtab = "online";
  let activeNavTab = "servers";
  let friendSearchQuery = "";
  let chatSearchQuery = "";
  let activeYtVideoId = "dQw4w9WgXcQ";
  let leftPanelWidth = 25;
  let rightPanelWidth = 18.75;
  let leftPanelCollapsed = false;
  let rightPanelCollapsed = false;
  let isDraggingLeft = false;
  let isDraggingRight = false;
  let browserHistory = ["https://wikipedia.org"];
  let browserHistoryIndex = 0;
  let appInitialized = false;

  const YT_VIDEOS = [
    { id: "dQw4w9WgXcQ", title: "Rick Astley - Never Gonna Give You Up", channelName: "Official Rick Astley", views: "1.5B views", thumbnail: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&w=400&q=80" },
    { id: "jNQXAC9IVRw", title: "Me at the zoo", channelName: "jawed", views: "330M views", thumbnail: "https://images.unsplash.com/photo-1576828831022-ebd8c0aa6ba4?auto=format&fit=crop&w=400&q=80" },
    { id: "kJQP7kiw5Fk", title: "Luis Fonsi - Despacito", channelName: "LuisFonsiVEVO", views: "8.3B views", thumbnail: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=400&q=80" },
    { id: "9bZkp7q19f0", title: "PSY - GANGNAM STYLE", channelName: "officialpsy", views: "5B views", thumbnail: "https://images.unsplash.com/photo-1571266028243-e4733b0f0bb0?auto=format&fit=crop&w=400&q=80" },
    { id: "JGwWNGJdvx8", title: "Ed Sheeran - Shape of You", channelName: "EdSheeran", views: "6.2B views", thumbnail: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80" }
  ];
  const IG_POSTS = [
    { id: "ig1", username: "dangro_official", avatarColor: "#555", image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80", caption: "Welcome to Dangro! Connect with friends in real-time.", likes: 142, liked: false, comments: [{ username: "user1", text: "Amazing!" }] },
    { id: "ig2", username: "design_hub", avatarColor: "#444", image: "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?auto=format&fit=crop&w=400&q=80", caption: "New UI concepts for 2025 🔥", likes: 89, liked: false, comments: [] },
    { id: "ig3", username: "tech_trends", avatarColor: "#666", image: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=400&q=80", caption: "The future of WebSockets and real-time communication.", likes: 234, liked: true, comments: [{ username: "dev_guy", text: "This is the way." }] }
  ];

  let serverPort = null;

  async function discoverServer() {
    const loc = window.location;
    let basePort = 3000;
    if (loc.protocol !== "file:" && (loc.hostname === "localhost" || loc.hostname === "127.0.0.1")) {
      const parts = loc.host.split(":");
      if (parts.length > 1) basePort = parseInt(parts[1]) || 3000;
    }
    for (let port = basePort; port <= basePort + 10; port++) {
      try {
        const url = loc.protocol + "//localhost:" + port + "/api/health";
        const r = await fetch(url, { signal: AbortSignal.timeout(500) });
        if (r.ok) {
          const data = await r.json();
          if (data.name === "dangro") {
            serverPort = port;
            return loc.protocol + "//localhost:" + port;
          }
        }
      } catch (e) {}
    }
    serverPort = basePort;
    return loc.protocol + "//localhost:" + basePort;
  }

  let serverOrigin = null;
  let wsOrigin = null;

  async function ensureServerOrigin() {
    if (!serverOrigin) {
      serverOrigin = await discoverServer();
      const loc = window.location;
      const proto = loc.protocol === "https:" ? "wss:" : "ws:";
      wsOrigin = proto + "//localhost:" + serverPort;
    }
    return serverOrigin;
  }

  async function apiPost(endpoint, body) {
    const origin = await ensureServerOrigin();
    const url = origin + "/api" + endpoint;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!r.ok && r.headers.get("content-type")?.includes("text/html")) {
      const text = await r.text();
      throw new Error("Server returned " + r.status + " for " + url + ". Is the Dangro Node.js server running on port " + serverPort + "?");
    }
    const text = await r.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error("Server returned " + r.status + " " + r.statusText + " for " + url + ". Response: " + text.substring(0, 120));
    }
  }
  async function apiGet(endpoint) {
    const origin = await ensureServerOrigin();
    const url = origin + "/api" + endpoint;
    const r = await fetch(url);
    const text = await r.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error("Server returned " + r.status + " " + r.statusText + " for " + url + ". Response: " + text.substring(0, 120));
    }
  }

  function showToast(message, type) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast toast-" + type;
    let icon = "⚡";
    if (type === "success") icon = "✓";
    if (type === "error") icon = "✕";
    toast.innerHTML = '<span class="toast-icon">' + icon + '</span><div class="toast-msg">' + message + '</div>';
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("fade-out");
      toast.addEventListener("animationend", () => toast.remove());
    }, 3200);
  }

  function escapeHtml(text) {
    const d = document.createElement("div");
    d.textContent = text;
    return d.innerHTML;
  }

  function getTimestampString() {
    const now = new Date();
    let h = now.getHours();
    const m = now.getMinutes().toString().padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return "Today at " + h + ":" + m + " " + ampm;
  }

  function getActiveChatKey() {
    if (activeChatType === "channel" && activeServerId && activeChannelId) return activeServerId + "_" + activeChannelId;
    if (activeChatType === "dm" && activeDmFriendId) return "dm_" + activeDmFriendId;
    if (activeChatType === "group" && activeGroupChatId) return "group_" + activeGroupChatId;
    return null;
  }

  /* ============ AUTH ============ */
  if (token) {
    document.getElementById("loading-spinner").classList.remove("hidden");
    document.getElementById("login-form").classList.add("hidden");
    verifyToken(token);
  } else {
    showLogin();
  }

  function verifyToken(tok) {
    apiPost("/verify", { token: tok }).then(data => {
      if (data.error) {
        localStorage.removeItem("dangro_token");
        token = null;
        showLogin();
        return;
      }
      currentUser = data.user;
      connectWebSocket(tok);
    }).catch(() => {
      localStorage.removeItem("dangro_token");
      token = null;
      showLogin();
    });
  }

  function showLogin() {
    document.getElementById("loading-spinner").classList.add("hidden");
    document.getElementById("login-form").classList.remove("hidden");
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("app-container").classList.add("hidden");
    setupLogin();
  }

  let isSignupMode = false;

  function setupLogin() {
    const usernameInput = document.getElementById("auth-username");
    const passwordInput = document.getElementById("auth-password");
    const displayInput = document.getElementById("auth-display-name");
    const errorDiv = document.getElementById("auth-error");
    const submitBtn = document.getElementById("btn-auth-submit");
    const toggleBtn = document.getElementById("btn-auth-toggle");
    const toggleMsg = document.getElementById("auth-toggle-msg");
    const subtitle = document.getElementById("login-subtitle");

    toggleBtn.addEventListener("click", () => {
      isSignupMode = !isSignupMode;
      if (isSignupMode) {
        subtitle.textContent = "Create a new account";
        submitBtn.textContent = "Sign Up";
        toggleMsg.textContent = "Already have an account?";
        toggleBtn.textContent = "Log In";
        displayInput.classList.remove("hidden");
      } else {
        subtitle.textContent = "Log in to your account";
        submitBtn.textContent = "Log In";
        toggleMsg.textContent = "Don't have an account?";
        toggleBtn.textContent = "Sign Up";
        displayInput.classList.add("hidden");
      }
      errorDiv.classList.add("hidden");
    });

    submitBtn.addEventListener("click", () => {
      const username = usernameInput.value.trim();
      const password = passwordInput.value.trim();
      if (!username || !password) {
        errorDiv.textContent = "Username and password required";
        errorDiv.classList.remove("hidden");
        return;
      }
      errorDiv.classList.add("hidden");
      submitBtn.disabled = true;
      submitBtn.textContent = "Please wait...";

      if (isSignupMode) {
        const displayName = displayInput.value.trim() || username;
        apiPost("/signup", { username, password, displayName }).then(data => {
          submitBtn.disabled = false;
          submitBtn.textContent = "Sign Up";
          if (data.error) {
            errorDiv.textContent = data.error;
            errorDiv.classList.remove("hidden");
            return;
          }
          token = data.token;
          currentUser = data.user;
          localStorage.setItem("dangro_token", token);
          document.getElementById("login-screen").classList.add("hidden");
          document.getElementById("app-container").classList.remove("hidden");
          connectWebSocket(token);
        }).catch(e => {
          submitBtn.disabled = false;
          submitBtn.textContent = "Sign Up";
          errorDiv.textContent = e.message;
          errorDiv.classList.remove("hidden");
        });
      } else {
        apiPost("/login", { username, password }).then(data => {
          submitBtn.disabled = false;
          submitBtn.textContent = "Log In";
          if (data.error) {
            errorDiv.textContent = data.error;
            errorDiv.classList.remove("hidden");
            return;
          }
          token = data.token;
          currentUser = data.user;
          localStorage.setItem("dangro_token", token);
          document.getElementById("login-screen").classList.add("hidden");
          document.getElementById("app-container").classList.remove("hidden");
          connectWebSocket(token);
        }).catch(e => {
          submitBtn.disabled = false;
          submitBtn.textContent = "Log In";
          errorDiv.textContent = e.message;
          errorDiv.classList.remove("hidden");
        });
      }
    });

    [usernameInput, passwordInput, displayInput].forEach(inp => {
      inp.addEventListener("keypress", (e) => {
        if (e.key === "Enter") submitBtn.click();
      });
    });
  }

  /* ============ WEBSOCKET ============ */
  async function connectWebSocket(tok) {
    await ensureServerOrigin();
    try {
      ws = new WebSocket(wsOrigin);
    } catch (e) {
      showToast("Failed to connect: " + e.message, "error");
      return;
    }

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", token: tok }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleWsMessage(msg);
      } catch (e) {
        console.error("WS parse error", e);
      }
    };

    ws.onclose = () => {
      showToast("Disconnected from server. Reconnecting...", "error");
      setTimeout(() => {
        if (token) connectWebSocket(token);
      }, 3000);
    };

    ws.onerror = () => {
      showToast("WebSocket error", "error");
    };
  }

  function wsSend(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  function handleWsMessage(msg) {
    switch (msg.type) {
      case "connected":
        break;

      case "init":
        currentUser = msg.user;
        friends = msg.friends || [];
        pendingRequests = msg.pendingRequests || { incoming: [], outgoing: [] };
        servers = msg.servers || [];
        groupChats = msg.groupChats || [];
        allUsers = msg.allUsers || [];
        friends.forEach(f => { if (f.status === "online") onlineUserIds.add(f.id); });

        if (servers.length > 0) {
          activeServerId = servers[0].id;
          activeChannelId = servers[0].channels.length > 0 ? servers[0].channels[0].id : "general";
          activeChatType = "channel";
        }

        if (currentUser.theme) {
          document.documentElement.setAttribute("data-theme", currentUser.theme);
        }

        document.getElementById("login-screen").classList.add("hidden");
        document.getElementById("app-container").classList.remove("hidden");
        if (!appInitialized) { appInitialized = true; initApp(); } else { renderAll(); }
        break;

      case "message:new":
        if (!messages[msg.chatKey]) messages[msg.chatKey] = [];
        const exists = messages[msg.chatKey].some(m => m.id === msg.message.id);
        if (!exists) {
          messages[msg.chatKey].push(msg.message);
          if (getActiveChatKey() === msg.chatKey) renderChat();
        }
        break;

      case "typing":
        handleTyping(msg);
        break;

      case "message:reacted":
        updateReaction(msg);
        break;

      case "friend:request:incoming":
        pendingRequests.incoming.push(msg.from);
        if (activeFriendSubtab === "pending") renderPendingList();
        showToast("Friend request from " + msg.from.username, "info");
        break;

      case "friend:request:sent":
        pendingRequests.outgoing.push(msg.to);
        showToast("Request sent to " + msg.to.username, "success");
        break;

      case "friend:accepted":
        const existingIdx = friends.findIndex(f => f.id === msg.friend.id);
        if (existingIdx === -1) {
          friends.push(msg.friend);
        } else {
          friends[existingIdx].status = "online";
        }
        onlineUserIds.add(msg.friend.id);
        pendingRequests.incoming = pendingRequests.incoming.filter(r => r.id !== msg.friend.id);
        pendingRequests.outgoing = pendingRequests.outgoing.filter(r => r.id !== msg.friend.id);
        renderFriendsList();
        renderPendingList();
        if (activeNavTab === "dms") switchNav("dms");
        showToast("@" + msg.friend.username + " accepted your request!", "success");
        break;

      case "friend:removed":
        friends = friends.filter(f => f.id !== msg.friendId);
        renderFriendsList();
        break;

      case "user:status":
        const fIdx = friends.findIndex(f => f.id === msg.userId);
        if (fIdx !== -1) {
          friends[fIdx].status = msg.status;
          if (msg.status === "online") onlineUserIds.add(msg.userId);
          else onlineUserIds.delete(msg.userId);
          renderFriendsList();
        }
        break;

      case "server:created":
        if (!servers.find(s => s.id === msg.server.id)) {
          servers.push(msg.server);
          activeServerId = msg.server.id;
          activeChannelId = "general";
          activeChatType = "channel";
          renderServers();
          renderChannels();
          updateChatHeader();
          renderChat();
          switchNav("servers");
        }
        break;

      case "server:joined":
        if (!servers.find(s => s.id === msg.server.id)) {
          servers.push(msg.server);
          renderServers();
        }
        break;

      case "channel:created":
        const sv = servers.find(s => s.id === msg.serverId);
        if (sv && !sv.channels.find(c => c.id === msg.channel.id)) {
          sv.channels.push(msg.channel);
          activeChannelId = msg.channel.id;
          activeChatType = "channel";
          renderChannels();
          updateChatHeader();
          renderChat();
        }
        break;

      case "group:created":
        if (!groupChats.find(g => g.id === msg.group.id)) {
          groupChats.push(msg.group);
          activeGroupChatId = msg.group.id;
          activeChatType = "group";
          renderGroupChats();
          updateChatHeader();
          renderChat();
          switchNav("groupchats");
        }
        break;

      case "profile:updated":
        if (msg.profile) {
          if (msg.profile.id === currentUser.id) {
            Object.assign(currentUser, msg.profile);
          }
        }
        break;

      case "call:offer":
        pendingCallOffer = msg;
        showIncomingCall(msg.username);
        break;

      case "call:answer":
        handleCallAnswer(msg);
        break;

      case "call:ice":
        handleCallIce(msg);
        break;

      case "call:ended":
        if (callActive) {
          showToast("Call ended by " + (msg.fromUserId !== currentUser.id ? "other user" : "you"), "info");
          stopCall();
        }
        break;

      case "error":
        showToast(msg.message, "error");
        break;
    }
  }

  /* ============ MESSAGE LOADING ============ */
  function loadMessages(chatKey) {
    if (!chatKey) return;
    apiGet("/messages/" + encodeURIComponent(chatKey) + "?token=" + encodeURIComponent(token)).then(data => {
      if (data.messages) {
        messages[chatKey] = data.messages;
        renderChat();
      }
    }).catch(() => {});
  }

  /* ============ TYPING ============ */
  let typingTimeout = null;

  function handleTyping(msg) {
    const indicator = document.getElementById("typing-indicator");
    const text = document.getElementById("typing-text");
    if (getActiveChatKey() !== msg.chatKey) return;
    if (msg.isTyping) {
      text.textContent = msg.username + " is typing...";
      indicator.classList.remove("hidden");
      clearTimeout(indicator._typingTimer);
      indicator._typingTimer = setTimeout(() => indicator.classList.add("hidden"), 3000);
    } else {
      indicator.classList.add("hidden");
    }
  }

  function sendTyping(isTyping) {
    const chatKey = getActiveChatKey();
    if (!chatKey) return;
    wsSend({ type: "typing", chatKey, isTyping });
  }

  /* ============ INIT APP ============ */
  function initApp() {
    initLayout();
    initTopNav();
    initPanels();
    initChat();
    initServers();
    initFriends();
    initSettings();
    initCall();
    initYT();
    initIG();
    initBrowser();
    renderAll();
  }

  /* ============ LAYOUT ============ */
  function initLayout() {
    const lw = leftPanelCollapsed ? 0 : leftPanelWidth;
    const rw = rightPanelCollapsed ? 0 : rightPanelWidth;
    const mw = 100 - lw - rw;
    document.querySelector(".main-content-area").style.setProperty("--left-width", lw + "%");
    document.querySelector(".main-content-area").style.setProperty("--right-width", rw + "%");
    document.querySelector(".main-content-area").style.setProperty("--middle-width", mw + "%");

    document.getElementById("left-panel").classList.toggle("collapsed", leftPanelCollapsed);
    document.getElementById("btn-collapse-left").classList.toggle("hidden", leftPanelCollapsed);
    document.getElementById("btn-expand-left").classList.toggle("hidden", !leftPanelCollapsed);

    document.getElementById("right-panel").classList.toggle("collapsed", rightPanelCollapsed);
    document.getElementById("btn-collapse-right").classList.toggle("hidden", rightPanelCollapsed);
    document.getElementById("btn-expand-right").classList.toggle("hidden", !rightPanelCollapsed);
  }

  document.getElementById("divider-left").addEventListener("mousedown", (e) => {
    if (e.target.closest(".divider-arrow")) return;
    isDraggingLeft = true;
    document.getElementById("divider-left").classList.add("dragging");
    document.body.style.cursor = "col-resize";
  });
  document.getElementById("divider-right").addEventListener("mousedown", (e) => {
    if (e.target.closest(".divider-arrow")) return;
    isDraggingRight = true;
    document.getElementById("divider-right").classList.add("dragging");
    document.body.style.cursor = "col-resize";
  });
  document.addEventListener("mousemove", (e) => {
    if (!isDraggingLeft && !isDraggingRight) return;
    e.preventDefault();
    const sw = window.innerWidth;
    const mx = e.clientX;
    if (isDraggingLeft) {
      let np = (mx / sw) * 100;
      if (np < 12) { leftPanelCollapsed = true; isDraggingLeft = false; document.getElementById("divider-left").classList.remove("dragging"); initLayout(); return; }
      else { leftPanelCollapsed = false; if (np > 45) np = 45; leftPanelWidth = np; }
    }
    if (isDraggingRight) {
      let np = ((sw - mx) / sw) * 100;
      if (np < 12) { rightPanelCollapsed = true; isDraggingRight = false; document.getElementById("divider-right").classList.remove("dragging"); initLayout(); return; }
      else { rightPanelCollapsed = false; if (np > 40) np = 40; rightPanelWidth = np; }
    }
    initLayout();
  });
  document.addEventListener("mouseup", () => {
    if (isDraggingLeft || isDraggingRight) {
      isDraggingLeft = false; isDraggingRight = false;
      document.getElementById("divider-left").classList.remove("dragging");
      document.getElementById("divider-right").classList.remove("dragging");
      document.body.style.cursor = "default";
    }
  });
  document.getElementById("btn-collapse-left").addEventListener("click", () => { leftPanelCollapsed = true; initLayout(); });
  document.getElementById("btn-expand-left").addEventListener("click", () => { leftPanelCollapsed = false; initLayout(); });
  document.getElementById("btn-collapse-right").addEventListener("click", () => { rightPanelCollapsed = true; initLayout(); });
  document.getElementById("btn-expand-right").addEventListener("click", () => { rightPanelCollapsed = false; initLayout(); });

  /* ============ TOP NAV ============ */
  function initTopNav() {
    document.querySelectorAll(".top-nav-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const nav = btn.getAttribute("data-nav");
        switchNav(nav);
      });
    });
    switchNav(activeNavTab);
  }

  function switchNav(nav) {
    activeNavTab = nav;
    document.querySelectorAll(".top-nav-btn").forEach(b => b.classList.toggle("active", b.getAttribute("data-nav") === nav));
    document.querySelectorAll(".right-view").forEach(v => v.classList.remove("active"));
    document.getElementById("right-" + nav + "-view").classList.add("active");
    if (nav === "dms") renderFriendsList();
    if (nav === "groupchats") renderGroupChats();
    if (nav === "servers") { renderServers(); renderChannels(); }
  }

  /* ============ LEFT PANEL TABS ============ */
  function initPanels() {
    document.querySelectorAll(".panel-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const tabId = btn.getAttribute("data-tab");
        activeLeftTab = tabId;
        document.querySelectorAll(".panel-tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        document.querySelectorAll(".tab-content").forEach(c => { c.classList.remove("active"); if (c.id === tabId) c.classList.add("active"); });
        if (tabId === "youtube-client") renderYoutubeFeed();
        if (tabId === "instagram-client") renderInstagramFeed();
      });
    });
    document.querySelectorAll(".tab-content").forEach(c => { c.classList.remove("active"); if (c.id === activeLeftTab) c.classList.add("active"); });
    document.querySelectorAll(".panel-tab-btn").forEach(b => b.classList.toggle("active", b.getAttribute("data-tab") === activeLeftTab));
  }

  /* ============ YOUTUBE ============ */
  function initYT() {
    const ytPlayer = document.getElementById("yt-player");
    ytPlayer.src = "https://www.youtube.com/embed/" + activeYtVideoId;
    updateYtMeta(activeYtVideoId);

    document.getElementById("yt-search-btn").addEventListener("click", triggerYtSearch);
    document.getElementById("yt-search-input").addEventListener("keypress", (e) => { if (e.key === "Enter") triggerYtSearch(); });
    document.getElementById("yt-like-btn").addEventListener("click", () => {
      document.getElementById("yt-like-btn").classList.toggle("liked");
    });
  }

  function updateYtMeta(videoId) {
    const video = YT_VIDEOS.find(v => v.id === videoId);
    if (video) {
      document.getElementById("yt-active-title").textContent = video.title;
      document.getElementById("yt-active-channel").textContent = video.channelName;
      document.getElementById("yt-active-views").textContent = video.views;
    }
  }

  function triggerYtSearch() {
    const query = document.getElementById("yt-search-input").value.trim();
    if (!query) { renderYoutubeFeed(); return; }
    const urlPattern = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const match = query.match(urlPattern);
    if (match && match[1]) {
      const videoId = match[1];
      if (!YT_VIDEOS.find(v => v.id === videoId)) {
        YT_VIDEOS.push({ id: videoId, title: "Imported: " + videoId, channelName: "Custom", views: "Stream", thumbnail: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&w=400&q=80" });
      }
      playYoutubeVideo(videoId);
      renderYoutubeFeed();
    } else {
      renderYoutubeFeed(query);
    }
  }

  function playYoutubeVideo(videoId) {
    activeYtVideoId = videoId;
    document.getElementById("yt-player").src = "https://www.youtube.com/embed/" + videoId + "?autoplay=1";
    updateYtMeta(videoId);
  }

  function renderYoutubeFeed(filterQuery) {
    const container = document.getElementById("yt-recommendations");
    container.innerHTML = "";
    let filtered = YT_VIDEOS;
    if (filterQuery) filtered = YT_VIDEOS.filter(v => v.title.toLowerCase().includes(filterQuery.toLowerCase()) || v.channelName.toLowerCase().includes(filterQuery.toLowerCase()));
    if (!filtered.length) { container.innerHTML = '<div style="padding:10px;font-size:0.75rem;color:var(--text-muted);">No videos found.</div>'; return; }
    filtered.forEach(video => {
      const card = document.createElement("div");
      card.className = "yt-video-card";
      card.innerHTML = '<div class="yt-card-thumbnail" style="background-image:url(' + video.thumbnail + ')"></div><div class="yt-card-info"><div class="yt-card-title">' + video.title + '</div><div class="yt-card-chan">' + video.channelName + '</div><div class="yt-card-views">' + video.views + '</div></div>';
      card.addEventListener("click", () => playYoutubeVideo(video.id));
      container.appendChild(card);
    });
  }

  /* ============ INSTAGRAM ============ */
  function initIG() {
    renderInstagramFeed();
  }

  function renderInstagramFeed() {
    const container = document.getElementById("ig-feed-container");
    container.innerHTML = "";
    IG_POSTS.forEach(post => {
      const card = document.createElement("div");
      card.className = "ig-post-card";
      let commentsHTML = post.comments.map(c => '<div class="ig-comment-item"><span class="commenter">' + c.username + '</span>' + c.text + '</div>').join("");
      card.innerHTML = '<div class="ig-post-header"><div class="user-avatar-small" style="background-color:' + post.avatarColor + '">' + post.username.charAt(0).toUpperCase() + '</div><span class="ig-post-author">' + post.username + '</span></div><div class="ig-post-image" style="background-image:url(' + post.image + ')"></div><div class="ig-post-actions"><button class="ig-action-btn ' + (post.liked ? 'liked' : '') + '" data-post-id="' + post.id + '"><span>' + (post.liked ? '❤️' : '🤍') + '</span></button><button class="ig-action-btn ig-comment-focus-btn"><span>💬</span></button></div><div class="ig-post-likes">' + post.likes.toLocaleString() + ' likes</div><div class="ig-post-caption"><span class="author">' + post.username + '</span>' + post.caption + '</div><div class="ig-comments-box"><div class="ig-comments-list">' + commentsHTML + '</div><div class="ig-add-comment"><input type="text" placeholder="Add a comment..." class="ig-comment-input"><button class="ig-post-comment-btn" data-post-id="' + post.id + '">Post</button></div></div>';
      card.querySelector('.ig-action-btn[data-post-id="' + post.id + '"]').addEventListener("click", () => {
        post.liked = !post.liked; post.likes += post.liked ? 1 : -1; renderInstagramFeed();
      });
      card.querySelector(".ig-comment-focus-btn").addEventListener("click", () => { card.querySelector(".ig-comment-input").focus(); });
      card.querySelector(".ig-post-comment-btn").addEventListener("click", () => {
        const inp = card.querySelector(".ig-comment-input"); const text = inp.value.trim();
        if (text) { post.comments.push({ username: currentUser ? currentUser.username : "user", text: text }); inp.value = ""; renderInstagramFeed(); }
      });
      container.appendChild(card);
    });
  }

  /* ============ BROWSER ============ */
  function initBrowser() {
    loadBrowserUrl("https://wikipedia.org");
    document.getElementById("browser-go-btn").addEventListener("click", () => {
      const url = document.getElementById("browser-url-input").value.trim();
      if (url) { browserHistory = browserHistory.slice(0, browserHistoryIndex + 1); browserHistory.push(url); browserHistoryIndex = browserHistory.length - 1; loadBrowserUrl(url); }
    });
    document.getElementById("browser-url-input").addEventListener("keypress", (e) => { if (e.key === "Enter") document.getElementById("browser-go-btn").click(); });
    document.getElementById("browser-back").addEventListener("click", () => { if (browserHistoryIndex > 0) { browserHistoryIndex--; loadBrowserUrl(browserHistory[browserHistoryIndex]); } });
    document.getElementById("browser-forward").addEventListener("click", () => { if (browserHistoryIndex < browserHistory.length - 1) { browserHistoryIndex++; loadBrowserUrl(browserHistory[browserHistoryIndex]); } });
    document.getElementById("browser-refresh").addEventListener("click", () => { document.getElementById("browser-iframe").src = document.getElementById("browser-iframe").src; });
    document.getElementById("close-warning-btn").addEventListener("click", () => { document.getElementById("browser-csp-warning").classList.add("hidden"); });
  }

  function loadBrowserUrl(url) {
    if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;
    document.getElementById("browser-url-input").value = url;
    document.getElementById("browser-iframe").src = url;
    const blocked = ["google.com", "youtube.com", "instagram.com", "facebook.com", "github.com", "discord.com", "twitter.com", "x.com"];
    document.getElementById("browser-csp-warning").classList.toggle("hidden", !blocked.some(d => url.toLowerCase().includes(d)));
  }

  /* ============ CHAT SYSTEM ============ */
  function initChat() {
    document.getElementById("btn-send-message").addEventListener("click", sendMessage);
    document.getElementById("message-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    document.getElementById("message-input").addEventListener("input", function() {
      this.style.height = "auto"; this.style.height = this.scrollHeight + "px";
      clearTimeout(typingTimeout);
      sendTyping(true);
      typingTimeout = setTimeout(() => sendTyping(false), 2000);
    });
    document.getElementById("chat-search-input").addEventListener("input", () => {
      chatSearchQuery = document.getElementById("chat-search-input").value; renderChat();
    });
    document.getElementById("btn-clear-chat").addEventListener("click", () => {
      if (confirm("Clear chat history?")) { messages[getActiveChatKey()] = []; renderChat(); }
    });
    document.getElementById("btn-attach").addEventListener("click", () => { document.getElementById("media-modal").classList.remove("hidden"); });
    document.getElementById("btn-media-cancel").addEventListener("click", () => { document.getElementById("media-modal").classList.add("hidden"); });
    document.getElementById("btn-media-submit").addEventListener("click", () => {
      const url = document.getElementById("media-url-input").value.trim();
      if (url) {
        const key = getActiveChatKey();
        if (key) {
          wsSend({ type: "message:send", chatKey: key, content: url, replyTo: msgReplyTarget ? { sender: msgReplyTarget.sender, content: msgReplyTarget.content } : null });
          msgReplyTarget = null;
          document.getElementById("reply-preview").classList.add("hidden");
        }
        document.getElementById("media-modal").classList.add("hidden");
        document.getElementById("media-url-input").value = "";
      }
    });
    document.getElementById("btn-cancel-reply").addEventListener("click", cancelReply);
    initEmojiPicker();
  }

  function sendMessage() {
    const content = document.getElementById("message-input").value.trim();
    if (!content) return;
    const key = getActiveChatKey();
    if (!key) { showToast("Select a chat first", "error"); return; }
    wsSend({ type: "message:send", chatKey: key, content, replyTo: msgReplyTarget ? { sender: msgReplyTarget.sender, content: msgReplyTarget.content } : null });
    document.getElementById("message-input").value = "";
    document.getElementById("message-input").style.height = "auto";
    cancelReply();
    sendTyping(false);
  }

  function cancelReply() {
    msgReplyTarget = null;
    document.getElementById("reply-preview").classList.add("hidden");
    document.getElementById("message-input").focus();
  }

  /* ============ EMOJI PICKER ============ */
  function initEmojiPicker() {
    const btnEmoji = document.getElementById("btn-emoji");
    const picker = document.getElementById("emoji-picker");
    btnEmoji.addEventListener("click", (e) => { e.stopPropagation(); picker.classList.toggle("hidden"); if (!picker.classList.contains("hidden")) renderEmojiGrid("smileys"); });
    document.addEventListener("click", (e) => {
      if (!picker.classList.contains("hidden") && !picker.contains(e.target) && e.target !== btnEmoji) picker.classList.add("hidden");
    });

    document.querySelectorAll(".emoji-cat-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".emoji-cat-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderEmojiGrid(btn.getAttribute("data-cat"));
      });
    });

    document.getElementById("emoji-search-input").addEventListener("input", () => {
      const q = document.getElementById("emoji-search-input").value.trim().toLowerCase();
      if (!q) { const active = document.querySelector(".emoji-cat-btn.active"); renderEmojiGrid(active ? active.getAttribute("data-cat") : "smileys"); return; }
      const filtered = EMOJIS.filter(e => e.toLowerCase().includes(q));
      renderEmojiList(filtered);
    });
  }

  function renderEmojiGrid(cat) {
    let list = [];
    if (cat === "smileys") list = EMOJIS.filter(e => /[\u{1F600}-\u{1F64F}]/u.test(e) || e.length === 2);
    else if (cat === "gestures") list = ["👍","👎","👊","✊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✌️","🤟","🤘","👌","💪","👋","🤚","🖐️","✋","🖖","👈","👉","👆","👇","☝️","✍️","🤳","💅","🦵","🦶","👂","👃","👀","👁️","🧠","🦷","🦴","👅","👄"];
    else if (cat === "food") list = EMOJIS.filter(e => /[\u{1F32D}-\u{1F37F}]/u.test(e) || /[\u{1F950}-\u{1F96F}]/u.test(e) || /[\u{1F980}-\u{1F9C0}]/u.test(e) || e === "☕" || e === "🍿");
    else if (cat === "nature") list = EMOJIS.filter(e => /[\u{1F300}-\u{1F32F}]/u.test(e) || /[\u{1F400}-\u{1F4FF}]/u.test(e));
    else if (cat === "objects") list = EMOJIS.filter(e => /[\u{1F4A0}-\u{1F4FF}]/u.test(e) || /[\u{1F500}-\u{1F5FF}]/u.test(e));
    else if (cat === "symbols") list = ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💕","💞","💗","💖","💘","💝","💟","❣️","💌","💔","🔥","⭐","🌟","✨","💫","🎉","🎊","🎈","🎁","🎀","🏆","🥇","🥈","🥉","🏅","🎯","🎮","🎲","♟️","🎰","🎭","🎨","🎬","🎤","🎧","🎼","🎹","🥁","🎷","🎺","🎸","🎻","🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🚚","🚛","🚜","✈️","🚀","🛸","🏠","🏡","🏢","🏬","🏣","🏤","🏥","🏦","🏪","🏫","🏩","💒","🏛️","⛪","🕌","🕍","🕋","⛩️","🎠","🎡","🎢","🎪"];
    else list = EMOJIS.slice(0, 100);
    if (!list.length) list = EMOJIS.slice(0, 100);
    renderEmojiList(list);
  }

  function renderEmojiList(list) {
    const container = document.getElementById("emoji-grid-container");
    container.innerHTML = "";
    const visible = list.slice(0, 300);
    visible.forEach(emoji => {
      const el = document.createElement("span");
      el.className = "emoji-item";
      el.textContent = emoji;
      el.addEventListener("click", () => {
        document.getElementById("message-input").value += emoji;
        document.getElementById("message-input").focus();
      });
      container.appendChild(el);
    });
  }

  /* ============ RENDER CHAT ============ */
  function renderChat() {
    const container = document.getElementById("chat-messages-container");
    container.innerHTML = "";
    const key = getActiveChatKey();
    const chatList = key ? (messages[key] || []) : [];
    const query = chatSearchQuery.trim().toLowerCase();
    const filtered = query ? chatList.filter(m => m.content.toLowerCase().includes(query) || m.sender.toLowerCase().includes(query)) : chatList;

    if (!filtered.length) {
      container.innerHTML = '<div style="flex-grow:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--text-muted);font-size:0.8rem;padding:20px;"><div style="font-size:2rem;margin-bottom:8px;">💬</div><p>' + (query ? 'No messages match your search.' : 'No messages yet.') + '</p></div>';
      return;
    }

    filtered.forEach(msg => {
      const isMe = msg.senderId === currentUser.id || msg.sender === currentUser.displayName;
      const item = document.createElement("div");
      item.className = "message-item" + (msg.system ? " system-msg" : "");
      item.setAttribute("data-msg-id", msg.id);

      let avatarChar = msg.system ? "⚙️" : (isMe ? currentUser.displayName.charAt(0).toUpperCase() : msg.sender.charAt(0).toUpperCase());
      let avatarColor = msg.system ? "transparent" : (isMe ? "#ffffff" : "#444444");

      let contentHTML = '<div class="msg-content">' + escapeHtml(msg.content) + '</div>';
      if (msg.isImage || /\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i.test(msg.content) || msg.content.startsWith("https://images.unsplash.com/")) {
        contentHTML = '<div class="msg-content">' + escapeHtml(msg.content) + '</div><div class="msg-image-attachment"><img src="' + escapeHtml(msg.content) + '" alt="Attachment" onerror="this.parentElement.innerHTML=\'<span style=color:#666;font-size:0.7rem;padding:4px;>Image failed to load</span>\'"></div>';
      }

      let replyHTML = "";
      if (msg.replyTo) {
        replyHTML = '<div class="msg-reply-preview"><span class="msg-reply-sender">' + escapeHtml(msg.replyTo.sender) + '</span> <span class="msg-reply-text">' + escapeHtml(msg.replyTo.content.substring(0, 80)) + '</span></div>';
      }

      let reactionsHTML = "";
      if (msg.reactions && Object.keys(msg.reactions).length > 0) {
        reactionsHTML = '<div class="msg-reactions">';
        for (const [emoji, users] of Object.entries(msg.reactions)) {
          const hasReacted = users.includes(currentUser.id) || users.includes(currentUser.displayName);
          reactionsHTML += '<span class="msg-reaction' + (hasReacted ? ' active' : '') + '" data-emoji="' + emoji + '" data-msg-id="' + msg.id + '">' + emoji + ' <span class="msg-reaction-count">' + users.length + '</span></span>';
        }
        reactionsHTML += '</div>';
      }

      item.innerHTML = '<div class="msg-avatar" style="background-color:' + avatarColor + (isMe && !msg.system ? ';color:#000' : '') + '">' + avatarChar + '</div><div class="msg-body"><div class="msg-header"><span class="msg-sender">' + (msg.system ? 'System' : escapeHtml(msg.sender)) + '</span><span class="msg-time">' + (msg.timestamp || "") + '</span></div>' + replyHTML + contentHTML + reactionsHTML + '</div>';

      if (!msg.system) {
        const actions = document.createElement("div");
        actions.className = "msg-actions-bar";
        actions.innerHTML = '<button class="msg-action-btn btn-reply" title="Reply">↩️</button><button class="msg-action-btn btn-react" title="React">😀</button>';
        const body = item.querySelector(".msg-body");
        if (body) body.appendChild(actions);
        actions.querySelector(".btn-reply").addEventListener("click", () => startReply(msg));
        actions.querySelector(".btn-react").addEventListener("click", (e) => { e.stopPropagation(); openReactionPicker(msg.id); });
      }

      item.querySelectorAll(".msg-reaction").forEach(el => {
        el.addEventListener("click", () => {
          const emoji = el.getAttribute("data-emoji");
          const mid = el.getAttribute("data-msg-id");
          toggleReaction(mid, emoji);
        });
      });

      container.appendChild(item);
    });

    container.scrollTop = container.scrollHeight;
  }

  function updateChatHeader() {
    const searchInput = document.getElementById("chat-search-input");
    searchInput.value = chatSearchQuery;

    if (activeChatType === "channel") {
      const server = servers.find(s => s.id === activeServerId);
      const channel = server ? server.channels.find(c => c.id === activeChannelId) : null;
      document.getElementById("chat-header-prefix").textContent = "#";
      document.getElementById("chat-header-name").textContent = channel ? channel.name : "general";
      document.getElementById("chat-header-desc").textContent = channel ? "Text channel in " + server.name : "";
      document.getElementById("chat-online-status").classList.add("hidden");
      document.getElementById("message-input").placeholder = "Message #" + (channel ? channel.name : "channel") + "...";
    } else if (activeChatType === "dm") {
      const friend = friends.find(f => f.id === activeDmFriendId);
      document.getElementById("chat-header-prefix").textContent = "@";
      document.getElementById("chat-header-name").textContent = friend ? friend.displayName || friend.username : "User DMs";
      document.getElementById("chat-header-desc").textContent = friend ? ((friend.status === "online" || onlineUserIds.has(friend.id)) ? "Online" : "Offline") : "";
      document.getElementById("chat-online-status").classList.toggle("hidden", !(friend && (friend.status === "online" || onlineUserIds.has(friend.id))));
      document.getElementById("message-input").placeholder = "Message @" + (friend ? friend.username : "friend") + "...";
    } else if (activeChatType === "group") {
      const group = groupChats.find(g => g.id === activeGroupChatId);
      document.getElementById("chat-header-prefix").textContent = "📢";
      document.getElementById("chat-header-name").textContent = group ? group.name : "Group Chat";
      document.getElementById("chat-header-desc").textContent = group ? group.members.length + " members" : "";
      document.getElementById("chat-online-status").classList.add("hidden");
      document.getElementById("message-input").placeholder = "Message group...";
    }
  }

  /* ============ REPLY & REACTIONS ============ */
  function startReply(msg) {
    msgReplyTarget = { id: msg.id, sender: msg.sender, content: msg.content };
    document.getElementById("reply-target-name").textContent = msg.sender;
    document.getElementById("reply-target-text").textContent = msg.content.substring(0, 100);
    document.getElementById("reply-preview").classList.remove("hidden");
    document.getElementById("message-input").focus();
  }

  function openReactionPicker(msgId) {
    const container = document.getElementById("emoji-grid-container");
    const picker = document.getElementById("emoji-picker");
    const recent = ["👍", "❤️", "😂", "😍", "🎉", "🔥", "👏", "🙌", "😢", "😡"];
    container.innerHTML = "";
    recent.forEach(emoji => {
      const el = document.createElement("span");
      el.className = "emoji-item";
      el.textContent = emoji;
      el.addEventListener("click", () => { toggleReaction(msgId, emoji); picker.classList.add("hidden"); });
      container.appendChild(el);
    });
    picker.classList.remove("hidden");
  }

  function toggleReaction(msgId, emoji) {
    const key = getActiveChatKey();
    if (!key) return;
    wsSend({ type: "message:react", messageId: msgId, emoji, chatKey: key });
  }

  function updateReaction(msg) {
    const key = getActiveChatKey();
    if (!key) return;
    const chatList = messages[key];
    if (!chatList) return;
    const m = chatList.find(m => m.id === msg.messageId);
    if (!m) return;
    if (!m.reactions) m.reactions = {};
    if (!m.reactions[msg.emoji]) m.reactions[msg.emoji] = [];
    if (msg.active) {
      if (!m.reactions[msg.emoji].includes(msg.userId)) m.reactions[msg.emoji].push(msg.userId);
    } else {
      m.reactions[msg.emoji] = m.reactions[msg.emoji].filter(u => u !== msg.userId);
      if (!m.reactions[msg.emoji].length) delete m.reactions[msg.emoji];
    }
    if (getActiveChatKey() === key) renderChat();
  }

  /* ============ SERVERS ============ */
  function initServers() {
    document.getElementById("btn-add-channel").addEventListener("click", () => {
      document.getElementById("channel-modal").classList.remove("hidden");
      document.getElementById("channel-name-input").value = "";
    });
    document.getElementById("btn-channel-cancel").addEventListener("click", () => { document.getElementById("channel-modal").classList.add("hidden"); });
    document.getElementById("btn-channel-submit").addEventListener("click", () => {
      let name = document.getElementById("channel-name-input").value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "");
      if (!name) return;
      wsSend({ type: "channel:create", serverId: activeServerId, name });
      document.getElementById("channel-modal").classList.add("hidden");
      showToast("Channel #" + name + " created!", "success");
    });

    document.getElementById("btn-create-server").addEventListener("click", () => {
      document.getElementById("server-modal").classList.remove("hidden");
      document.getElementById("server-name-input").value = "";
      document.getElementById("server-icon-input").value = "";
    });
    document.getElementById("btn-server-cancel").addEventListener("click", () => { document.getElementById("server-modal").classList.add("hidden"); });
    document.getElementById("btn-server-submit").addEventListener("click", () => {
      const name = document.getElementById("server-name-input").value.trim();
      const icon = document.getElementById("server-icon-input").value.trim() || "S";
      if (!name) { showToast("Server name required!", "error"); return; }
      wsSend({ type: "server:create", name, icon });
      document.getElementById("server-modal").classList.add("hidden");
    });

    document.getElementById("btn-browse-servers").addEventListener("click", () => {
      document.getElementById("server-browser-modal").classList.remove("hidden");
      loadBrowseServers();
    });
    document.getElementById("btn-browser-close").addEventListener("click", () => { document.getElementById("server-browser-modal").classList.add("hidden"); });
    document.getElementById("server-browser-search").addEventListener("input", () => loadBrowseServers());

    document.getElementById("btn-join-server").addEventListener("click", () => {
      const code = document.getElementById("join-server-input").value.trim();
      const fb = document.getElementById("join-server-feedback");
      if (!code) return;
      wsSend({ type: "server:join", inviteCode: code });
      fb.textContent = "Joining...";
      fb.className = "feedback-msg";
      fb.style.display = "block";
      setTimeout(() => { fb.style.display = "none"; }, 3000);
      document.getElementById("join-server-input").value = "";
    });

    renderServers();
    renderChannels();
  }

  function loadBrowseServers() {
    apiGet("/servers/browse").then(data => {
      const list = document.getElementById("server-browser-list");
      const search = document.getElementById("server-browser-search").value.trim().toLowerCase();
      list.innerHTML = "";
      let svs = data.servers || [];
      if (search) svs = svs.filter(s => s.name.toLowerCase().includes(search));
      svs.forEach(s => {
        const item = document.createElement("div");
        item.className = "server-browser-item";
        item.innerHTML = '<div><div class="sbi-name">' + escapeHtml(s.name) + '</div><div class="sbi-info">' + (s.member_count || 0) + ' members • ' + escapeHtml(s.owner_name || "Unknown") + '</div></div><button class="sbi-join" data-code="' + escapeHtml(s.invite_code) + '">Join</button>';
        item.querySelector(".sbi-join").addEventListener("click", () => {
          wsSend({ type: "server:join", inviteCode: s.invite_code });
          showToast("Joined " + s.name, "success");
          document.getElementById("server-browser-modal").classList.add("hidden");
        });
        list.appendChild(item);
      });
      if (!svs.length) list.innerHTML = '<div style="text-align:center;padding:16px;font-size:0.7rem;color:var(--text-muted);">No public servers found.</div>';
    }).catch(() => {});
  }

  function renderServers() {
    const container = document.getElementById("server-icons-list");
    container.innerHTML = "";
    servers.forEach(server => {
      const btn = document.createElement("button");
      btn.className = "server-icon-btn" + (server.id === activeServerId ? " active" : "");
      btn.textContent = server.icon || "S";
      btn.setAttribute("title", server.name);
      btn.addEventListener("click", () => {
        activeServerId = server.id;
        activeChatType = "channel";
        if (server.channels.length) activeChannelId = server.channels[0].id;
        renderServers();
        renderChannels();
        updateChatHeader();
        const key = getActiveChatKey();
        if (key && !messages[key]) loadMessages(key);
        else renderChat();
        document.querySelectorAll(".friend-item").forEach(i => i.classList.remove("active"));
        switchNav("servers");
      });
      container.appendChild(btn);
    });
  }

  function renderChannels() {
    const container = document.getElementById("channels-list");
    container.innerHTML = "";
    const server = servers.find(s => s.id === activeServerId);
    if (!server) return;
    document.getElementById("active-server-title").textContent = server.name;
    const inviteInfo = document.getElementById("server-invite-code");
    inviteInfo.textContent = server.owner_name ? "Owner: " + server.owner_name : "";
    if (server.invite_code) inviteInfo.textContent = "Invite: " + server.invite_code;

    server.channels.forEach(chan => {
      const btn = document.createElement("button");
      btn.className = "channel-btn" + (activeChatType === "channel" && chan.id === activeChannelId ? " active" : "");
      btn.innerHTML = '<span class="hash">#</span> ' + chan.name;
      btn.addEventListener("click", () => {
        activeChatType = "channel";
        activeChannelId = chan.id;
        activeDmFriendId = null;
        activeGroupChatId = null;
        renderChannels();
        updateChatHeader();
        const key = getActiveChatKey();
        if (key && !messages[key]) loadMessages(key);
        else renderChat();
        document.querySelectorAll(".friend-item").forEach(i => i.classList.remove("active"));
        renderServerMembers();
      });
      container.appendChild(btn);
    });
    renderServerMembers();
  }

  function renderServerMembers() {
    const container = document.getElementById("server-members-list");
    container.innerHTML = "";
    container.innerHTML = '<div style="font-size:0.7rem;font-weight:600;color:var(--text-muted);padding:4px 8px;text-transform:uppercase;letter-spacing:0.3px;">Members</div>';
    const server = servers.find(s => s.id === activeServerId);
    if (!server) return;
    const ownerName = server.owner_name || "";
    if (ownerName) {
      const div = document.createElement("div");
      div.className = "server-member-item";
      div.innerHTML = '<div class="friend-avatar" style="width:24px;height:24px;border-radius:50%;background:#555;display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:#fff;flex-shrink:0;">' + ownerName.charAt(0).toUpperCase() + '</div><span>' + ownerName + ' (owner)</span><span style="margin-left:auto;font-size:0.6rem;color:var(--online-color);">●</span>';
      container.appendChild(div);
    }
    if (currentUser && currentUser.displayName !== ownerName) {
      const div = document.createElement("div");
      div.className = "server-member-item";
      div.innerHTML = '<div class="friend-avatar" style="width:24px;height:24px;border-radius:50%;background:#555;display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:#fff;flex-shrink:0;">' + currentUser.displayName.charAt(0).toUpperCase() + '</div><span>' + currentUser.displayName + '</span><span style="margin-left:auto;font-size:0.6rem;color:var(--online-color);">●</span>';
      container.appendChild(div);
    }
  }

  /* ============ GROUP CHATS ============ */
  function initGroupChats() {
    document.getElementById("btn-create-group").addEventListener("click", () => {
      const modal = document.getElementById("group-modal");
      modal.classList.remove("hidden");
      document.getElementById("group-name-input").value = "";
      const select = document.getElementById("group-member-select");
      select.innerHTML = "";
      friends.filter(f => f.status === "online" || onlineUserIds.has(f.id)).forEach(f => {
        const label = document.createElement("label");
        label.innerHTML = '<input type="checkbox" value="' + f.id + '"> <span>' + (f.displayName || f.username) + '</span>';
        select.appendChild(label);
      });
      if (select.children.length === 0) {
        select.innerHTML = '<div style="font-size:0.7rem;color:var(--text-muted);padding:4px;">No online friends to add.</div>';
      }
    });

    document.getElementById("btn-group-cancel").addEventListener("click", () => { document.getElementById("group-modal").classList.add("hidden"); });

    document.getElementById("btn-group-submit").addEventListener("click", () => {
      const name = document.getElementById("group-name-input").value.trim();
      if (!name) { showToast("Group name required!", "error"); return; }
      const checks = document.querySelectorAll("#group-member-select input:checked");
      const memberIds = [];
      checks.forEach(c => memberIds.push(c.value));
      if (memberIds.length < 1) { showToast("Add at least one other member!", "error"); return; }
      wsSend({ type: "group:create", name, memberIds });
      document.getElementById("group-modal").classList.add("hidden");
      showToast("Group chat " + name + " created!", "success");
    });
  }

  function renderGroupChats() {
    const container = document.getElementById("group-chats-list");
    container.innerHTML = "";
    if (!groupChats.length) {
      container.innerHTML = '<div style="padding:16px;font-size:0.75rem;color:var(--text-muted);text-align:center;">No group chats yet.<br>Click + to create one.</div>';
      document.getElementById("group-members-list").innerHTML = "";
      return;
    }
    groupChats.forEach(group => {
      const item = document.createElement("div");
      item.className = "group-chat-item" + (activeGroupChatId === group.id && activeChatType === "group" ? " active" : "");
      item.innerHTML = '<div class="group-chat-icon">👥</div><div><div class="group-chat-name">' + escapeHtml(group.name) + '</div><div class="group-chat-count">' + (group.members ? group.members.length : 0) + ' members</div></div>';
      item.addEventListener("click", () => {
        activeChatType = "group";
        activeGroupChatId = group.id;
        activeServerId = null;
        activeDmFriendId = null;
        renderGroupChats();
        updateChatHeader();
        const key = getActiveChatKey();
        if (key && !messages[key]) loadMessages(key);
        else renderChat();
        renderGroupMembers();
      });
      container.appendChild(item);
    });
    renderGroupMembers();
  }

  function renderGroupMembers() {
    const container = document.getElementById("group-members-list");
    container.innerHTML = "";
    if (activeChatType !== "group") { container.innerHTML = '<div style="padding:12px;font-size:0.7rem;color:var(--text-muted);text-align:center;">Select a group chat to see members.</div>'; return; }
    const group = groupChats.find(g => g.id === activeGroupChatId);
    if (!group) { container.innerHTML = '<div style="padding:12px;font-size:0.7rem;color:var(--text-muted);text-align:center;">No group selected.</div>'; return; }
    container.innerHTML = '<div style="font-size:0.7rem;font-weight:600;color:var(--text-muted);padding:4px 8px;text-transform:uppercase;letter-spacing:0.3px;">Members - ' + (group.members ? group.members.length : 0) + '</div>';
    if (group.members) {
      group.members.forEach(m => {
        const isOnline = m.status === "online" || onlineUserIds.has(m.id);
        const div = document.createElement("div");
        div.className = "group-member-item";
        const name = m.displayName || m.username || "Unknown";
        const initial = name.charAt(0).toUpperCase();
        div.innerHTML = '<div class="friend-avatar" style="width:24px;height:24px;border-radius:50%;background:#555;display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:#fff;flex-shrink:0;">' + initial + '</div><span>' + name + (m.id === currentUser.id ? " (you)" : "") + '</span><span style="margin-left:auto;font-size:0.6rem;color:' + (isOnline ? '#aaa' : '#444') + '">' + (isOnline ? "●" : "○") + '</span>';
        container.appendChild(div);
      });
    }
  }

  /* ============ FRIENDS ============ */
  function initFriends() {
    document.querySelectorAll(".friend-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const subtab = btn.getAttribute("data-subtab");
        activeFriendSubtab = subtab;
        document.querySelectorAll(".friend-tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        document.querySelectorAll(".subtab-content").forEach(c => c.classList.remove("active"));
        if (subtab === "online" || subtab === "all") { document.getElementById("friends-list-view").classList.add("active"); renderFriendsList(); }
        else if (subtab === "pending") { document.getElementById("friends-pending-view").classList.add("active"); renderPendingList(); }
        else if (subtab === "add-friend") { document.getElementById("friends-add-view").classList.add("active"); const fb = document.getElementById("add-friend-feedback"); fb.style.display = "none"; document.getElementById("add-friend-input").value = ""; }
      });
    });

    document.getElementById("friend-search-input").addEventListener("input", () => {
      friendSearchQuery = document.getElementById("friend-search-input").value;
      renderFriendsList();
    });

    document.getElementById("btn-submit-friend-req").addEventListener("click", () => {
      const val = document.getElementById("add-friend-input").value.trim();
      const fb = document.getElementById("add-friend-feedback");
      fb.className = "feedback-msg";
      fb.style.display = "none";
      if (!val) return;
      wsSend({ type: "friend:request", username: val });
      fb.textContent = "Request sent!";
      fb.classList.add("success");
      fb.style.display = "block";
      document.getElementById("add-friend-input").value = "";
      setTimeout(() => { fb.style.display = "none"; }, 3000);
    });

    document.getElementById("add-friend-input").addEventListener("keypress", (e) => {
      if (e.key === "Enter") document.getElementById("btn-submit-friend-req").click();
    });

    renderFriendsList();
    renderPendingList();
    initGroupChats();
  }

  function renderFriendsList() {
    const container = document.getElementById("friends-scroller-list");
    container.innerHTML = "";
    let list = friends;
    if (activeFriendSubtab === "online") list = friends.filter(f => f.status === "online" || onlineUserIds.has(f.id));
    else list = friends.filter(f => !pendingRequests.incoming.some(r => r.id === f.id) && !pendingRequests.outgoing.some(r => r.id === f.id));
    const query = friendSearchQuery.trim().toLowerCase();
    if (query) list = list.filter(f => (f.username || "").toLowerCase().includes(query));

    if (!list.length) { container.innerHTML = '<div style="text-align:center;padding:16px;font-size:0.7rem;color:var(--text-muted);">No friends found.</div>'; return; }

    list.forEach(friend => {
      const item = document.createElement("div");
      item.className = "friend-item" + (activeChatType === "dm" && activeDmFriendId === friend.id ? " active" : "");
      const status = friend.status || "offline";
      const displayName = friend.displayName || friend.username;
      const discriminator = friend.discriminator || friend.id.substring(0, 4);
      const customStatus = friend.customStatus || "";
      item.innerHTML = '<div class="friend-info-left"><div class="friend-avatar-wrapper"><div class="friend-avatar" style="background-color:' + (friend.avatarColor || "#555") + '">' + displayName.charAt(0).toUpperCase() + '</div><div class="status-indicator ' + status + '"></div></div><div class="friend-details"><div class="friend-username-row"><span class="friend-name">' + displayName + '</span><span class="friend-tag">#' + discriminator + '</span></div><div class="friend-custom-status">' + (customStatus || status) + '</div></div></div><div class="friend-actions"><button class="friend-action-btn btn-quick-dm" title="Message">💬</button><button class="friend-action-btn btn-remove-friend decline" title="Remove">✖</button></div>';

      item.addEventListener("click", (e) => { if (!e.target.closest(".friend-action-btn")) openDirectMessage(friend.id); });
      item.querySelector(".btn-quick-dm").addEventListener("click", () => openDirectMessage(friend.id));
      item.querySelector(".btn-remove-friend").addEventListener("click", () => {
        if (confirm("Remove " + displayName + "?")) {
          wsSend({ type: "friend:remove", friendId: friend.id });
          showToast("Removed @" + friend.username, "info");
          if (activeChatType === "dm" && activeDmFriendId === friend.id) {
            if (servers.length > 0) { activeChatType = "channel"; activeServerId = servers[0].id; activeChannelId = servers[0].channels[0].id; }
            updateChatHeader();
            renderChat();
            renderServers();
            renderChannels();
          }
        }
      });
      container.appendChild(item);
    });
  }

  function openDirectMessage(friendId) {
    activeChatType = "dm";
    activeDmFriendId = friendId;
    activeGroupChatId = null;
    document.querySelectorAll(".channel-btn").forEach(b => b.classList.remove("active"));
    const key = "dm_" + friendId;
    if (!messages[key]) loadMessages(key);
    renderFriendsList();
    updateChatHeader();
    renderChat();
    switchNav("dms");
  }

  function renderPendingList() {
    const container = document.getElementById("friends-pending-list");
    container.innerHTML = "";
    const incoming = pendingRequests.incoming || [];
    const outgoing = pendingRequests.outgoing || [];
    if (!incoming.length && !outgoing.length) { container.innerHTML = '<div style="text-align:center;padding:16px;font-size:0.7rem;color:var(--text-muted);">No pending requests.</div>'; return; }
    incoming.forEach(req => {
      const item = document.createElement("div");
      item.className = "friend-item";
      const displayName = req.displayName || req.username;
      item.innerHTML = '<div class="friend-info-left"><div class="friend-avatar-wrapper"><div class="friend-avatar" style="background-color:#555">' + displayName.charAt(0).toUpperCase() + '</div><div class="status-indicator offline"></div></div><div class="friend-details"><div class="friend-username-row"><span class="friend-name">' + displayName + '</span></div><div><span class="pending-badge">Incoming Request</span></div></div></div><div class="friend-actions"><button class="friend-action-btn btn-accept-req" title="Accept">✔</button><button class="friend-action-btn btn-cancel-req decline" title="Decline">✖</button></div>';
      item.querySelector(".btn-accept-req").addEventListener("click", () => {
        wsSend({ type: "friend:accept", friendId: req.id });
        pendingRequests.incoming = pendingRequests.incoming.filter(r => r.id !== req.id);
        renderPendingList();
      });
      item.querySelector(".btn-cancel-req").addEventListener("click", () => {
        wsSend({ type: "friend:remove", friendId: req.id });
        pendingRequests.incoming = pendingRequests.incoming.filter(r => r.id !== req.id);
        renderPendingList();
      });
      container.appendChild(item);
    });
    outgoing.forEach(req => {
      const item = document.createElement("div");
      item.className = "friend-item";
      const displayName = req.displayName || req.username;
      item.innerHTML = '<div class="friend-info-left"><div class="friend-avatar-wrapper"><div class="friend-avatar" style="background-color:#555">' + displayName.charAt(0).toUpperCase() + '</div><div class="status-indicator offline"></div></div><div class="friend-details"><div class="friend-username-row"><span class="friend-name">' + displayName + '</span></div><div><span class="pending-badge">Outgoing Request</span></div></div></div><div class="friend-actions"><button class="friend-action-btn btn-cancel-req decline" title="Cancel">✖</button></div>';
      item.querySelector(".btn-cancel-req").addEventListener("click", () => {
        wsSend({ type: "friend:remove", friendId: req.id });
        pendingRequests.outgoing = pendingRequests.outgoing.filter(r => r.id !== req.id);
        renderPendingList();
      });
      container.appendChild(item);
    });
  }

  /* ============ SETTINGS ============ */
  function initSettings() {
    document.getElementById("btn-settings").addEventListener("click", () => {
      document.getElementById("settings-panel").classList.remove("hidden");
      document.getElementById("settings-display-name").value = currentUser.displayName || "";
      document.getElementById("settings-bio").value = currentUser.bio || "";
      document.getElementById("settings-status").value = currentUser.status || "online";
      document.getElementById("settings-custom-status").value = currentUser.customStatus || "";
      document.getElementById("settings-password").value = "";
      document.getElementById("settings-theme").value = currentUser.theme || "dark";
      const avatar = document.getElementById("settings-avatar");
      if (currentUser.profilePic) {
        avatar.style.backgroundImage = "url(" + currentUser.profilePic + ")";
        avatar.style.backgroundSize = "cover";
        avatar.textContent = "";
      } else {
        avatar.style.backgroundImage = "";
        avatar.textContent = (currentUser.displayName || "U").charAt(0).toUpperCase();
      }
    });

    document.getElementById("btn-settings-close").addEventListener("click", () => { document.getElementById("settings-panel").classList.add("hidden"); });
    document.getElementById("btn-upload-pic").addEventListener("click", () => { document.getElementById("file-upload-input").click(); });

    document.getElementById("file-upload-input").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        currentUser.profilePic = event.target.result;
        document.getElementById("settings-avatar").style.backgroundImage = "url(" + event.target.result + ")";
        document.getElementById("settings-avatar").style.backgroundSize = "cover";
        document.getElementById("settings-avatar").textContent = "";
      };
      reader.readAsDataURL(file);
    });

    document.getElementById("btn-settings-save").addEventListener("click", () => {
      const displayName = document.getElementById("settings-display-name").value.trim() || currentUser.displayName;
      const bio = document.getElementById("settings-bio").value.trim();
      const status = document.getElementById("settings-status").value;
      const customStatus = document.getElementById("settings-custom-status").value.trim();
      const theme = document.getElementById("settings-theme").value;

      currentUser.displayName = displayName;
      currentUser.bio = bio;
      currentUser.status = status;
      currentUser.customStatus = customStatus;
      currentUser.theme = theme;

      document.documentElement.setAttribute("data-theme", theme);
      wsSend({ type: "profile:update", displayName, bio, status, customStatus, theme, profilePic: currentUser.profilePic });

      document.getElementById("settings-panel").classList.add("hidden");
      updateChatHeader();
      renderChat();
      showToast("Settings saved!", "success");
    });

    // Settings theme selector preview
    document.getElementById("settings-theme").addEventListener("change", function() {
      document.documentElement.setAttribute("data-theme", this.value);
    });
  }

  /* ============ LOGOUT ============ */
  document.getElementById("btn-logout").addEventListener("click", () => {
    if (confirm("Are you sure you want to log out?")) {
      stopCall();
      if (ws) ws.close();
      token = null;
      localStorage.removeItem("dangro_token");
      currentUser = null;
      friends = [];
      servers = [];
      groupChats = [];
      messages = {};
      document.getElementById("app-container").classList.add("hidden");
      document.getElementById("login-screen").classList.remove("hidden");
      document.getElementById("settings-panel").classList.add("hidden");
      document.getElementById("auth-username").value = "";
      document.getElementById("auth-password").value = "";
      isSignupMode = false;
      document.getElementById("auth-display-name").classList.add("hidden");
      document.getElementById("btn-auth-submit").textContent = "Log In";
      document.getElementById("login-subtitle").textContent = "Log in to your account";
      document.getElementById("auth-toggle-msg").textContent = "Don't have an account?";
      document.getElementById("auth-toggle-btn").textContent = "Sign Up";
      showToast("Logged out successfully", "info");
    }
  });

  /* ============ CALL SYSTEM ============ */
  function initCall() {
    document.getElementById("btn-call-start").addEventListener("click", () => {
      if (activeChatType === "dm" && activeDmFriendId) {
        startCall(activeDmFriendId);
      } else {
        showToast("Open a DM to start a call", "error");
      }
    });
    document.getElementById("btn-call-end").addEventListener("click", stopCall);
    document.getElementById("btn-answer-call").addEventListener("click", answerCall);
    document.getElementById("btn-decline-call").addEventListener("click", () => {
      document.getElementById("call-notification").classList.add("hidden");
      if (pendingCallOffer) {
        wsSend({ type: "call:end", targetUserId: pendingCallOffer.fromUserId });
        pendingCallOffer = null;
      }
      showToast("Call declined", "info");
    });

    document.getElementById("btn-toggle-mic").addEventListener("click", () => {
      isMicMuted = !isMicMuted;
      document.getElementById("btn-toggle-mic").classList.toggle("muted", isMicMuted);
      if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = !isMicMuted);
    });
    document.getElementById("btn-toggle-video").addEventListener("click", () => {
      isVideoOff = !isVideoOff;
      document.getElementById("btn-toggle-video").classList.toggle("muted", isVideoOff);
      if (localStream) localStream.getVideoTracks().forEach(t => t.enabled = !isVideoOff);
    });
    document.getElementById("btn-toggle-screen").addEventListener("click", toggleScreenShare);
    document.getElementById("btn-toggle-volume").addEventListener("click", () => {
      isVolumeMuted = !isVolumeMuted;
      document.getElementById("btn-toggle-volume").classList.toggle("muted", isVolumeMuted);
      const remote = document.getElementById("remote-video");
      if (remote) remote.muted = isVolumeMuted;
    });
  }

  async function startCall(targetUserId) {
    if (callActive) return;
    callTargetUserId = targetUserId;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      document.getElementById("local-video").srcObject = localStream;
      callActive = true;
      callParticipants = ["You"];
      callStartTime = Date.now();
      document.getElementById("call-container").classList.remove("hidden");
      document.getElementById("participant-count").textContent = callParticipants.length;
      startCallTimer();

      const peerConnection = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      currentPeerConnection = peerConnection;

      localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

      peerConnection.ontrack = (event) => {
        if (event.streams[0]) {
          remoteStream = event.streams[0];
          document.getElementById("remote-video").srcObject = remoteStream;
          const target = friends.find(f => f.id === targetUserId);
          document.getElementById("remote-video-label").textContent = target ? (target.displayName || target.username) : "Participant";
          if (!callParticipants.includes("Participant")) callParticipants.push("Participant");
          document.getElementById("participant-count").textContent = callParticipants.length;
        }
      };

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          wsSend({ type: "call:ice", targetUserId, candidate: event.candidate });
        }
      };

      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === "disconnected" || peerConnection.connectionState === "failed") {
          stopCall();
        }
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      wsSend({ type: "call:offer", targetUserId, sdp: offer });

      showToast("Call started!", "success");
    } catch (err) {
      showToast("Could not access camera/mic: " + err.message, "error");
      callActive = false;
    }
  }

  function stopCall() {
    if (currentPeerConnection) {
      currentPeerConnection.close();
      currentPeerConnection = null;
    }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (remoteStream) { remoteStream.getTracks().forEach(t => t.stop()); remoteStream = null; }
    document.getElementById("local-video").srcObject = null;
    document.getElementById("remote-video").srcObject = null;
    document.getElementById("remote-video-label").textContent = "Participant";
    if (callTargetUserId) {
      wsSend({ type: "call:end", targetUserId: callTargetUserId });
    }
    callActive = false;
    callTargetUserId = null;
    callParticipants = [];
    isMicMuted = false; isVideoOff = false; isScreenSharing = false; isVolumeMuted = false;
    document.querySelectorAll(".call-control-btn").forEach(b => { b.classList.remove("muted"); b.classList.add("active"); });
    document.getElementById("call-container").classList.add("hidden");
    document.getElementById("call-notification").classList.add("hidden");
    document.getElementById("participant-count").textContent = "0";
    if (callInterval) { clearInterval(callInterval); callInterval = null; }
    callStartTime = null;
    pendingCallOffer = null;
    showToast("Call ended", "info");
  }

  function startCallTimer() {
    if (callInterval) clearInterval(callInterval);
    callInterval = setInterval(() => {
      if (!callStartTime) return;
      const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
      const mins = Math.floor(elapsed / 60).toString().padStart(2, "0");
      const secs = (elapsed % 60).toString().padStart(2, "0");
      document.getElementById("call-timer").textContent = mins + ":" + secs;
    }, 1000);
  }

  async function toggleScreenShare() {
    if (!callTargetUserId) return;
    if (isScreenSharing) {
      if (localStream) {
        const tracks = localStream.getVideoTracks();
        tracks.forEach(t => t.stop());
      }
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: !isMicMuted });
        localStream = newStream;
        document.getElementById("local-video").srcObject = newStream;
        const sender = currentPeerConnection?.getSenders().find(s => s.track?.kind === "video");
        if (sender) sender.replaceTrack(newStream.getVideoTracks()[0]);
      } catch (e) {}
      isScreenSharing = false;
      document.getElementById("btn-toggle-screen").classList.remove("muted");
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        screenStream.getVideoTracks()[0].addEventListener("ended", () => {
          isScreenSharing = false;
          document.getElementById("btn-toggle-screen").classList.remove("muted");
          navigator.mediaDevices.getUserMedia({ video: true }).then(s => {
            localStream = s;
            document.getElementById("local-video").srcObject = s;
            const sender = currentPeerConnection?.getSenders().find(s => s.track?.kind === "video");
            if (sender) sender.replaceTrack(s.getVideoTracks()[0]);
          });
        });
        localStream = screenStream;
        document.getElementById("local-video").srcObject = screenStream;
        const sender = currentPeerConnection?.getSenders().find(s => s.track?.kind === "video");
        if (sender) sender.replaceTrack(screenStream.getVideoTracks()[0]);
        isScreenSharing = true;
        document.getElementById("btn-toggle-screen").classList.add("muted");
      } catch (e) {}
    }
  }

  function answerCall() {
    document.getElementById("call-notification").classList.add("hidden");
    if (!pendingCallOffer) return;
    const fromUserId = pendingCallOffer.fromUserId;
    callTargetUserId = fromUserId;
    const offer = pendingCallOffer.sdp;
    pendingCallOffer = null;

    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
      localStream = stream;
      document.getElementById("local-video").srcObject = stream;
      callActive = true;
      callParticipants = ["You"];
      callStartTime = Date.now();
      document.getElementById("call-container").classList.remove("hidden");
      document.getElementById("participant-count").textContent = callParticipants.length;
      startCallTimer();

      const peerConnection = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      currentPeerConnection = peerConnection;

      localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

      peerConnection.ontrack = (event) => {
        if (event.streams[0]) {
          remoteStream = event.streams[0];
          document.getElementById("remote-video").srcObject = remoteStream;
          const target = friends.find(f => f.id === fromUserId);
          document.getElementById("remote-video-label").textContent = target ? (target.displayName || target.username) : "Participant";
          if (!callParticipants.includes("Participant")) callParticipants.push("Participant");
          document.getElementById("participant-count").textContent = callParticipants.length;
        }
      };

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          wsSend({ type: "call:ice", targetUserId: fromUserId, candidate: event.candidate });
        }
      };

      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === "disconnected" || peerConnection.connectionState === "failed") {
          stopCall();
        }
      };

      peerConnection.setRemoteDescription(new RTCSessionDescription(offer)).then(() => {
        return peerConnection.createAnswer();
      }).then(answer => {
        return peerConnection.setLocalDescription(answer);
      }).then(() => {
        wsSend({ type: "call:answer", targetUserId: fromUserId, sdp: peerConnection.localDescription });
      });

      showToast("Call connected!", "success");
    }).catch(err => {
      showToast("Could not access camera/mic: " + err.message, "error");
    });
  }

  function handleCallAnswer(msg) {
    if (currentPeerConnection && currentPeerConnection.signalingState !== "stable") {
      currentPeerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp)).catch(e => {});
    }
  }

  function handleCallIce(msg) {
    if (currentPeerConnection && msg.candidate) {
      currentPeerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(e => {});
    }
  }

  function showIncomingCall(fromUsername) {
    if (callActive) return;
    document.getElementById("call-notif-name").textContent = fromUsername;
    document.getElementById("call-notification").classList.remove("hidden");
  }

  /* ============ RENDER ALL ============ */
  function renderAll() {
    updateChatHeader();
    if (getActiveChatKey() && messages[getActiveChatKey()]) renderChat();
    renderServers();
    renderChannels();
    renderFriendsList();
    renderGroupChats();
    renderYoutubeFeed();
    renderInstagramFeed();
  }
});
