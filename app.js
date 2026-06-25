/* ==========================================================================
   DANGRO CLIENT-SIDE APP ENGINE
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  // --- APPLICATION STATE ---
  let state = {
    servers: [],
    friends: [],
    messages: {},
    youtubeVideos: [],
    instagramPosts: [],
    
    // Navigation State
    activeChatType: "channel", // "channel" or "dm"
    activeServerId: "dangro-hq",
    activeChannelId: "general",
    activeDmFriendId: null,
    
    // UI Panels State (Widths and collapse)
    leftPanelWidth: 25, // percentage
    rightPanelWidth: 18.75, // percentage
    leftPanelCollapsed: false,
    rightPanelCollapsed: false,
    
    // Left panel tab
    activeLeftTab: "youtube-client",
    
    // Social panel tab
    activeFriendSubtab: "online",
    friendSearchQuery: "",
    chatSearchQuery: "",

    // Current YouTube video
    activeYtVideoId: "dQw4w9WgXcQ"
  };

  // --- LOCAL STORAGE SYNCHRONIZATION ---
  function loadState() {
    const localData = localStorage.getItem("dangro_state");
    if (localData) {
      try {
        const parsed = JSON.parse(localData);
        state.servers = parsed.servers || DANGRO_MOCK_DATA.servers;
        state.friends = parsed.friends || DANGRO_MOCK_DATA.friends;
        state.messages = parsed.messages || DANGRO_MOCK_DATA.initialMessages;
        state.youtubeVideos = parsed.youtubeVideos || DANGRO_MOCK_DATA.youtubeVideos;
        state.instagramPosts = parsed.instagramPosts || DANGRO_MOCK_DATA.instagramPosts;
        
        // Restore layout preferences
        if (parsed.leftPanelWidth) state.leftPanelWidth = parsed.leftPanelWidth;
        if (parsed.rightPanelWidth) state.rightPanelWidth = parsed.rightPanelWidth;
        state.leftPanelCollapsed = !!parsed.leftPanelCollapsed;
        state.rightPanelCollapsed = !!parsed.rightPanelCollapsed;
      } catch (e) {
        console.error("Error parsing local state, loading mock defaults", e);
        loadDefaults();
      }
    } else {
      loadDefaults();
    }
  }

  function loadDefaults() {
    state.servers = DANGRO_MOCK_DATA.servers;
    state.friends = DANGRO_MOCK_DATA.friends;
    state.messages = JSON.parse(JSON.stringify(DANGRO_MOCK_DATA.initialMessages)); // Deep clone
    state.youtubeVideos = DANGRO_MOCK_DATA.youtubeVideos;
    state.instagramPosts = DANGRO_MOCK_DATA.instagramPosts;
    saveState();
  }

  function saveState() {
    localStorage.setItem("dangro_state", JSON.stringify({
      servers: state.servers,
      friends: state.friends,
      messages: state.messages,
      youtubeVideos: state.youtubeVideos,
      instagramPosts: state.instagramPosts,
      leftPanelWidth: state.leftPanelWidth,
      rightPanelWidth: state.rightPanelWidth,
      leftPanelCollapsed: state.leftPanelCollapsed,
      rightPanelCollapsed: state.rightPanelCollapsed
    }));
  }

  // --- TOAST NOTIFICATIONS ---
  function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    // Add brief icon representation
    let icon = "⚡";
    if (type === "success") icon = "✅";
    if (type === "error") icon = "❌";
    
    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <div class="toast-msg">${message}</div>
    `;

    container.appendChild(toast);

    // Auto fade out
    setTimeout(() => {
      toast.classList.add("fade-out");
      toast.addEventListener("animationend", () => {
        toast.remove();
      });
    }, 3200);
  }

  // --- INITIALIZE & DOM CACHE ---
  loadState();

  const appContainer = document.getElementById("app-container");
  const leftPanel = document.getElementById("left-panel");
  const rightPanel = document.getElementById("right-panel");
  
  // Dividers
  const divLeft = document.getElementById("divider-left");
  const divRight = document.getElementById("divider-right");
  
  // Collapse Buttons
  const btnCollapseLeft = document.getElementById("btn-collapse-left");
  const btnExpandLeft = document.getElementById("btn-expand-left");
  const btnCollapseRight = document.getElementById("btn-collapse-right");
  const btnExpandRight = document.getElementById("btn-expand-right");

  // --- PANEL RESIZING CONTROLLER ---
  let isDraggingLeft = false;
  let isDraggingRight = false;

  function initLayout() {
    // Apply width preferences
    const lw = state.leftPanelCollapsed ? 0 : state.leftPanelWidth;
    const rw = state.rightPanelCollapsed ? 0 : state.rightPanelWidth;
    const mw = 100 - lw - rw;

    appContainer.style.setProperty("--left-width", `${lw}%`);
    appContainer.style.setProperty("--right-width", `${rw}%`);
    appContainer.style.setProperty("--middle-width", `${mw}%`);

    // Toggle collapse classes
    if (state.leftPanelCollapsed) {
      leftPanel.classList.add("collapsed");
      btnCollapseLeft.classList.add("hidden");
      btnExpandLeft.classList.remove("hidden");
    } else {
      leftPanel.classList.remove("collapsed");
      btnCollapseLeft.classList.remove("hidden");
      btnExpandLeft.classList.add("hidden");
    }

    if (state.rightPanelCollapsed) {
      rightPanel.classList.add("collapsed");
      btnCollapseRight.classList.add("hidden");
      btnExpandRight.classList.remove("hidden");
    } else {
      rightPanel.classList.remove("collapsed");
      btnCollapseRight.classList.remove("hidden");
      btnExpandRight.classList.add("hidden");
    }
  }

  // Resizing events mouse & touch
  divLeft.addEventListener("mousedown", (e) => {
    // Only drag if not clicking arrow buttons
    if (e.target.closest(".divider-arrow")) return;
    isDraggingLeft = true;
    divLeft.classList.add("dragging");
    document.body.style.cursor = "col-resize";
  });

  divRight.addEventListener("mousedown", (e) => {
    if (e.target.closest(".divider-arrow")) return;
    isDraggingRight = true;
    divRight.classList.add("dragging");
    document.body.style.cursor = "col-resize";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDraggingLeft && !isDraggingRight) return;
    e.preventDefault();

    const screenWidth = window.innerWidth;
    const mouseX = e.clientX;

    if (isDraggingLeft) {
      // Calculate left panel width percentage
      let newPercent = (mouseX / screenWidth) * 100;
      // Enforce bounds (15% to 45%)
      if (newPercent < 12) {
        // Snap collapse if dragged too small
        state.leftPanelCollapsed = true;
        isDraggingLeft = false;
        divLeft.classList.remove("dragging");
        showToast("Left Hub Panel Collapsed", "info");
        saveState();
        initLayout();
        return;
      } else {
        state.leftPanelCollapsed = false;
        if (newPercent > 45) newPercent = 45;
        state.leftPanelWidth = newPercent;
      }
    }

    if (isDraggingRight) {
      // Calculate right panel width percentage from right side
      let newPercent = ((screenWidth - mouseX) / screenWidth) * 100;
      // Enforce bounds (12% to 40%)
      if (newPercent < 12) {
        state.rightPanelCollapsed = true;
        isDraggingRight = false;
        divRight.classList.remove("dragging");
        showToast("Right Hub Panel Collapsed", "info");
        saveState();
        initLayout();
        return;
      } else {
        state.rightPanelCollapsed = false;
        if (newPercent > 40) newPercent = 40;
        state.rightPanelWidth = newPercent;
      }
    }

    initLayout();
  });

  document.addEventListener("mouseup", () => {
    if (isDraggingLeft || isDraggingRight) {
      isDraggingLeft = false;
      isDraggingRight = false;
      divLeft.classList.remove("dragging");
      divRight.classList.remove("dragging");
      document.body.style.cursor = "default";
      saveState();
    }
  });

  // Collapse / Expand Click Handlers
  btnCollapseLeft.addEventListener("click", () => {
    state.leftPanelCollapsed = true;
    saveState();
    initLayout();
  });

  btnExpandLeft.addEventListener("click", () => {
    state.leftPanelCollapsed = false;
    saveState();
    initLayout();
  });

  btnCollapseRight.addEventListener("click", () => {
    state.rightPanelCollapsed = true;
    saveState();
    initLayout();
  });

  btnExpandRight.addEventListener("click", () => {
    state.rightPanelCollapsed = false;
    saveState();
    initLayout();
  });

  // Initial layout set
  initLayout();


  // --- LEFT PANEL ROUTER & TAB CONTROLLER ---
  const tabButtons = document.querySelectorAll(".panel-tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const tabId = btn.getAttribute("data-tab");
      state.activeLeftTab = tabId;
      
      // Update UI active tab buttons
      tabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // Update UI active tab content
      tabContents.forEach(content => {
        content.classList.remove("active");
        if (content.id === tabId) {
          content.classList.add("active");
        }
      });

      // Special actions on tab load
      if (tabId === "youtube-client") {
        renderYoutubeFeed();
      } else if (tabId === "instagram-client") {
        renderInstagramFeed();
      }
    });
  });


  // --- YOUTUBE CLIENT SIMULATOR ENGINE ---
  const ytSearchInput = document.getElementById("yt-search-input");
  const ytSearchBtn = document.getElementById("yt-search-btn");
  const ytPlayer = document.getElementById("yt-player");
  const ytActiveTitle = document.getElementById("yt-active-title");
  const ytActiveChannel = document.getElementById("yt-active-channel");
  const ytActiveViews = document.getElementById("yt-active-views");
  const ytLikeBtn = document.getElementById("yt-like-btn");
  const ytRecommendations = document.getElementById("yt-recommendations");

  function playYoutubeVideo(videoId) {
    state.activeYtVideoId = videoId;
    ytPlayer.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    
    // Find video meta in our database
    const video = state.youtubeVideos.find(v => v.id === videoId);
    if (video) {
      ytActiveTitle.textContent = video.title;
      ytActiveChannel.textContent = video.channelName;
      ytActiveViews.textContent = `${video.views} • ${video.likes}`;
    } else {
      ytActiveTitle.textContent = `Custom YouTube Stream (${videoId})`;
      ytActiveChannel.textContent = "External Web Resource";
      ytActiveViews.textContent = "Active Stream Playback";
    }

    // Toggle liked class check
    ytLikeBtn.classList.remove("liked");
  }

  function renderYoutubeFeed(filterQuery = "") {
    ytRecommendations.innerHTML = "";
    
    const filtered = state.youtubeVideos.filter(video => 
      video.title.toLowerCase().includes(filterQuery.toLowerCase()) ||
      video.channelName.toLowerCase().includes(filterQuery.toLowerCase())
    );

    if (filtered.length === 0) {
      ytRecommendations.innerHTML = `<div style="padding: 10px; font-size: 0.8rem; color: var(--text-muted);">No videos match search query.</div>`;
      return;
    }

    filtered.forEach(video => {
      const card = document.createElement("div");
      card.className = "yt-video-card";
      card.innerHTML = `
        <div class="yt-card-thumbnail" style="background-image: url('${video.thumbnail}')"></div>
        <div class="yt-card-info">
          <div class="yt-card-title">${video.title}</div>
          <div class="yt-card-chan">${video.channelName}</div>
          <div class="yt-card-views">${video.views}</div>
        </div>
      `;
      card.addEventListener("click", () => {
        playYoutubeVideo(video.id);
      });
      ytRecommendations.appendChild(card);
    });
  }

  // Hook YouTube search
  function triggerYtSearch() {
    const query = ytSearchInput.value.trim();
    if (!query) {
      renderYoutubeFeed();
      return;
    }

    // Regex check if user pasted a YouTube video URL
    const urlPattern = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const match = query.match(urlPattern);

    if (match && match[1]) {
      const videoId = match[1];
      showToast("Pasted YouTube link detected! Streaming video...", "success");
      // Add custom video object temporarily
      if (!state.youtubeVideos.find(v => v.id === videoId)) {
        state.youtubeVideos.push({
          id: videoId,
          title: `Imported Stream: ${videoId}`,
          channelName: "Custom Link",
          views: "1 View",
          likes: "0 Likes",
          thumbnail: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&w=400&q=80"
        });
      }
      playYoutubeVideo(videoId);
      renderYoutubeFeed();
    } else {
      // Normal text query search
      renderYoutubeFeed(query);
    }
  }

  ytSearchBtn.addEventListener("click", triggerYtSearch);
  ytSearchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") triggerYtSearch();
  });

  ytLikeBtn.addEventListener("click", () => {
    ytLikeBtn.classList.toggle("liked");
    const liked = ytLikeBtn.classList.contains("liked");
    showToast(liked ? "Video liked! Added to preferences." : "Video like removed.", "success");
  });

  // Initial YouTube video load (Don't autoplay on initial page load to avoid browser blocks)
  ytPlayer.src = `https://www.youtube.com/embed/${state.activeYtVideoId}`;
  const defaultVideo = state.youtubeVideos.find(v => v.id === state.activeYtVideoId);
  if (defaultVideo) {
    ytActiveTitle.textContent = defaultVideo.title;
    ytActiveChannel.textContent = defaultVideo.channelName;
    ytActiveViews.textContent = `${defaultVideo.views} • ${defaultVideo.likes}`;
  }


  // --- INSTAGRAM CLIENT SIMULATOR ENGINE ---
  const igFeedContainer = document.getElementById("ig-feed-container");

  function renderInstagramFeed() {
    igFeedContainer.innerHTML = "";

    state.instagramPosts.forEach(post => {
      const postCard = document.createElement("div");
      postCard.className = "ig-post-card";
      
      // Build comments HTML list
      let commentsHTML = "";
      post.comments.forEach(comment => {
        commentsHTML += `
          <div class="ig-comment-item">
            <span class="commenter">${comment.username}</span>${comment.text}
          </div>
        `;
      });

      postCard.innerHTML = `
        <div class="ig-post-header">
          <div class="user-avatar-small" style="background-color: ${post.userAvatarColor}">
            ${post.username.charAt(0).toUpperCase()}
          </div>
          <span class="ig-post-author">${post.username}</span>
        </div>
        <div class="ig-post-image" style="background-image: url('${post.image}')"></div>
        <div class="ig-post-actions">
          <button class="ig-action-btn ${post.liked ? 'liked' : ''}" data-post-id="${post.id}">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
          <button class="ig-action-btn ig-comment-focus-btn">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path fill="currentColor" d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18zM18 14H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
            </svg>
          </button>
        </div>
        <div class="ig-post-likes">${post.likes.toLocaleString()} likes</div>
        <div class="ig-post-caption">
          <span class="author">${post.username}</span>${post.caption}
        </div>
        <div class="ig-comments-box">
          <div class="ig-comments-list">${commentsHTML}</div>
          <div class="ig-add-comment">
            <input type="text" placeholder="Add a comment..." class="ig-comment-input">
            <button class="ig-post-comment-btn" data-post-id="${post.id}">Post</button>
          </div>
        </div>
      `;

      // Event listener: Like button
      const likeBtn = postCard.querySelector(`.ig-action-btn[data-post-id="${post.id}"]`);
      likeBtn.addEventListener("click", () => {
        post.liked = !post.liked;
        post.likes += post.liked ? 1 : -1;
        saveState();
        renderInstagramFeed();
        
        if (post.liked) {
          showToast(`Liked ${post.username}'s post!`, "success");
        }
      });

      // Focus on input when comment icon clicked
      const commentFocusBtn = postCard.querySelector(".ig-comment-focus-btn");
      const commentInput = postCard.querySelector(".ig-comment-input");
      commentFocusBtn.addEventListener("click", () => {
        commentInput.focus();
      });

      // Submit comment on enter or click button
      const postCommentBtn = postCard.querySelector(".ig-post-comment-btn");
      function submitComment() {
        const text = commentInput.value.trim();
        if (!text) return;
        
        post.comments.push({
          username: "dangro_user",
          text: text
        });
        commentInput.value = "";
        saveState();
        renderInstagramFeed();
        showToast("Comment posted on Instagram feed!", "success");
      }

      postCommentBtn.addEventListener("click", submitComment);
      commentInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") submitComment();
      });

      igFeedContainer.appendChild(postCard);
    });
  }


  // --- BROWSER CLIENT VIEWPORT ENGINE ---
  const browserIframe = document.getElementById("browser-iframe");
  const browserUrlInput = document.getElementById("browser-url-input");
  const browserGoBtn = document.getElementById("browser-go-btn");
  const browserCspWarning = document.getElementById("browser-csp-warning");
  const closeWarningBtn = document.getElementById("close-warning-btn");
  
  // Navigation stack (Simulated)
  let browserHistory = ["https://wikipedia.org"];
  let browserHistoryIndex = 0;

  function loadBrowserUrl(url) {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }
    
    browserUrlInput.value = url;
    browserIframe.src = url;

    // Check if domain is likely to be frame-blocked (like google, youtube, instagram, facebook, github, discord)
    const blockedDomains = ["google.com", "youtube.com", "instagram.com", "facebook.com", "github.com", "discord.com", "twitter.com", "x.com"];
    const isBlocked = blockedDomains.some(domain => url.toLowerCase().includes(domain));
    
    if (isBlocked) {
      browserCspWarning.classList.remove("hidden");
    } else {
      browserCspWarning.classList.add("hidden");
    }
  }

  browserGoBtn.addEventListener("click", () => {
    const url = browserUrlInput.value.trim();
    if (url) {
      // Add to history stack
      browserHistory = browserHistory.slice(0, browserHistoryIndex + 1);
      browserHistory.push(url);
      browserHistoryIndex = browserHistory.length - 1;
      loadBrowserUrl(url);
    }
  });

  browserUrlInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") browserGoBtn.click();
  });

  closeWarningBtn.addEventListener("click", () => {
    browserCspWarning.classList.add("hidden");
  });

  document.getElementById("browser-back").addEventListener("click", () => {
    if (browserHistoryIndex > 0) {
      browserHistoryIndex--;
      loadBrowserUrl(browserHistory[browserHistoryIndex]);
    } else {
      showToast("At beginning of browser history", "info");
    }
  });

  document.getElementById("browser-forward").addEventListener("click", () => {
    if (browserHistoryIndex < browserHistory.length - 1) {
      browserHistoryIndex++;
      loadBrowserUrl(browserHistory[browserHistoryIndex]);
    } else {
      showToast("At end of browser history", "info");
    }
  });

  document.getElementById("browser-refresh").addEventListener("click", () => {
    browserIframe.src = browserIframe.src;
    showToast("Reloading frame...", "info");
  });


  // --- MAIN CHAT SYSTEM ENGINE ---
  const chatMessagesContainer = document.getElementById("chat-messages-container");
  const chatHeaderPrefix = document.getElementById("chat-header-prefix");
  const chatHeaderName = document.getElementById("chat-header-name");
  const chatHeaderDesc = document.getElementById("chat-header-desc");
  const messageInput = document.getElementById("message-input");
  const btnSendMessage = document.getElementById("btn-send-message");
  const typingIndicator = document.getElementById("typing-indicator");
  const typingText = document.getElementById("typing-text");

  // Chat key getter
  function getActiveChatKey() {
    if (state.activeChatType === "channel") {
      return `${state.activeServerId}_${state.activeChannelId}`;
    } else {
      return `dm_${state.activeDmFriendId}`;
    }
  }

  // Auto-grow textarea input
  messageInput.addEventListener("input", () => {
    messageInput.style.height = "auto";
    messageInput.style.height = (messageInput.scrollHeight) + "px";
  });

  // Render chat messages
  function renderChat() {
    chatMessagesContainer.innerHTML = "";
    const key = getActiveChatKey();
    const chatList = state.messages[key] || [];

    // Filter by search query if exists
    const query = state.chatSearchQuery.trim().toLowerCase();
    const filtered = chatList.filter(msg => 
      msg.content.toLowerCase().includes(query) ||
      msg.sender.toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
      chatMessagesContainer.innerHTML = `
        <div style="flex-grow:1; display:flex; flex-direction:column; align-items:center; justify-content:center; color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 20px;">
          <div style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.5;">💬</div>
          <h4>No Messages Found</h4>
          <p style="font-size: 0.75rem; margin-top:4px;">${query ? 'Try searching for something else' : 'Start the conversation by typing below!'}</p>
        </div>
      `;
      return;
    }

    filtered.forEach(msg => {
      const isMe = msg.sender === "You";
      
      const item = document.createElement("div");
      item.className = `message-item ${msg.system ? 'system-msg' : ''}`;
      
      // Determine profile avatar and color
      let avatarChar = "S";
      let avatarColor = "#6b7280";
      
      if (msg.system) {
        avatarChar = "⚙️";
        avatarColor = "transparent";
      } else if (isMe) {
        avatarChar = "U";
        avatarColor = "var(--accent)";
      } else {
        // Find sender in friends
        const senderFriend = state.friends.find(f => f.username === msg.sender);
        avatarChar = msg.sender.charAt(0).toUpperCase();
        avatarColor = senderFriend ? senderFriend.avatarColor : "#8b5cf6";
      }

      // Check if message is an image URL
      let contentHTML = `<div class="msg-content">${msg.content}</div>`;
      if (msg.isImage || msg.content.match(/\.(jpeg|jpg|gif|png)$/) != null || msg.content.startsWith("https://images.unsplash.com/")) {
        contentHTML = `
          <div class="msg-content">${msg.content}</div>
          <div class="msg-image-attachment">
            <img src="${msg.content}" alt="Attachment preview" onerror="this.src='https://images.unsplash.com/photo-1594322436404-5a0526db4d13?auto=format&fit=crop&w=400&q=80'">
          </div>
        `;
      }

      item.innerHTML = `
        <div class="msg-avatar" style="background-color: ${avatarColor}">
          ${avatarChar}
        </div>
        <div class="msg-body">
          <div class="msg-header">
            <span class="msg-sender">${msg.sender}</span>
            <span class="msg-time">${msg.timestamp}</span>
          </div>
          ${contentHTML}
        </div>
      `;
      
      chatMessagesContainer.appendChild(item);
    });

    // Auto scroll to bottom
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }

  // Update header text based on selection
  function updateChatHeader() {
    const searchInput = document.getElementById("chat-search-input");
    searchInput.value = state.chatSearchQuery;

    if (state.activeChatType === "channel") {
      chatHeaderPrefix.textContent = "#";
      const server = state.servers.find(s => s.id === state.activeServerId);
      const channel = server ? server.channels.find(c => c.id === state.activeChannelId) : null;
      
      chatHeaderName.textContent = channel ? channel.name : "general";
      chatHeaderDesc.textContent = channel ? `Text channel in ${server.name}` : "";
      messageInput.placeholder = `Message #${channel ? channel.name : 'channel'}...`;
    } else {
      chatHeaderPrefix.textContent = "@";
      const friend = state.friends.find(f => f.id === state.activeDmFriendId);
      chatHeaderName.textContent = friend ? friend.username : "User DMs";
      
      const statusText = friend ? `${friend.status.toUpperCase()} ${friend.customStatus ? ' - ' + friend.customStatus : ''}` : "";
      chatHeaderDesc.textContent = statusText;
      messageInput.placeholder = `Message @${friend ? friend.username : 'friend'}...`;
    }
  }

  // Generate pretty current timestamp
  function getTimestampString() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12; // hour '0' should be '12'
    return `Today at ${hours}:${minutes} ${ampm}`;
  }

  // Send message controller
  function sendMessage() {
    const content = messageInput.value.trim();
    if (!content) return;

    const chatKey = getActiveChatKey();
    if (!state.messages[chatKey]) {
      state.messages[chatKey] = [];
    }

    const message = {
      id: "msg_" + Date.now() + "_" + Math.floor(Math.random()*1000),
      sender: "You",
      content: content,
      timestamp: getTimestampString()
    };

    state.messages[chatKey].push(message);
    messageInput.value = "";
    messageInput.style.height = "auto";
    saveState();
    renderChat();

    // Trigger mock auto-reply
    triggerMockReply(chatKey, content);
  }

  btnSendMessage.addEventListener("click", sendMessage);
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Simulated typing and response bots
  const mockReplies = [
    "Oh that's awesome! Tell me more about it.",
    "Haha, that's hilarious 😂",
    "I'm testing out the sliding panels right now, they feel really smooth.",
    "Did you check out the lofi station on the left panel? Playing it while coding is 🌌",
    "Nice! Let me check the documentation on that.",
    "Can you share the link or image? I'd love to see it.",
    "Sounds like a plan! Let me know when you are ready.",
    "I am currently AFK, but I will review this once I get back!",
    "CSS grids are magic. 🦄"
  ];

  function triggerMockReply(chatKey, userContent) {
    // Determine who will reply
    let replyName = "pixel_alex";
    if (state.activeChatType === "channel") {
      // Pick random friend other than user
      const pool = state.friends.filter(f => f.status !== "offline");
      if (pool.length > 0) {
        replyName = pool[Math.floor(Math.random() * pool.length)].username;
      }
    } else {
      const friend = state.friends.find(f => f.id === state.activeDmFriendId);
      if (friend) {
        replyName = friend.username;
        if (friend.status === "offline") {
          // Offline friends reply after longer or don't reply, let's simulate they woke up!
          showToast(`${friend.username} is offline but got your message notification.`, "info");
        }
      }
    }

    // Show typing status after 1 second
    setTimeout(() => {
      // Check if user is still in the same chat room
      if (getActiveChatKey() !== chatKey) return;

      typingText.textContent = `${replyName} is typing...`;
      typingIndicator.classList.remove("hidden");

      // Send actual reply after 2.2 seconds
      setTimeout(() => {
        typingIndicator.classList.add("hidden");
        
        if (!state.messages[chatKey]) state.messages[chatKey] = [];
        
        let customResponse = mockReplies[Math.floor(Math.random() * mockReplies.length)];
        
        // Context aware replies
        if (userContent.toLowerCase().includes("hello") || userContent.toLowerCase().includes("hey")) {
          customResponse = `Hey! Hope you are having a fantastic day! 👋`;
        } else if (userContent.toLowerCase().includes("youtube") || userContent.toLowerCase().includes("video")) {
          customResponse = `Just saw that video tab! The search feature works great. Let's listen to some beats.`;
        } else if (userContent.toLowerCase().includes("instagram") || userContent.toLowerCase().includes("ig")) {
          customResponse = `I just liked setup_goals' new setup post. Looks absolute fire 🔥`;
        }

        state.messages[chatKey].push({
          id: "msg_" + Date.now(),
          sender: replyName,
          content: customResponse,
          timestamp: getTimestampString()
        });
        
        saveState();
        if (getActiveChatKey() === chatKey) {
          renderChat();
        } else {
          // Send notification toast
          showToast(`New message from @${replyName} in channel`, "info");
        }
      }, 2200);

    }, 800);
  }

  // Hook Search filter in Chat
  const chatSearchInput = document.getElementById("chat-search-input");
  chatSearchInput.addEventListener("input", () => {
    state.chatSearchQuery = chatSearchInput.value;
    renderChat();
  });

  // Hook Clear chat button
  const btnClearChat = document.getElementById("btn-clear-chat");
  btnClearChat.addEventListener("click", () => {
    if (confirm("Are you sure you want to clear chat history for this thread?")) {
      const key = getActiveChatKey();
      state.messages[key] = [];
      saveState();
      renderChat();
      showToast("Chat logs cleared.", "info");
    }
  });


  // --- MEDIA ATTACHMENT MODAL HANDLERS ---
  const btnAttach = document.getElementById("btn-attach");
  const mediaModal = document.getElementById("media-modal");
  const btnMediaCancel = document.getElementById("btn-media-cancel");
  const btnMediaSubmit = document.getElementById("btn-media-submit");
  const mediaUrlInput = document.getElementById("media-url-input");

  btnAttach.addEventListener("click", () => {
    mediaModal.classList.remove("hidden");
    mediaUrlInput.value = "";
    mediaUrlInput.focus();
  });

  btnMediaCancel.addEventListener("click", () => {
    mediaModal.classList.add("hidden");
  });

  btnMediaSubmit.addEventListener("click", () => {
    const url = mediaUrlInput.value.trim();
    if (url) {
      const chatKey = getActiveChatKey();
      if (!state.messages[chatKey]) state.messages[chatKey] = [];
      
      state.messages[chatKey].push({
        id: "msg_" + Date.now(),
        sender: "You",
        content: url,
        isImage: true,
        timestamp: getTimestampString()
      });
      
      saveState();
      renderChat();
      mediaModal.classList.add("hidden");
      showToast("Media attachment sent!", "success");
      
      // Auto reply trigger
      triggerMockReply(chatKey, "Sent an image");
    }
  });


  // --- EMOJI PICKER POPUP HANDLERS ---
  const btnEmoji = document.getElementById("btn-emoji");
  const emojiPicker = document.getElementById("emoji-picker");

  btnEmoji.addEventListener("click", (e) => {
    e.stopPropagation();
    emojiPicker.classList.toggle("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!emojiPicker.classList.contains("hidden") && !emojiPicker.contains(e.target) && e.target !== btnEmoji) {
      emojiPicker.classList.add("hidden");
    }
  });

  const emojiItems = document.querySelectorAll(".emoji-item");
  emojiItems.forEach(emoji => {
    emoji.addEventListener("click", () => {
      messageInput.value += emoji.textContent;
      emojiPicker.classList.add("hidden");
      messageInput.focus();
    });
  });


  // --- SERVERS & CHANNELS RENDER CONTROLLER ---
  const serverIconsList = document.getElementById("server-icons-list");
  const activeServerTitle = document.getElementById("active-server-title");
  const channelsListElement = document.getElementById("channels-list");
  const btnAddChannel = document.getElementById("btn-add-channel");

  // Create Channel Modal hooks
  const channelModal = document.getElementById("channel-modal");
  const btnChannelCancel = document.getElementById("btn-channel-cancel");
  const btnChannelSubmit = document.getElementById("btn-channel-submit");
  const channelNameInput = document.getElementById("channel-name-input");

  function renderServers() {
    serverIconsList.innerHTML = "";
    
    state.servers.forEach(server => {
      const btn = document.createElement("button");
      btn.className = `server-icon-btn ${server.id === state.activeServerId ? 'active' : ''}`;
      btn.textContent = server.icon;
      btn.setAttribute("title", server.name);
      
      btn.addEventListener("click", () => {
        state.activeServerId = server.id;
        state.activeChatType = "channel";
        
        // Select first channel of this server automatically
        if (server.channels.length > 0) {
          state.activeChannelId = server.channels[0].id;
        }

        saveState();
        renderServers();
        renderChannels();
        updateChatHeader();
        renderChat();
        
        // Remove active state on friends lists
        document.querySelectorAll(".friend-item").forEach(item => item.classList.remove("active"));
      });

      serverIconsList.appendChild(btn);
    });
  }

  function renderChannels() {
    channelsListElement.innerHTML = "";
    const activeServer = state.servers.find(s => s.id === state.activeServerId);
    if (!activeServer) return;

    activeServerTitle.textContent = activeServer.name;

    activeServer.channels.forEach(chan => {
      const btn = document.createElement("button");
      btn.className = `channel-btn ${state.activeChatType === 'channel' && chan.id === state.activeChannelId ? 'active' : ''}`;
      btn.innerHTML = `<span class="hash">#</span> ${chan.name}`;

      btn.addEventListener("click", () => {
        state.activeChatType = "channel";
        state.activeChannelId = chan.id;
        
        saveState();
        renderChannels();
        updateChatHeader();
        renderChat();
        
        // Clear active selection on friends DMs
        document.querySelectorAll(".friend-item").forEach(item => item.classList.remove("active"));
      });

      channelsListElement.appendChild(btn);
    });
  }

  // Create channel trigger
  btnAddChannel.addEventListener("click", () => {
    channelModal.classList.remove("hidden");
    channelNameInput.value = "";
    channelNameInput.focus();
  });

  btnChannelCancel.addEventListener("click", () => {
    channelModal.classList.add("hidden");
  });

  btnChannelSubmit.addEventListener("click", () => {
    let name = channelNameInput.value.trim().toLowerCase().replace(/\s+/g, "-");
    if (!name) return;

    // Sanitize string
    name = name.replace(/[^a-z0-9-_]/g, "");

    const activeServer = state.servers.find(s => s.id === state.activeServerId);
    if (activeServer) {
      // Check duplicate channel
      if (activeServer.channels.find(c => c.id === name)) {
        showToast("Channel already exists!", "error");
        return;
      }

      activeServer.channels.push({ id: name, name: name });
      state.activeChannelId = name;
      state.activeChatType = "channel";
      
      saveState();
      renderChannels();
      updateChatHeader();
      renderChat();
      
      channelModal.classList.add("hidden");
      showToast(`Channel #${name} created!`, "success");
    }
  });


  // --- SOCIAL HUB & FRIENDS SYSTEM CONTROLLER ---
  const friendTabs = document.querySelectorAll(".friend-tab-btn");
  const friendTabContents = document.querySelectorAll(".subtab-content");
  const friendsScrollerList = document.getElementById("friends-scroller-list");
  const friendsPendingList = document.getElementById("friends-pending-list");
  const friendSearchInput = document.getElementById("friend-search-input");
  
  // Add friend controls
  const addFriendInput = document.getElementById("add-friend-input");
  const btnSubmitFriendReq = document.getElementById("btn-submit-friend-req");
  const addFriendFeedback = document.getElementById("add-friend-feedback");

  // Tab switching routing
  friendTabs.forEach(btn => {
    btn.addEventListener("click", () => {
      const subtabId = btn.getAttribute("data-subtab");
      state.activeFriendSubtab = subtabId;

      friendTabs.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      friendTabContents.forEach(content => {
        content.classList.remove("active");
      });

      if (subtabId === "online" || subtabId === "all") {
        document.getElementById("friends-list-view").classList.add("active");
        renderFriendsList();
      } else if (subtabId === "pending") {
        document.getElementById("friends-pending-view").classList.add("active");
        renderPendingList();
      } else if (subtabId === "add-friend") {
        document.getElementById("friends-add-view").classList.add("active");
        addFriendFeedback.style.display = "none";
        addFriendInput.value = "";
      }
    });
  });

  // Render Friends List
  function renderFriendsList() {
    friendsScrollerList.innerHTML = "";
    
    // Filter active based on online tab vs all tab
    let list = state.friends;
    if (state.activeFriendSubtab === "online") {
      list = state.friends.filter(f => f.status !== "offline" && f.status !== "pending_in" && f.status !== "pending_out");
    } else {
      // Exclude pending states from All list
      list = state.friends.filter(f => f.status !== "pending_in" && f.status !== "pending_out");
    }

    // Filter by search query
    const query = state.friendSearchQuery.trim().toLowerCase();
    if (query) {
      list = list.filter(f => f.username.toLowerCase().includes(query));
    }

    if (list.length === 0) {
      friendsScrollerList.innerHTML = `
        <div style="text-align:center; padding:20px; font-size:0.75rem; color:var(--text-muted);">
          No friends found.
        </div>
      `;
      return;
    }

    list.forEach(friend => {
      const item = document.createElement("div");
      item.className = `friend-item ${state.activeChatType === 'dm' && state.activeDmFriendId === friend.id ? 'active' : ''}`;
      
      item.innerHTML = `
        <div class="friend-info-left">
          <div class="friend-avatar-wrapper">
            <div class="friend-avatar" style="background-color: ${friend.avatarColor}">
              ${friend.username.charAt(0).toUpperCase()}
            </div>
            <div class="status-indicator ${friend.status}"></div>
          </div>
          <div class="friend-details">
            <div class="friend-username-row">
              <span class="friend-name">${friend.username}</span>
              <span class="friend-tag">#${friend.discriminator}</span>
            </div>
            <div class="friend-custom-status">${friend.customStatus || friend.status}</div>
          </div>
        </div>
        <div class="friend-actions">
          <button class="friend-action-btn btn-quick-dm" title="Send Message">💬</button>
          <button class="friend-action-btn btn-remove-friend decline" title="Remove Friend">✖</button>
        </div>
      `;

      // Click row -> open Direct Message
      item.addEventListener("click", (e) => {
        if (e.target.closest(".friend-action-btn")) return; // Don't trigger if clicked actions
        openDirectMessage(friend.id);
      });

      // Quick DM button
      item.querySelector(".btn-quick-dm").addEventListener("click", () => {
        openDirectMessage(friend.id);
      });

      // Remove Friend button
      item.querySelector(".btn-remove-friend").addEventListener("click", () => {
        if (confirm(`Are you sure you want to remove ${friend.username} from your friend list?`)) {
          state.friends = state.friends.filter(f => f.id !== friend.id);
          saveState();
          renderFriendsList();
          showToast(`Removed @${friend.username} from friends list`, "info");
          
          // If we are currently in DM with them, switch back to General
          if (state.activeChatType === "dm" && state.activeDmFriendId === friend.id) {
            state.activeChatType = "channel";
            state.activeServerId = "dangro-hq";
            state.activeChannelId = "general";
            updateChatHeader();
            renderChat();
            renderServers();
            renderChannels();
          }
        }
      });

      friendsScrollerList.appendChild(item);
    });
  }

  function openDirectMessage(friendId) {
    state.activeChatType = "dm";
    state.activeDmFriendId = friendId;
    
    // Clear active status on channels and servers
    document.querySelectorAll(".channel-btn").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".server-icon-btn").forEach(btn => btn.classList.remove("active"));

    // Ensure DM message array exists
    const dmKey = `dm_${friendId}`;
    if (!state.messages[dmKey]) {
      state.messages[dmKey] = [
        { id: "sys_dm_" + Date.now(), sender: "System", content: `This is the beginning of your private message history with this user.`, timestamp: getTimestampString(), system: true }
      ];
      saveState();
    }

    renderFriendsList(); // updates active state highlight
    updateChatHeader();
    renderChat();
  }

  // Render Pending Friend Requests
  function renderPendingList() {
    friendsPendingList.innerHTML = "";
    
    const pendingList = state.friends.filter(f => f.status === "pending_in" || f.status === "pending_out");

    if (pendingList.length === 0) {
      friendsPendingList.innerHTML = `
        <div style="text-align:center; padding:20px; font-size:0.75rem; color:var(--text-muted);">
          No pending requests.
        </div>
      `;
      return;
    }

    pendingList.forEach(friend => {
      const item = document.createElement("div");
      item.className = "friend-item";
      
      const isIncoming = friend.status === "pending_in";

      item.innerHTML = `
        <div class="friend-info-left">
          <div class="friend-avatar-wrapper">
            <div class="friend-avatar" style="background-color: ${friend.avatarColor}">
              ${friend.username.charAt(0).toUpperCase()}
            </div>
            <div class="status-indicator offline"></div>
          </div>
          <div class="friend-details">
            <div class="friend-username-row">
              <span class="friend-name">${friend.username}</span>
              <span class="friend-tag">#${friend.discriminator}</span>
            </div>
            <div>
              <span class="pending-badge">${isIncoming ? 'Incoming Request' : 'Outgoing Request'}</span>
            </div>
          </div>
        </div>
        <div class="friend-actions">
          ${isIncoming ? '<button class="friend-action-btn btn-accept-req" title="Accept">✔</button>' : ''}
          <button class="friend-action-btn btn-cancel-req decline" title="Decline/Cancel">✖</button>
        </div>
      `;

      if (isIncoming) {
        // Accept friendship
        item.querySelector(".btn-accept-req").addEventListener("click", () => {
          friend.status = "online"; // Set to online
          friend.customStatus = "Hey there, we are friends now! 👋";
          saveState();
          renderPendingList();
          showToast(`You accepted @${friend.username}'s friend request!`, "success");
        });
      }

      // Decline / Cancel outgoing
      item.querySelector(".btn-cancel-req").addEventListener("click", () => {
        state.friends = state.friends.filter(f => f.id !== friend.id);
        saveState();
        renderPendingList();
        showToast("Friend request cancelled/declined.", "info");
      });

      friendsPendingList.appendChild(item);
    });
  }

  // Hook Add Friend Submission
  btnSubmitFriendReq.addEventListener("click", () => {
    const inputVal = addFriendInput.value.trim();
    addFriendFeedback.className = "feedback-msg";
    addFriendFeedback.style.display = "none";

    if (!inputVal) return;

    // Parse tag if exists e.g. username#1234
    const parts = inputVal.split("#");
    const username = parts[0];
    const disc = parts[1] || Math.floor(1000 + Math.random() * 9000).toString();

    // Check if already friends
    const exists = state.friends.find(f => f.username.toLowerCase() === username.toLowerCase());
    if (exists) {
      addFriendFeedback.textContent = exists.status === "pending_out" || exists.status === "pending_in" 
        ? "A request with this user is already pending." 
        : "You are already friends with this user.";
      addFriendFeedback.classList.add("error");
      return;
    }

    // Add friend to database as outgoing request
    const colors = ["#8b5cf6", "#3b82f6", "#ec4899", "#10b981", "#fbbf24", "#ef4444"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newFriend = {
      id: "friend_" + Date.now(),
      username: username,
      discriminator: disc,
      status: "pending_out", // Outgoing request
      customStatus: "Waiting for response...",
      avatarColor: randomColor
    };

    state.friends.push(newFriend);
    saveState();
    
    addFriendInput.value = "";
    addFriendFeedback.textContent = `Friend request sent to ${username}#${disc}!`;
    addFriendFeedback.classList.add("success");
    showToast(`Request sent to @${username}`, "success");

    // Simulate auto-accepting request from the recipient after 6 seconds for realism!
    setTimeout(() => {
      const checkFriend = state.friends.find(f => f.id === newFriend.id);
      if (checkFriend && checkFriend.status === "pending_out") {
        checkFriend.status = "online";
        checkFriend.customStatus = "Thanks for adding me! Coding is life.";
        saveState();
        showToast(`@${username} accepted your friend request!`, "success");
        if (state.activeFriendSubtab === "online" || state.activeFriendSubtab === "all") {
          renderFriendsList();
        } else if (state.activeFriendSubtab === "pending") {
          renderPendingList();
        }
      }
    }, 6000);
  });

  // Search filter for friends list
  friendSearchInput.addEventListener("input", () => {
    state.friendSearchQuery = friendSearchInput.value;
    renderFriendsList();
  });


  // --- BOOTSTRAP INITIAL APP RENDERING ---
  renderServers();
  renderChannels();
  updateChatHeader();
  renderChat();
  renderYoutubeFeed();
  renderInstagramFeed();
  loadBrowserUrl("https://wikipedia.org");
});
