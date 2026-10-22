import type { LyricProvider, Lyrics } from "../../shared/types";
import { clamp } from "../util/format";
import type { SpotifyActivity } from "./lanyard";
import { lyricsForSpotify } from "./lyrics";
import { player } from "./player";

/** One song that is playing, from an uploaded MP3 or from Spotify, in the shape the cards need. */
export interface NowPlaying {
  source: "upload" | "spotify";
  /** Changes whenever the song changes. */
  key: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  /** Where to open the song, when it has a page. */
  link: string | null;
  durationMs: number;
  positionMs(): number;
  isPlaying(): boolean;
  /** Null while lyrics are still being fetched. */
  lyrics(): Lyrics | null;
  /** Why the song cannot be played, or null when it can. */
  failure(): string | null;
  controls: null | {
    toggle(): void;
    prev(): void;
    next(): void;
    seek(ms: number): void;
    multiple: boolean;
  };
}

export function uploadNowPlaying(): NowPlaying | null {
  const track = player.current;
  if (!track) return null;
  return {
    source: "upload",
    key: `upload:${track.id}`,
    title: track.title,
    artist: track.artist,
    coverUrl: track.coverUrl,
    link: null,
    durationMs: track.duration * 1000,
    positionMs: () => player.positionMs(),
    isPlaying: () => player.playing,
    lyrics: () => track.lyrics,
    // A song whose file is gone cannot play, and the page has to say so.
    failure: () => (track.available ? player.error : "This song can't be played. Its file is missing."),
    controls: {
      toggle: () => player.toggle(),
      prev: () => player.prev(),
      next: () => player.next(),
      seek: ms => player.seek(ms),
      multiple: player.tracks.length > 1,
    },
  };
}

export function spotifyNowPlaying(sp: SpotifyActivity, provider: LyricProvider = "lrclib"): NowPlaying {
  const duration = Math.max(1000, sp.end - sp.start);
  return {
    source: "spotify",
    key: `spotify:${sp.id}`,
    title: sp.title,
    artist: sp.artist,
    coverUrl: sp.art,
    link: `https://open.spotify.com/track/${encodeURIComponent(sp.id)}`,
    durationMs: duration,
    positionMs: () => clamp(Date.now() - sp.start, 0, duration),
    isPlaying: () => true,
    lyrics: () => lyricsForSpotify(sp, provider),
    failure: () => null,
    controls: null,
  };
}
