# Radio Room Architecture

This document describes the **actual** architecture of Radio Room as it is deployed today. No hypothetical components, no planned features — only what exists and how it works.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Network Topology](#network-topology)
3. [Frontend](#frontend)
4. [Backend](#backend)
5. [Data Flow](#data-flow)
6. [Database](#database)
7. [Deployment Stack](#deployment-stack)
8. [Testing](#testing)
9. [File Structure](#file-structure)
10. [Technology Inventory](#technology-inventory)

---

## System Overview

Radio Room is a collaborative listening room application. One song plays at a time for all connected users, synchronized via server timestamps. Users queue tracks from YouTube or Spotify links and vote to skip.

The system is split across two environments:

- **Frontend:** Static files served by Cloudflare Pages (CDN edge)
- **Backend:** Bun server running on an Oracle Cloud VM, exposed via an ephemeral Cloudflare Tunnel

```
┌─────────────────────────────┐                 ┌─────────────────────────────────────────┐
│   Cloudflare Edge           │                 │   Oracle Cloud VM                        │
│   (global CDN)              │                 │   (São Paulo region)                     │
│                             │                 │                                          │
│   ┌─────────────────────┐   │                 │   ┌─────────────────────────────────┐   │
│   │  Pages                   │   │                 │   │  Bun.serve()                        │   │
│   │  radio-room.pages.dev    │   │   HTTPS/WSS     │   │  Port 3000                          │   │
│   │  index.html              │   │   (tunnel)      │   │  /ws   → WebSocket                 │   │
│   │  app.js                  │◄────────────────►│   │  /api/resolve → POST               │   │
│   │  style.css               │   │                 │   │  /     → static files (public/)     │   │
│   │  config.js               │   │                 │   └─────────────────────────────────┘   │
│   └─────────────────────┘   │                 │                                          │
│                             │                 │   ┌─────────────────────────────────┐   │
│                             │                 │   │  cloudflared (ephemeral)           │   │
│                             │                 │   │  tunnel --url localhost:3000       │   │
│                             │                 │   └─────────────────────────────────┘   │
│                             │                 │                                          │
│                             │                 │   ┌─────────────────────────────────┐   │
│                             │                 │   │  tailscaled                        │   │
│                             │                 │   │  tailnet: cormo-mark.ts.net       │   │
│                             │                 │   └─────────────────────────────────┘   │
└─────────────────────────────┘                 └─────────────────────────────────────────┘
```

---

## Network Topology

### Public-facing path

```
Browser → Cloudflare Pages (HTTPS) → Cloudflare Tunnel → Oracle VM → Bun localhost:3000
         (index.html)                (QUIC over UDP)        (HTTP)
```

The frontend loads from `radio-room.pages.dev` (HTTPS). The `config.js` inside it tells the browser to open a WebSocket to the Cloudflare Tunnel URL (`wss://*.trycloudflare.com`). The tunnel is a QUIC connection from the VM to Cloudflare's edge, so the browser sees a valid HTTPS/WSS endpoint without any cert management on the VM.

### Private path (Tailscale)

```
Tailnet device → Tailscale mesh → Oracle VM → Bun localhost:3000
(100.x.x.x)        (WireGuard)        (10.0.0.83)
```

Any device on the `cormo-mark.ts.net` tailnet can reach the VM at `100.76.254.86` directly, bypassing the public internet entirely. This is useful for SSH and direct backend access without relying on the ephemeral public IP.

### Direct public path (no tunnel)

```
Browser → Oracle public IP:3000 → Bun localhost:3000
          (141.253.121.167)
```

Port 3000 is open in the Oracle Security List, so the backend is reachable directly. However, this is HTTP only (no HTTPS), so browsers block WebSocket connections from an HTTPS frontend. This path is only useful for local/testing access.

---

## Frontend

### What it is

A vanilla HTML/CSS/JS single-page app. No build step, no framework. Files live in `public/`.

### Files

| File | Purpose |
|------|---------|
| `public/index.html` | Single-page shell. Join screen + player UI + queue UI |
| `public/style.css` | Dark theme styling. ~28 KB, hand-written |
| `public/app.js` | Client logic. ~15 KB vanilla JS. WebSocket, queue rendering, YouTube IFrame API integration |
| `public/config.js` | Runtime config. Sets `wsHost` to the backend tunnel URL |
| `public/radio-room-logo-mark.svg` | Logo SVG |
| `public/radio-room-onair-mark.svg` | On-air indicator SVG |

### How the frontend connects to the backend

`app.js` reads `window.RADIO_ROOM_CONFIG.wsHost` from `config.js`:

```js
const wsUrl = `wss://${window.RADIO_ROOM_CONFIG.wsHost}/ws`;
const socket = new WebSocket(wsUrl);
```

For local development, `wsHost` can be `null` and it auto-detects from `window.location`.

### Deployment

The `public/` folder is deployed as-is to Cloudflare Pages using Wrangler:

```bash
wrangler pages deploy ./public --project-name=radio-room --branch=master
```

Pages serves it from `https://radio-room.pages.dev` with automatic SSL.

---

## Backend

### What it is

A single Bun process (`server/index.ts`) that handles:

1. **HTTP requests** — `Bun.serve()` with route handlers
2. **WebSocket connections** — real-time sync for all clients
3. **Static file serving** — serves `public/` for local dev
4. **URL resolution** — YouTube/Spotify link → track metadata
5. **SQLite logging** — enabled, persists songs and activity across restarts

### Server routes

| Method | Path | Handler |
|--------|------|---------|
| `GET` | `/` | Serves `public/index.html` |
| `GET` | `/*` | Serves any static file from `public/` (CSS, JS, SVG) |
| `GET` | `/ws` | WebSocket upgrade. All real-time communication |
| `POST` | `/api/resolve` | Resolves a YouTube or Spotify URL to track metadata |
| `OPTIONS` | `*` | CORS preflight response |

### WebSocket message flow

All messages are JSON. Two directions:

**Client → Server (`ClientMessage`):**

| `type` | Purpose |
|--------|---------|
| `join` | User enters the room with a name |
| `add_track` | User submits a URL to queue |
| `vote_skip` | User votes to skip the current track |
| `chat` | User sends a chat message |

**Server → Client (`ServerMessage`):**

| `type` | Purpose |
|--------|---------|
| `room_state` | Full state snapshot (queue, current track, listeners) |
| `track_added` | A new track was added to the queue |
| `play_track` | A track started playing (with server timestamp for sync) |
| `track_ended` | Current track finished, advance to next |
| `skip_voted` | A skip vote was cast |
| `skip_triggered` | Skip threshold reached, track skipped |
| `user_joined` | Someone joined |
| `user_left` | Someone left |
| `chat_message` | Chat message broadcast |
| `error` | Something went wrong |

### In-memory state

The server keeps all room state in memory (no shared state layer):

- `connectedClients`: `Set<ServerWebSocket>` — all active WebSocket connections
- Queue: managed by `server/services/queue.ts`
- Users: per-connection metadata on the WebSocket `data` field

This means **only one server instance can run at a time**. Running multiple instances would create split rooms.

### URL resolution (`server/services/link-resolver.ts`)

Accepts YouTube or Spotify URLs and returns normalized track metadata:

- **YouTube URLs:** Extracts video ID via regex, fetches title via YouTube oEmbed API
- **Spotify URLs:** Extracts track ID, queries Spotify Web API for metadata, then searches YouTube for the track name to get a YouTube video ID

Returns: `{ youtubeId, title, artist, thumbnailUrl, source }`

---

## Data Flow

### User joins and plays a track

```
1. Browser loads https://radio-room.pages.dev
   → Cloudflare Pages serves index.html + app.js + style.css

2. app.js reads config.js, opens WebSocket:
   wss://<tunnel-url>/ws
   → Cloudflare Edge → QUIC tunnel → Bun server

3. User enters name, clicks Join
   → Client sends: { type: "join", name: "Diogo" }
   → Server adds user, broadcasts: { type: "user_joined", name: "Diogo" }
   → Server sends room_state to new user

4. User pastes a YouTube URL, clicks Add
   → Client sends: { type: "add_track", url: "..." }
   → Server calls resolveUrl() → fetches metadata from YouTube oEmbed
   → Server broadcasts: { type: "track_added", track: {...} }
   → If queue was empty, server broadcasts: { type: "play_track", track: {...}, startedAt: <timestamp> }

5. All clients receive play_track, start YouTube player at calculated offset
   offset = (now - startedAt) / 1000
   → Everyone is synced to the same playback position

6. Track ends (or skip threshold reached)
   → Server advances queue, broadcasts next play_track
```

### Playback synchronization

The server sends a `startedAt` timestamp (Unix epoch in ms) with every `play_track` message. Each client calculates:

```js
const offsetSeconds = (Date.now() - message.startedAt) / 1000;
player.seekTo(offsetSeconds, true);
player.playVideo();
```

This gives approximate sync (within 1–2 seconds) without needing continuous timestamp adjustments.

---

## Database

### What exists

SQLite database at `data/radio-room.db`, managed by `server/services/db.ts`.

### Schema

**songs table:**
```sql
CREATE TABLE songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  youtube_id TEXT NOT NULL,
  title TEXT,
  artist TEXT,
  thumbnail_url TEXT,
  source TEXT,
  added_by TEXT,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  play_count INTEGER DEFAULT 0
);
```

**activity table:**
```sql
CREATE TABLE activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  user_name TEXT,
  youtube_id TEXT,
  title TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Enabled?

**Yes.** `ENABLE_DB=true` is set via `/etc/systemd/system/radio-room.service.d/db.conf`. The database file exists at `/home/opc/radio-room/data/radio-room.db` and is actively logging songs and activity events.

---

## Deployment Stack

### Oracle Cloud VM

| Detail | Value |
|--------|-------|
| Provider | Oracle Cloud Infrastructure (OCI) |
| Tier | Always Free |
| Shape | VM.Standard.E2.1.Micro |
| vCPU | 1/8 OCPU (AMD EPYC 7551) |
| RAM | 1 GB |
| Disk | 50 GB boot volume |
| OS | Oracle Linux Server 9.7 |
| Region | Brazil East (São Paulo) |
| Public IP | 141.253.121.167 (ephemeral) |
| Private IP | 10.0.0.83 |
| VCN | vcn05122317 |
| Subnet | subnet05122317 |

### Services on the VM

All three run as systemd services, auto-start on boot:

```
radio-room.service   →  Bun backend on localhost:3000
cloudflared.service  →  cloudflared tunnel --url http://localhost:3000
tailscaled.service   →  tailscaled (Tailscale agent)
```

### Cloudflare services used

| Service | Purpose | Cost |
|---------|---------|------|
| Cloudflare Pages | Hosts frontend static files | Free |
| Cloudflare Tunnel (ephemeral) | Exposes backend HTTPS/WSS | Free |
| Cloudflare DNS | (not used — no custom domain) | — |

### Git remotes

| Name | URL | Purpose |
|------|-----|---------|
| `github` | `https://github.com/diogomgbrito/radio-room.git` | Primary public repo |
| `origin` | `ssh://git@git.brilean.cloud:2424/diogo.brito/radio-room.git` | Private Brilean GitLab |

Both are pushed to simultaneously on deploy.

### Tailscale tailnet

| Property | Value |
|----------|-------|
| Tailnet name | `cormo-mark.ts.net` |
| VM name | `dmgb-vm-1` |
| VM Tailscale IP | `100.76.254.86` |
| Other devices | `dmgbomarchy` (Linux), `home-pc-windows` (Windows), `s24-ultra` (Android), `work-mac` (macOS) |
| SELinux status | Enforcing (blocks Tailscale SSH) |

---

## Testing

### e2e test suite

7 spec files in `e2e/`, run via Playwright:

| File | Tests | Focus |
|------|-------|-------|
| `radio-room.spec.ts` | Core flows | Join, add track, playback, skip |
| `edge-cases.spec.ts` | Error handling | Empty queue, invalid URLs, disconnect |
| `api-edge-cases.spec.ts` | API behavior | Resolve endpoint, CORS, malformed JSON |
| `additional-ux.spec.ts` | UI interactions | Chat, volume, queue reordering |
| `accessibility.spec.ts` | a11y | Keyboard navigation, ARIA labels |

### Mocking

Tests mock the YouTube IFrame API via `e2e/mock-youtube-api.js`. No real YouTube videos load during tests.

### Running tests

```bash
bunx playwright install   # first time only
bunx playwright test      # run all tests
```

---

## File Structure

```
radio-room/
├── AGENTS.md                  # Agent instructions (Bun conventions)
├── ARCHITECTURE.md            # This file
├── CLAUDE.md                  # Claude-specific instructions (Bun conventions)
├── DEPLOY.md                  # Deployment guide
├── Dockerfile                 # Container image definition (not used in prod)
├── K8S.md                     # Kubernetes deployment notes (not used in prod)
├── README.md                  # Project README
├── bun.lock                   # Bun lockfile
├── package.json               # Dependencies (dev only — no runtime deps)
├── playwright.config.ts       # Playwright configuration
├── tsconfig.json              # TypeScript config
├── data/                      # SQLite DB directory (gitignored)
├── e2e/                       # Playwright test suite
│   ├── accessibility.spec.ts
│   ├── additional-ux.spec.ts
│   ├── api-edge-cases.spec.ts
│   ├── edge-cases.spec.ts
│   ├── helpers.ts
│   ├── mock-youtube-api.js
│   └── radio-room.spec.ts
├── k8s/                       # Kubernetes manifests (not used in prod)
│   ├── deployment.yaml
│   ├── ingress.yaml
│   ├── kustomization.yaml
│   ├── namespace.yaml
│   ├── pvc.yaml
│   └── service.yaml
├── public/                    # Frontend static files
│   ├── app.js
│   ├── config.js
│   ├── index.html
│   ├── radio-room-logo-mark.svg
│   ├── radio-room-onair-mark.svg
│   └── style.css
└── server/                    # Backend source
    ├── index.ts               # Bun HTTP + WebSocket server entrypoint
    ├── types.ts               # Shared TypeScript interfaces
    ├── services/
    │   ├── db.ts              # SQLite init and queries
    │   ├── link-resolver.ts   # YouTube/Spotify URL resolution
    │   └── queue.ts           # In-memory queue + skip voting logic
    └── ws/
        └── handlers.ts        # WebSocket message routing
```

---

## Technology Inventory

### Runtime & Language

| Technology | Version | Role |
|------------|---------|------|
| Bun | 1.2.x | Server runtime, package manager, bundler, SQLite |
| TypeScript | 5.x | Source language (no compile step — Bun runs `.ts` directly) |
| Node.js | — | Not used. Bun replaces Node entirely. |

### Frontend

| Technology | Role |
|------------|------|
| Vanilla HTML | Single-page app shell |
| Vanilla CSS | Dark theme styling (~28 KB) |
| Vanilla JS | Client logic (~15 KB) |
| YouTube IFrame API | Embedded player and playback control |
| No framework | No React, Vue, Svelte, etc. |
| No build tool | No Vite, Webpack, esbuild. Pages serves raw files. |

### Backend

| Technology | Role |
|------------|------|
| `Bun.serve()` | HTTP server + WebSocket upgrade |
| `bun:sqlite` | SQLite database (optional, disabled) |
| Built-in `WebSocket` | Real-time client sync |
| `Bun.file()` | Static file serving |

### Dev & Test

| Technology | Role |
|------------|------|
| Playwright | End-to-end testing (7 spec files) |
| `@playwright/test` | Test runner |

### Infrastructure

| Technology | Role |
|------------|------|
| Oracle Cloud VM | Compute (Always Free tier) |
| systemd | Service management (3 services) |
| cloudflared | Ephemeral HTTPS tunnel |
| Tailscale | Private mesh network |
| Cloudflare Pages | Frontend CDN hosting |
| Wrangler CLI | Pages deployment |

### Container / K8s (not used in production)

| Technology | Role |
|------------|------|
| Docker | Container image (defined, not used in prod deploy) |
| Kubernetes | K8s manifests exist but are not deployed |

---

## Known Limitations

These are **intentional or unavoidable** given the current architecture:

1. **Single instance only.** In-memory state means one Bun process. No horizontal scaling.
2. **No HTTPS on the VM.** Cloudflare Tunnel handles TLS at the edge. Direct IP access is HTTP only.
3. **Ephemeral tunnel URL.** `trycloudflare.com` URLs change when cloudflared restarts. `config.js` must be updated manually.
4. **Oracle public IP is ephemeral.** Stopping the VM may change `141.253.121.167`. Tailscale IP is the stable alternative.
5. **SELinux blocks Tailscale SSH.** Must run `sudo setsebool -P tailscale_ssh on` to enable.
6. **No custom domain.** This is a test project; no domain is purchased.
