import type { ServerWebSocket } from "bun";
import type { ClientMessage, ServerMessage, Track } from "../types";
import {
  addUser,
  getUser,
  removeUser,
  getUserCount,
  getUserNames,
  addTrack,
  advanceQueue,
  voteSkip,
  getRoom,
} from "../services/queue";
import { logSong, logActivity, incrementPlayCount } from "../services/db";
import { resolveUrl } from "../services/link-resolver";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WSData {
  userId: string;
  userName?: string;
}

export type BroadcastFn = (
  message: ServerMessage,
  excludeWs?: ServerWebSocket<WSData>,
) => void;

// ---------------------------------------------------------------------------
// Track queue-ID → DB song-ID mapping
// ---------------------------------------------------------------------------

const trackDbIdMap = new Map<string, number>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function send(
  ws: ServerWebSocket<WSData>,
  message: ServerMessage | { type: "error"; message: string },
) {
  ws.send(JSON.stringify(message));
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export function handleJoin(
  ws: ServerWebSocket<WSData>,
  name: string,
  broadcast: BroadcastFn,
) {
  const userId = crypto.randomUUID();
  const userName = name || "Anonymous";
  ws.data = { userId, userName };

  addUser(userId, userName, ws);
  logActivity("user_joined", userName);

  // Confirm join to this client
  send(ws, {
    type: "joined",
    userId,
    users: getUserNames(),
  });

  // Notify everyone else
  broadcast(
    { type: "user_joined", name: userName, userCount: getUserCount() },
    ws,
  );

  // Sync current track so the newcomer can play along
  const room = getRoom();
  if (room.currentTrack) {
    send(ws, {
      type: "play_track",
      track: room.currentTrack,
      startedAt: room.currentTrackStartedAt!,
    });
  }
}

export async function handleAddTrack(
  ws: ServerWebSocket<WSData>,
  url: string,
  broadcast: BroadcastFn,
) {
  const user = getUser(ws.data.userId);
  if (!user) {
    send(ws, {
      type: "error",
      message: "You must join before adding tracks.",
    });
    return;
  }

  try {
    const resolved = await resolveUrl(url);

    const hadCurrentTrack = !!getRoom().currentTrack;

    addTrack({
      source: resolved.source,
      youtubeId: resolved.youtubeId,
      title: resolved.title,
      artist: resolved.artist,
      thumbnailUrl: resolved.thumbnailUrl,
      duration: 0,
      addedBy: user.name,
    });

    const room = getRoom();

    // The newly-added track is either currentTrack (if nothing was playing)
    // or the last item in the queue.
    const newTrack: Track | null = hadCurrentTrack
      ? room.queue[room.queue.length - 1] ?? null
      : room.currentTrack;

    if (newTrack) {
      const songDbId = logSong({
        youtubeId: resolved.youtubeId,
        title: resolved.title,
        artist: resolved.artist,
        thumbnailUrl: resolved.thumbnailUrl,
        source: resolved.source,
        duration: 0,
        addedBy: user.name,
        addedAt: newTrack.addedAt,
      });

      trackDbIdMap.set(newTrack.id, songDbId);

      logActivity("track_added", user.name, songDbId);

      // Track was auto-played (became currentTrack immediately)
      if (!hadCurrentTrack) {
        logActivity("track_played", user.name, songDbId);
        incrementPlayCount(songDbId);
      }
    }

    // Broadcast queue update to everyone
    broadcast({ type: "queue_update", queue: room.queue });

    // If track became current, tell everyone to play it
    if (!hadCurrentTrack && room.currentTrack) {
      broadcast({
        type: "play_track",
        track: room.currentTrack,
        startedAt: room.currentTrackStartedAt!,
      });
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to resolve URL.";
    send(ws, { type: "error", message });
  }
}

export function handleTrackEnded(
  ws: ServerWebSocket<WSData>,
  broadcast: BroadcastFn,
) {
  const room = getRoom();
  const hadTrack = !!room.currentTrack;

  // Remember DB id of the track that just ended (for logging)
  let prevTrackDbId: number | undefined;
  if (room.currentTrack) {
    prevTrackDbId = trackDbIdMap.get(room.currentTrack.id);
  }

  const newTrack = advanceQueue();

  if (hadTrack) {
    logActivity("track_ended", undefined, prevTrackDbId);
  }

  if (newTrack) {
    const newTrackDbId = trackDbIdMap.get(newTrack.id);
    logActivity("track_played", newTrack.addedBy, newTrackDbId);
    if (newTrackDbId) {
      incrementPlayCount(newTrackDbId);
    }

    broadcast({
      type: "play_track",
      track: newTrack,
      startedAt: getRoom().currentTrackStartedAt!,
    });
  }

  broadcast({ type: "queue_update", queue: getRoom().queue });
}

export function handleVoteSkip(
  ws: ServerWebSocket<WSData>,
  broadcast: BroadcastFn,
) {
  const result = voteSkip(ws.data.userId);
  logActivity("vote_skip_cast", ws.data.userName);

  broadcast({
    type: "skip_update",
    votes: result.votes,
    needed: result.needed,
  });

  if (result.skipped) {
    logActivity("track_skipped", ws.data.userName);

    const room = getRoom();

    if (room.currentTrack) {
      const newTrackDbId = trackDbIdMap.get(room.currentTrack.id);
      logActivity(
        "track_played",
        room.currentTrack.addedBy,
        newTrackDbId,
      );
      if (newTrackDbId) {
        incrementPlayCount(newTrackDbId);
      }

      broadcast({
        type: "play_track",
        track: room.currentTrack,
        startedAt: room.currentTrackStartedAt!,
      });
    }

    broadcast({ type: "track_skipped" });
    broadcast({ type: "queue_update", queue: room.queue });
  }
}

export function handleDisconnect(
  ws: ServerWebSocket<WSData>,
  broadcast: BroadcastFn,
) {
  if (ws.data?.userId) {
    const name = removeUser(ws.data.userId);
    if (name) {
      logActivity("user_left", name);
      broadcast({
        type: "user_left",
        name,
        userCount: getUserCount(),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

export function routeMessage(
  ws: ServerWebSocket<WSData>,
  parsed: ClientMessage,
  broadcast: BroadcastFn,
) {
  switch (parsed.type) {
    case "join":
      handleJoin(ws, parsed.name, broadcast);
      break;
    case "add_track":
      handleAddTrack(ws, parsed.url, broadcast);
      break;
    case "track_ended":
      handleTrackEnded(ws, broadcast);
      break;
    case "vote_skip":
      handleVoteSkip(ws, broadcast);
      break;
    default: {
      const exhaustive: never = parsed;
      console.warn("[ws] unknown message type:", (exhaustive as { type: string }).type);
    }
  }
}
