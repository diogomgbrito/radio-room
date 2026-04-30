// ── DOM Elements ──
const joinScreen = document.getElementById("join-screen");
const roomView = document.getElementById("room-view");
const nameInput = document.getElementById("name-input");
const joinBtn = document.getElementById("join-btn");

const playerContainer = document.getElementById("player-container");
const playerPlaceholder = document.getElementById("player-placeholder");
const nowPlaying = document.getElementById("now-playing");
const npTitle = document.getElementById("np-title");
const npArtist = document.getElementById("np-artist");
const npMeta = document.getElementById("np-meta");
const skipBtn = document.getElementById("skip-btn");
const skipCount = document.getElementById("skip-count");

const trackInput = document.getElementById("track-input");
const addBtn = document.getElementById("add-btn");
const queueList = document.getElementById("queue-list");
const queueCount = document.getElementById("queue-count");

const userList = document.getElementById("user-list");
const userCountEl = document.getElementById("user-count");

// ── State ──
let userId = "";
let ws = null;
let ytPlayer = null;
let pendingTrack = null;
let reconnectDelay = 1000;
let canVoteSkip = true;

// ── YouTube IFrame API Loader ──
function loadYouTubeAPI() {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => resolve();
  });
}

function createPlayer() {
  return new Promise((resolve) => {
    ytPlayer = new window.YT.Player(playerContainer, {
      width: "100%",
      height: "100%",
      videoId: "",
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        modestbranding: 1,
        rel: 0,
      },
      events: {
        onReady: () => {
          playerPlaceholder.classList.add("hidden");
          // Set initial volume
          updateVolume(Number(volumeSlider.value));
          if (pendingTrack) {
            playTrack(pendingTrack.track, pendingTrack.startedAt);
            pendingTrack = null;
          }
          resolve();
        },
        onStateChange: (event) => {
          // Video ended
          if (event.data === window.YT.PlayerState.ENDED) {
            send({ type: "track_ended" });
          }
        },
      },
    });
  });
}

function playTrack(track, startedAt) {
  if (!ytPlayer || typeof ytPlayer.loadVideoById !== "function") {
    pendingTrack = { track, startedAt };
    return;
  }

  const elapsed = (Date.now() - startedAt) / 1000;
  ytPlayer.loadVideoById(track.youtubeId, elapsed > 0 ? elapsed : 0);
  playerPlaceholder.classList.add("hidden");

  // Update now playing
  nowPlaying.classList.remove("hidden");
  npTitle.textContent = track.title;
  npArtist.textContent = track.artist;
  npMeta.textContent = `Added by ${track.addedBy} · via ${track.source}`;
}

// ── WebSocket ──
function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.onopen = () => {
    console.log("[ws] connected");
    reconnectDelay = 1000;
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleMessage(msg);
  };

  ws.onclose = () => {
    console.log("[ws] disconnected, reconnecting...");
    ws = null;
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 10000);
  };

  ws.onerror = () => {
    ws?.close();
  };
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// ── Message Handler ──
function handleMessage(msg) {
  switch (msg.type) {
    case "joined":
      userId = msg.userId;
      joinScreen.classList.add("hidden");
      roomView.classList.remove("hidden");
      renderUsers(msg.users);
      break;

    case "user_joined":
      renderUsersByName(msg.name, msg.userCount);
      break;

    case "user_left":
      renderUserCount(msg.userCount);
      // Remove user from DOM
      const items = userList.querySelectorAll(".user-item");
      items.forEach((item) => {
        if (item.textContent?.includes(msg.name)) {
          item.remove();
        }
      });
      break;

    case "play_track":
      playTrack(msg.track, msg.startedAt);
      break;

    case "queue_update":
      renderQueue(msg.queue);
      break;

    case "skip_update":
      skipCount.textContent = `${msg.votes}/${msg.needed}`;
      break;

    case "track_skipped":
      skipCount.textContent = "";
      break;

    case "error":
      showToast(msg.message || "Something went wrong");
      break;
  }
}

// ── Toast Notification ──
function showToast(message) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.style.cssText = `
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      background: var(--red); color: white; padding: 12px 24px; border-radius: 8px;
      font-size: 0.9rem; z-index: 9999; opacity: 0; transition: opacity 0.3s;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = "1";
  setTimeout(() => { toast.style.opacity = "0"; }, 3000);
}

// ── UI Renderers ──
function renderUsers(names) {
  userList.innerHTML = "";
  names.forEach((name) => {
    const div = document.createElement("div");
    div.className = "user-item";
    div.innerHTML = `<span class="dot"></span> ${escapeHtml(name)}`;
    userList.appendChild(div);
  });
  renderUserCount(names.length);
}

function renderUsersByName(name, count) {
  const div = document.createElement("div");
  div.className = "user-item";
  div.innerHTML = `<span class="dot"></span> ${escapeHtml(name)}`;
  userList.appendChild(div);
  renderUserCount(count);
}

function renderUserCount(count) {
  userCountEl.textContent = `${count} online`;
}

function renderQueue(queue) {
  if (queue.length === 0) {
    queueList.innerHTML = '<div class="queue-empty">Queue is empty — add a song! 🎶</div>';
    queueCount.textContent = "";
    return;
  }

  queueCount.textContent = `(${queue.length})`;
  queueList.innerHTML = "";

  queue.forEach((track) => {
    const div = document.createElement("div");
    div.className = "queue-item";
    div.innerHTML = `
      <img src="${escapeHtml(track.thumbnailUrl)}" alt="" loading="lazy">
      <div class="info">
        <div class="title">${escapeHtml(track.title)}</div>
        <div class="meta">${escapeHtml(track.artist)} · ${escapeHtml(track.addedBy)}</div>
      </div>
      <span class="source-badge">${track.source}</span>
    `;
    queueList.appendChild(div);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ── Volume Control ──
const volumeSlider = document.getElementById("volume-slider");
const volumeIcon = document.getElementById("volume-icon");
let savedVolume = 80;

function updateVolume(val) {
  if (ytPlayer && typeof ytPlayer.setVolume === "function") {
    ytPlayer.setVolume(val);
  }
  savedVolume = val;
  if (val == 0) {
    volumeIcon.textContent = "🔇";
  } else if (val < 50) {
    volumeIcon.textContent = "🔉";
  } else {
    volumeIcon.textContent = "🔊";
  }
}

volumeSlider.addEventListener("input", (e) => {
  updateVolume(Number(e.target.value));
});

volumeIcon.addEventListener("click", () => {
  const current = Number(volumeSlider.value);
  if (current > 0) {
    savedVolume = current;
    volumeSlider.value = 0;
    updateVolume(0);
  } else {
    volumeSlider.value = savedVolume || 80;
    updateVolume(Number(volumeSlider.value));
  }
});

// ── Event Listeners ──
joinBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  send({ type: "join", name: name || "" });
});

nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinBtn.click();
});

addBtn.addEventListener("click", () => {
  const url = trackInput.value.trim();
  if (!url) return;
  send({ type: "add_track", url });
  trackInput.value = "";
  addBtn.disabled = true;
  addBtn.textContent = "Adding...";
  setTimeout(() => {
    addBtn.disabled = false;
    addBtn.textContent = "Add";
  }, 2000);
});

trackInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addBtn.click();
});

skipBtn.addEventListener("click", () => {
  if (!canVoteSkip) return;
  send({ type: "vote_skip" });
  canVoteSkip = false;
  skipBtn.disabled = true;
  setTimeout(() => {
    canVoteSkip = true;
    skipBtn.disabled = false;
  }, 3000);
});

// ── Init ──
connect();
loadYouTubeAPI().then(() => createPlayer());
