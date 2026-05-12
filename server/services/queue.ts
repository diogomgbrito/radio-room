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
    clearSkipTimeout();
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
  clearSkipTimeout();

  const next = room.queue.shift() ?? null;
  room.currentTrack = next;
  room.currentTrackStartedAt = next ? Date.now() : null;

  return next;
}

// ---------------------------------------------------------------------------
// Skip voting
// ---------------------------------------------------------------------------

// Store pending skip timeout
let skipTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Calculates the skip threshold based on user count.
 * - ≤ 5 users: 50% threshold (majority)
 * - > 5 users: 75% threshold (supermajority)
 */
function getSkipThreshold(userCount: number): number {
  if (userCount <= 5) {
    // 50% - need strictly more than half
    return Math.floor(userCount / 2) + 1;
  } else {
    // 75% - need 3/4 of users
    return Math.ceil(userCount * 0.75);
  }
}

/**
 * Clears any pending skip countdown.
 */
export function clearSkipTimeout(): void {
  if (skipTimeout) {
    clearTimeout(skipTimeout);
    skipTimeout = null;
  }
}

/**
 * Checks if there's a pending skip countdown.
 */
export function hasPendingSkip(): boolean {
  return skipTimeout !== null;
}

/**
 * Registers a skip vote from a user.
 * 
 * Threshold:
 *   - ≤ 5 users: 50% (votes > users/2)
 *   - > 5 users: 75% (votes ≥ users * 0.75)
 * 
 * When threshold is reached, broadcasts a warning with countdown,
 * then executes skip after countdown completes.
 *
 * Returns { votes, needed, triggered, skipped }.
 * - triggered: true when threshold reached and countdown started
 * - skipped: true when skip actually executed (after countdown)
 */
export function voteSkip(
  userId: string,
  onWarning: (seconds: number, votes: number, needed: number) => void,
  onSkip: () => void,
  countdownSeconds: number = 5,
): {
  votes: number;
  needed: number;
  triggered: boolean;
  skipped: boolean;
} {
  // Don't allow new votes if countdown is already in progress
  if (skipTimeout) {
    const needed = getSkipThreshold(room.users.size);
    return { votes: room.skipVotes.size, needed, triggered: false, skipped: false };
  }

  room.skipVotes.add(userId);

  const totalUsers = room.users.size;
  const needed = getSkipThreshold(totalUsers);
  const votes = room.skipVotes.size;

  // Check if threshold reached
  if (votes >= needed && !skipTimeout) {
    // Broadcast warning with countdown
    onWarning(countdownSeconds, votes, needed);

    // Start countdown
    skipTimeout = setTimeout(() => {
      skipTimeout = null;
      advanceQueue();
      onSkip();
    }, countdownSeconds * 1000);

    return { votes, needed, triggered: true, skipped: false };
  }

  return { votes, needed, triggered: false, skipped: false };
}
