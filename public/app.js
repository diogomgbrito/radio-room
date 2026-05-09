// ═══════════════════════════════════════════════
// Radio Room — Client (Acid Palette Design)
// ═══════════════════════════════════════════════

// ── DOM Elements ──
const joinScreen = document.getElementById("join-screen");
const roomView = document.getElementById("room-view");
const nameInput = document.getElementById("name-input");
const joinBtn = document.getElementById("join-btn");

const rrPlayer = document.getElementById("rr-player");
const playerContainer = document.getElementById("player-container");
const playerPlaceholder = document.getElementById("player-placeholder");
const nowPlaying = document.getElementById("now-playing");
const npTitle = document.getElementById("np-title");
const npArtist = document.getElementById("np-artist");
const npMeta = document.getElementById("np-meta");
const rrVinyl = document.getElementById("rr-vinyl");
const progressBar = document.getElementById("progress-bar");

const skipBtn = document.getElementById("skip-btn");
const skipCount = document.getElementById("skip-count");

const trackInput = document.getElementById("track-input");
const addBtn = document.getElementById("add-btn");
const queueList = document.getElementById("queue-list");
const queueCount = document.getElementById("queue-count");

const currentUserName = document.getElementById("current-user-name");

const listenersPill = document.getElementById("listeners-pill");
const listenersPopover = document.getElementById("listeners-popover");
const listenersNum = document.getElementById("listeners-num");
const popoverCount = document.getElementById("popover-count");
const popoverList = document.getElementById("popover-list");

const volumeSlider = document.getElementById("volume-slider");
const volumeBtn = document.getElementById("volume-btn");
const volumeWave1 = document.getElementById("volume-wave1");
const volumeWave2 = document.getElementById("volume-wave2");

// ── State ──
let userId = "";
let myName = "Anonymous";
let ws = null;
let ytPlayer = null;
let pendingTrack = null;
let reconnectDelay = 1000;
let canVoteSkip = true;
let savedVolume = 80;
let popoverOpen = false;
let allUserNames = [];

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
          rrPlayer.classList.add("glowing");
          updateVolume(Number(volumeSlider.value));
          if (pendingTrack) {
            playTrack(pendingTrack.track, pendingTrack.startedAt);
            pendingTrack = null;
          }
          resolve();
        },
        onStateChange: (event) => {
          if (event.data === window.YT.PlayerState.ENDED) {
            send({ type: "track_ended" });
          }
          // Update progress bar on play
          if (event.data === window.YT.PlayerState.PLAYING) {
            startProgressUpdate();
          }
        },
      },
    });
  });
}

let progressInterval = null;
function startProgressUpdate() {
  if (progressInterval) clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    if (!ytPlayer || typeof ytPlayer.getCurrentTime !== "function") return;
    const current = ytPlayer.getCurrentTime();
    const duration = ytPlayer.getDuration();
    if (duration > 0) {
      const pct = (current / duration) * 100;
      progressBar.style.width = pct + "%";
    }
  }, 500);
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
  npTitle.textContent = track.title;
  npArtist.textContent = track.artist;
  npMeta.textContent = `Added by ${track.addedBy} · via ${track.source}`;
  rrVinyl.classList.add("spinning");
  rrPlayer.classList.add("glowing");

  startProgressUpdate();
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
      allUserNames = msg.users || [];
      // Find our name — server adds us last
      myName = allUserNames[allUserNames.length - 1] || "Anonymous";
      currentUserName.textContent = myName;
      joinScreen.classList.add("hidden");
      roomView.classList.remove("hidden");
      renderListeners(allUserNames);
      break;

    case "user_joined":
      if (msg.name && !allUserNames.includes(msg.name)) {
        allUserNames.push(msg.name);
      }
      renderListeners(allUserNames);
      break;

    case "user_left":
      allUserNames = allUserNames.filter((n) => n !== msg.name);
      renderListeners(allUserNames);
      break;

    case "play_track":
      playTrack(msg.track, msg.startedAt);
      break;

    case "queue_update":
      renderQueue(msg.queue);
      break;

    case "skip_update":
      skipCount.textContent = `${msg.votes}/${msg.needed}`;
      skipBtn.classList.add("voted");
      break;

    case "track_skipped":
      skipCount.textContent = "";
      skipBtn.classList.remove("voted");
      npTitle.textContent = "—";
      npArtist.textContent = "";
      npMeta.textContent = "";
      rrVinyl.classList.remove("spinning");
      progressBar.style.width = "0%";
      if (progressInterval) clearInterval(progressInterval);
      break;

    case "error":
      showToast(msg.message || "Something went wrong");
      break;
  }
}

// ── Toast Notification ──
function showToast(message) {
  let toast = document.getElementById("rr-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "rr-toast";
    toast.className = "rr-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = "1";
  toast.style.display = "block";
  // Reset animation
  toast.style.animation = "none";
  toast.offsetHeight; // trigger reflow
  toast.style.animation = "rr-toast-in 0.25s ease-out";
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => { toast.style.display = "none"; }, 300);
  }, 3000);
}

// ── Listeners Popover ──
function renderListeners(names) {
  if (!Array.isArray(names)) return;

  listenersNum.textContent = names.length;
  popoverCount.textContent = names.length;

  popoverList.innerHTML = "";
  names.forEach((name) => {
    const row = document.createElement("div");
    const isYou = name === myName || (userId && name === myName);
    row.className = `rr-listeners-popover-row${isYou ? " you" : ""}`;
    row.innerHTML = `<span class="name">${escapeHtml(name || "Anonymous")}</span>
      ${isYou ? '<span style="font-family:var(--font-mono);font-size:10px;color:var(--accent);letter-spacing:0.1em">YOU</span>' : ""}`;
    popoverList.appendChild(row);
  });
}

function togglePopover() {
  popoverOpen = !popoverOpen;
  if (popoverOpen) {
    listenersPopover.classList.remove("hidden");
    listenersPill.classList.add("open");
  } else {
    listenersPopover.classList.add("hidden");
    listenersPill.classList.remove("open");
  }
}

// Close popover on outside click
document.addEventListener("click", (e) => {
  if (popoverOpen && !document.getElementById("listeners-anchor").contains(e.target)) {
    popoverOpen = false;
    listenersPopover.classList.add("hidden");
    listenersPill.classList.remove("open");
  }
});

// ── Queue Renderer ──
const thumbTones = ["a", "b", "c", "d", "e"];

function renderQueue(queue) {
  if (queue.length === 0) {
    queueList.innerHTML = `
      <div class="rr-q-empty">
        <div class="rr-waveform">
          <span></span><span></span><span></span><span></span><span></span>
        </div>
        <div class="rr-empty-text">Queue is empty — add a song</div>
      </div>`;
    queueCount.textContent = "";
    return;
  }

  queueCount.textContent = `(${queue.length})`;
  queueList.innerHTML = "";

  queue.forEach((track, i) => {
    const div = document.createElement("div");
    div.className = `rr-q-item${i === 0 ? " fresh" : ""}`;
    const tone = thumbTones[i % thumbTones.length];

    div.innerHTML = `
      <div class="rr-q-thumb${track.thumbnailUrl ? "" : " rr-q-thumb-tinted"}"
           ${track.thumbnailUrl ? `style="background-image:url('${escapeHtml(track.thumbnailUrl)}')"` : `data-tone="${tone}"`}></div>
      <div class="rr-q-info">
        <div class="rr-q-title">${escapeHtml(track.title)}</div>
        <div class="rr-q-meta">${escapeHtml(track.artist)} <span class="by">· ${escapeHtml(track.addedBy)}</span></div>
      </div>
      <span class="rr-q-source">${track.source}</span>
    `;
    queueList.appendChild(div);
  });
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ── Volume Control ──
function updateVolume(val) {
  if (ytPlayer && typeof ytPlayer.setVolume === "function") {
    ytPlayer.setVolume(val);
  }
  savedVolume = val;

  // Update icon
  if (val == 0) {
    volumeWave1.style.display = "none";
    volumeWave2.style.display = "none";
  } else if (val < 50) {
    volumeWave1.style.display = "";
    volumeWave2.style.display = "none";
  } else {
    volumeWave1.style.display = "";
    volumeWave2.style.display = "";
  }
}

volumeSlider.addEventListener("input", (e) => {
  updateVolume(Number(e.target.value));
});

volumeBtn.addEventListener("click", () => {
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
  myName = name || "Anonymous";
  send({ type: "join", name: myName });
  currentUserName.textContent = myName;
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
  skipBtn.classList.add("voted");
  setTimeout(() => {
    canVoteSkip = true;
    skipBtn.disabled = false;
  }, 3000);
});

listenersPill.addEventListener("click", (e) => {
  e.stopPropagation();
  togglePopover();
});

// ── Init ──
connect();
loadYouTubeAPI().then(() => createPlayer());
