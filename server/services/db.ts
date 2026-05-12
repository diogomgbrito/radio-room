import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = `${import.meta.dir}/../../data/radio-room.db`;

let db: Database | null = null;
let dbEnabled = false;

export function initDb(): Database | null {
  dbEnabled = process.env.ENABLE_DB === "true";

  if (!dbEnabled) {
    console.log("[db] Database disabled (set ENABLE_DB=true to enable)");
    return null;
  }

  // Ensure data/ directory exists
  mkdirSync(dirname(DB_PATH), { recursive: true });

  db = new Database(DB_PATH, { create: true });

  // Enable WAL mode for better concurrent read performance
  db.exec("PRAGMA journal_mode = WAL;");

  // Create songs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      youtube_id TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      thumbnail_url TEXT,
      source TEXT NOT NULL,
      duration INTEGER DEFAULT 0,
      added_by TEXT NOT NULL,
      added_at INTEGER NOT NULL,
      play_count INTEGER DEFAULT 0
    );
  `);

  // Create activity_log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      user_name TEXT,
      track_id INTEGER,
      details TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (track_id) REFERENCES songs(id)
    );
  `);

  console.log(`[db] SQLite database initialized at ${DB_PATH}`);
  return db;
}

export function getDb(): Database | null {
  if (!dbEnabled) return null;
  if (!db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return db;
}

export interface SongInput {
  youtubeId: string;
  title: string;
  artist: string;
  thumbnailUrl?: string;
  source: "spotify" | "youtube";
  duration?: number;
  addedBy: string;
  addedAt: number;
}

export function logSong(track: SongInput): number | undefined {
  const database = getDb();
  if (!database) return undefined;

  const stmt = database.prepare(`
    INSERT INTO songs (youtube_id, title, artist, thumbnail_url, source, duration, added_by, added_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    track.youtubeId,
    track.title,
    track.artist,
    track.thumbnailUrl ?? null,
    track.source,
    track.duration ?? 0,
    track.addedBy,
    track.addedAt,
  );

  return Number(result.lastInsertRowid);
}

export type EventType =
  | "track_added"
  | "track_played"
  | "track_skipped"
  | "track_ended"
  | "user_joined"
  | "user_left"
  | "vote_skip_cast";

export function logActivity(
  eventType: EventType,
  userName?: string,
  trackId?: number,
  details?: Record<string, unknown>,
): void {
  const database = getDb();
  if (!database) return;

  const stmt = database.prepare(`
    INSERT INTO activity_log (event_type, user_name, track_id, details, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(
    eventType,
    userName ?? null,
    trackId ?? null,
    details ? JSON.stringify(details) : null,
    Math.floor(Date.now() / 1000),
  );
}

export function incrementPlayCount(songId: number): void {
  if (!songId) return;
  const database = getDb();
  if (!database) return;

  const stmt = database.prepare(`
    UPDATE songs SET play_count = play_count + 1 WHERE id = ?
  `);

  stmt.run(songId);
}
