# 🎵 Radio Room

A collaborative listening room — join with your office mates, queue songs from YouTube or Spotify, and listen together in sync.

## What It Does

- **Shared queue** — everyone in the room adds links, one song plays at a time
- **Synced playback** — all listeners hear the same track at the same position via YouTube IFrame API
- **YouTube & Spotify** — paste any YouTube or Spotify link, Spotify tracks are auto-resolved to YouTube
- **Vote to skip** — majority vote skips the current track
- **No accounts needed** — just enter your name (or stay anonymous)
- **Persistent history** — SQLite logs every song added and activity event

## Quick Start

```bash
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

- `bun run dev` — start dev server with hot reload (port 3000)
- `bun run start` — start production server

## Tech Stack

- **Runtime:** [Bun](https://bun.sh) — server, SQLite, package manager
- **Frontend:** Vanilla HTML/CSS/JS (no framework)
- **Realtime:** WebSocket for queue sync and playback coordination
- **Playback:** YouTube IFrame API (controls hidden, custom volume slider)
- **Database:** `bun:sqlite` for song history and activity logging
- **Testing:** Playwright e2e tests with mocked YouTube API (16 tests)

## Project Structure

```
radio-room/
├── server/
│   ├── index.ts              # Bun HTTP + WebSocket server
│   ├── types.ts              # Shared TypeScript interfaces
│   ├── ws/
│   │   └── handlers.ts       # WebSocket message handlers
│   └── services/
│       ├── queue.ts          # In-memory queue + skip voting
│       ├── link-resolver.ts  # YouTube/Spotify URL → track metadata
│       └── db.ts             # SQLite init + queries
├── public/
│   ├── index.html            # Single-page app
│   ├── style.css             # Dark theme styles
│   └── app.js                # Client-side logic
├── e2e/
│   ├── radio-room.spec.ts    # Playwright test suite
│   ├── helpers.ts            # Test fixtures
│   └── mock-youtube-api.js   # Mock YT IFrame API
├── data/                     # SQLite DB (gitignored)
└── package.json
```

## Running Tests

```bash
bunx playwright install        # first time only
bunx playwright test           # run all 16 tests
```

Tests use a mocked YouTube IFrame API so they run headless without loading real videos.

## How It Works

1. **Join** — enter your name, WebSocket connects you to the single shared room
2. **Add tracks** — paste a YouTube or Spotify link, server resolves it to a YouTube video ID
3. **Play** — tracks play in FIFO order, synced for all users via server timestamps
4. **Skip** — vote to skip; majority (>50% of listeners) triggers the skip
5. **Leave** — room auto-cleans when the last person disconnects

## License

MIT
