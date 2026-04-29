import type { Track, User, Room } from "../types";

// ---------------------------------------------------------------------------
// In-memory room state
// ---------------------------------------------------------------------------

const room: Room = {
  queue: [],
  currentTrack: null,
  currentTrackStartedAt: null,
  users: new Map(),
  skipVotes: new Set(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a read-only snapshot of the current room state. */
export function getRoom(): Readonly<Room> {
  return room;
}

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

export function addUser(userId: string, name: string, _ws?: unknown): User {
  const user: User = {
    id: userId,
    name,
    joinedAt: Date.now(),
  };
  room.users.set(userId, user);
  return user;
}

/**
 * Removes a user from the room.
 * If the room is now empty, clears queue, current track, and skip votes.
 * Returns the removed user's name (or undefined if user wasn't found).
 */
export function removeUser(userId: string): string | undefined {
  const user = room.users.get(userId);
  if (!user) return undefined;

  const name = user.name;
  room.users.delete(userId);
  room.skipVotes.delete(userId);

  // Auto-delete: clear everything when last user leaves
  if (room.users.size === 0) {
    room.queue = [];
    room.currentTrack = null;
    room.currentTrackStartedAt = null;
    room.skipVotes.clear();
  }

  return name;
}

export function getUser(userId: string): User | undefined {
  return room.users.get(userId);
}

export function getUserCount(): number {
  return room.users.size;
}

export function getUserNames(): string[] {
  return Array.from(room.users.values()).map((u) => u.name);
}

// ---------------------------------------------------------------------------
// Queue management
// ---------------------------------------------------------------------------

let trackIdCounter = 0;

/**
 * Adds a track to the queue.
 * If nothing is currently playing, immediately sets it as the current track.
 * Returns the updated room state.
 */
export function addTrack(track: Omit<Track, "id" | "addedAt">): Readonly<Room> {
  const fullTrack: Track = {
    ...track,
    id: `track_${++trackIdCounter}_${crypto.randomUUID()}`,
    addedAt: Date.now(),
  };

  if (!room.currentTrack) {
    room.currentTrack = fullTrack;
    room.currentTrackStartedAt = Date.now();
  } else {
    room.queue.push(fullTrack);
  }

  return room;
}

/**
 * Advances to the next track in the queue.
 * Resets skip votes and sets the new startedAt timestamp.
 * Returns the new current track (or null if the queue is empty).
 */
export function advanceQueue(): Track | null {
  room.skipVotes.clear();

  const next = room.queue.shift() ?? null;
  room.currentTrack = next;
  room.currentTrackStartedAt = next ? Date.now() : null;

  return next;
}

// ---------------------------------------------------------------------------
// Skip voting
// ---------------------------------------------------------------------------

/**
 * Registers a skip vote from a user.
 * If votes exceed 50% of connected users (strictly more than half),
 * the queue auto-advances.
 *
 * Threshold: votes > users.length / 2
 *   - 1 user → 1 vote triggers skip  (1 > 0.5)
 *   - 2 users → 2 votes trigger skip (2 > 1)
 *   - 3 users → 2 votes trigger skip (2 > 1.5)
 *
 * Returns { votes, needed, skipped }.
 */
export function voteSkip(userId: string): {
  votes: number;
  needed: number;
  skipped: boolean;
} {
  room.skipVotes.add(userId);

  const totalUsers = room.users.size;
  // Need strictly more than half
  const needed = Math.floor(totalUsers / 2) + 1;
  const votes = room.skipVotes.size;
  let skipped = false;

  if (votes >= needed) {
    advanceQueue();
    skipped = true;
  }

  return { votes, needed, skipped };
}
