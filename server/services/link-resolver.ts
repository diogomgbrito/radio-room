// --- URL helpers ---

const YOUTUBE_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/;

const SPOTIFY_TRACK_REGEX =
  /(?:https?:\/\/)?open\.spotify\.com\/track\/([a-zA-Z0-9]+)(?:\?.*)?$/;

// --- Exported types ---

export interface ResolvedTrack {
  youtubeId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  source: "spotify" | "youtube";
}

// --- Main resolver ---

export async function resolveUrl(
  url: string,
): Promise<ResolvedTrack> {
  const trimmed = url.trim();

  // Try YouTube first
  const ytMatch = trimmed.match(YOUTUBE_REGEX);
  if (ytMatch) {
    return resolveYouTube(ytMatch[1]);
  }

  // Try Spotify
  const spMatch = trimmed.match(SPOTIFY_TRACK_REGEX);
  if (spMatch) {
    return resolveSpotify(spMatch[1]);
  }

  throw new Error(
    "Unrecognized URL. Supported formats: YouTube videos and Spotify tracks.",
  );
}

// --- YouTube ---

async function resolveYouTube(
  videoId: string,
): Promise<ResolvedTrack> {
  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;

  const res = await fetch(oembedUrl);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch YouTube metadata (HTTP ${res.status})`,
    );
  }

  const data = (await res.json()) as {
    title?: string;
    author_name?: string;
  };

  const rawTitle: string = data.title ?? "";
  const { title, artist } = parseArtistTitle(rawTitle);

  return {
    youtubeId: videoId,
    title,
    artist: artist || data.author_name || "",
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    source: "youtube",
  };
}

// --- Spotify ---

async function resolveSpotify(
  trackId: string,
): Promise<ResolvedTrack> {
  // 1. Fetch Spotify oEmbed (free, no auth)
  const oembedUrl = `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${trackId}`;

  const spRes = await fetch(oembedUrl);
  if (!spRes.ok) {
    throw new Error(
      `Failed to fetch Spotify metadata (HTTP ${spRes.status}). The track may not exist or may be region-locked.`,
    );
  }

  const spData = (await spRes.json()) as {
    title?: string;
    html?: string;
    thumbnail_url?: string;
  };

  // Spotify oEmbed title is usually "Song Name" and html contains artist info.
  // Build a search query from whatever we have.
  const songTitle: string = spData.title ?? "";

  // Try to extract artist from the HTML embed snippet.
  // The HTML usually looks like: <iframe ... title="Song Name by Artist Name" ...>
  // Or the title field itself may contain " by Artist".
  let artist = "";
  const byMatch = songTitle.match(/\s+by\s+(.+)$/i);
  if (byMatch) {
    artist = byMatch[1].trim();
  }

  const searchQuery = artist ? `${songTitle.replace(/\s+by\s+.+$/i, "")} ${artist}` : songTitle;

  if (!searchQuery) {
    throw new Error("Could not determine song name from Spotify URL.");
  }

  // 2. Search YouTube for the song
  const ytVideoId = await searchYouTube(searchQuery);
  if (!ytVideoId) {
    throw new Error(
      `Could not find a YouTube video for "${searchQuery}".`,
    );
  }

  // 3. Fetch YouTube oEmbed for full metadata
  const ytOembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytVideoId}&format=json`;

  const ytRes = await fetch(ytOembedUrl);
  if (!ytRes.ok) {
    // Even if oEmbed fails we still have the video ID — return what we can.
    return {
      youtubeId: ytVideoId,
      title: songTitle,
      artist,
      thumbnailUrl: `https://img.youtube.com/vi/${ytVideoId}/mqdefault.jpg`,
      source: "spotify",
    };
  }

  const ytData = (await ytRes.json()) as {
    title?: string;
    author_name?: string;
  };

  const rawTitle: string = ytData.title ?? songTitle;
  const parsed = parseArtistTitle(rawTitle);

  return {
    youtubeId: ytVideoId,
    title: parsed.title,
    artist: parsed.artist || artist || ytData.author_name || "",
    thumbnailUrl: `https://img.youtube.com/vi/${ytVideoId}/mqdefault.jpg`,
    source: "spotify",
  };
}

// --- YouTube search scraper ---

async function searchYouTube(query: string): Promise<string | null> {
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

  const res = await fetch(searchUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!res.ok) return null;

  const html = await res.text();

  // YouTube embeds initial data as JSON in the page. Look for videoId entries.
  const videoIdMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
  return videoIdMatch ? videoIdMatch[1] : null;
}

// --- Helpers ---

/**
 * Parse common "Artist - Title" / "Artist — Title" patterns.
 * Returns the best-effort title and artist.
 */
function parseArtistTitle(raw: string): { title: string; artist: string } {
  // Try en-dash or em-dash separator
  const dashMatch = raw.match(/^(.+?)\s*[—–-]\s*(.+)$/);
  if (dashMatch) {
    return {
      artist: dashMatch[1].trim(),
      title: dashMatch[2].trim(),
    };
  }

  // Try "Title by Artist" pattern
  const byMatch = raw.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    return {
      title: byMatch[1].trim(),
      artist: byMatch[2].trim(),
    };
  }

  // No clear separator — treat the whole string as title
  return { title: raw, artist: "" };
}
