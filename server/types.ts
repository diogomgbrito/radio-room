export interface Track {
  id: string;
  source: "spotify" | "youtube";
  youtubeId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  duration: number;
  addedBy: string;
  addedAt: number;
}

export interface User {
  id: string;
  name: string;
  joinedAt: number;
}

export interface Room {
  queue: Track[];
  currentTrack: Track | null;
  currentTrackStartedAt: number | null;
  users: Map<string, User>;
  skipVotes: Set<string>;
}

// WebSocket message types
export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "add_track"; url: string }
  | { type: "track_ended" }
  | { type: "vote_skip" };

export type ServerMessage =
  | { type: "joined"; userId: string; users: string[] }
  | { type: "user_joined"; name: string; userCount: number }
  | { type: "user_left"; name: string; userCount: number }
  | { type: "queue_update"; queue: Track[] }
  | { type: "play_track"; track: Track; startedAt: number }
  | { type: "skip_update"; votes: number; needed: number }
  | { type: "skip_warning"; seconds: number; votes: number; needed: number }
  | { type: "track_skipped" };
