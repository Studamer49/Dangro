const DANGRO_MOCK_DATA = {
  servers: [
    {
      id: "dangro-hq",
      name: "Dangro HQ",
      icon: "⚡",
      channels: [
        { id: "general", name: "general" },
        { id: "announcements", name: "announcements" },
        { id: "memes", name: "memes" },
        { id: "dev-chat", name: "dev-chat" }
      ]
    },
    {
      id: "gamers-sanctuary",
      name: "Gamers Sanctuary",
      icon: "🎮",
      channels: [
        { id: "lobby", name: "lobby" },
        { id: "clips", name: "clips" },
        { id: "hardware-talk", name: "hardware-talk" }
      ]
    },
    {
      id: "creative-lounge",
      name: "Creative Lounge",
      icon: "🎨",
      channels: [
        { id: "art-gallery", name: "art-gallery" },
        { id: "music-vibes", name: "music-vibes" },
        { id: "writing", name: "writing" }
      ]
    }
  ],

  friends: [
    {
      id: "pixel_alex",
      username: "pixel_alex",
      discriminator: "4829",
      status: "online",
      customStatus: "Coding in JavaScript... 💻",
      avatarColor: "#8b5cf6"
    },
    {
      id: "cyber_sam",
      username: "cyber_sam",
      discriminator: "1932",
      status: "idle",
      customStatus: "AFK grabbing coffee ☕",
      avatarColor: "#3b82f6"
    },
    {
      id: "neon_lisa",
      username: "neon_lisa",
      discriminator: "7721",
      status: "dnd",
      customStatus: "In a deep state of flow 🧠",
      avatarColor: "#ec4899"
    },
    {
      id: "ghost_rider",
      username: "ghost_rider",
      discriminator: "9901",
      status: "offline",
      customStatus: "",
      avatarColor: "#6b7280"
    },
    {
      id: "retro_gamer",
      username: "retro_gamer",
      discriminator: "5504",
      status: "online",
      customStatus: "Playing Retro City 🕹️",
      avatarColor: "#f59e0b"
    }
  ],

  initialMessages: {
    "dangro-hq_general": [
      { id: "m1", sender: "pixel_alex", content: "Welcome to Dangro HQ! Excited to build this awesome chat interface.", timestamp: "Today at 5:12 PM" },
      { id: "m2", sender: "cyber_sam", content: "The resizable panel layout is so smooth. Love the cosmic vibe.", timestamp: "Today at 5:14 PM" },
      { id: "m3", sender: "neon_lisa", content: "Did anyone check out the YouTube/Instagram simulator on the left? That is incredibly cool.", timestamp: "Today at 5:15 PM" }
    ],
    "dangro-hq_announcements": [
      { id: "a1", sender: "System", content: "📢 Dangro Beta v1.0.0 is officially live! Test out the sliding layout, add some friends, and check out the integrated tools.", timestamp: "Yesterday at 12:00 PM", system: true }
    ],
    "dangro-hq_memes": [
      { id: "me1", sender: "retro_gamer", content: "Me after designing a CSS grid that actually works on the first try:", timestamp: "Today at 3:30 PM" },
      { id: "me2", sender: "pixel_alex", content: "https://images.unsplash.com/photo-1531297484001-80022131f5a1?auto=format&fit=crop&w=400&q=80", timestamp: "Today at 3:32 PM", isImage: true }
    ],
    "dm_pixel_alex": [
      { id: "dm1", sender: "pixel_alex", content: "Hey! Let me know if you want to test out some code changes.", timestamp: "Today at 4:00 PM" },
      { id: "dm2", sender: "You", content: "Will do! Checking out the layout now.", timestamp: "Today at 4:02 PM" }
    ],
    "dm_cyber_sam": [
      { id: "dm3", sender: "cyber_sam", content: "Hey there, did you finish customizing the sliders?", timestamp: "Today at 10:15 AM" }
    ]
  },

  youtubeVideos: [
    {
      id: "dQw4w9WgXcQ",
      title: "Rick Astley - Never Gonna Give You Up (Official Music Video)",
      channelName: "Rick Astley",
      views: "1.4B views",
      likes: "17M likes",
      thumbnail: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80"
    },
    {
      id: "jfKfPfyJRdk",
      title: "lofi hip hop radio 🌌 beats to relax/study to",
      channelName: "Lofi Girl",
      views: "68M views",
      likes: "2.3M likes",
      thumbnail: "https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=400&q=80"
    },
    {
      id: "2g811Eo7K8U",
      title: "Modern Web Design Aesthetics - CSS Secrets",
      channelName: "AestheticCodes",
      views: "154K views",
      likes: "12K likes",
      thumbnail: "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=400&q=80"
    }
  ],

  instagramPosts: [
    {
      id: "ig1",
      username: "design_inspiration",
      userAvatarColor: "#3b82f6",
      image: "https://images.unsplash.com/photo-1541462608141-2f5287b4e93d?auto=format&fit=crop&w=500&q=80",
      likes: 1243,
      caption: "Stunning glassmorphic dashboard concepts. Minimalist, functional, and gorgeous. What do you think? ✨ #uidesign #glassmorphism #interfacedesign",
      liked: false,
      comments: [
        { username: "pixel_craft", text: "Wow, the colors are amazing!" },
        { username: "ux_lily", text: "Love the blur effect on the panels." }
      ]
    },
    {
      id: "ig2",
      username: "setup_goals",
      userAvatarColor: "#10b981",
      image: "https://images.unsplash.com/photo-1547082299-de196ea013d6?auto=format&fit=crop&w=500&q=80",
      likes: 852,
      caption: "Late night coding session. Cosmic vibes only! 🌌🚀 Rate this setup 1-10.",
      liked: true,
      comments: [
        { username: "coder_dan", text: "Solid 10/10, keyboard specs?" },
        { username: "neon_vibes", text: "That ambient lighting is perfect." }
      ]
    }
  ]
};
