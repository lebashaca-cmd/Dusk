import type { LyricLine, Lyrics } from "../../shared/types";
import { api } from "../api";
import type { SpotifyActivity } from "./lanyard";

export const NO_LYRICS: Lyrics = { status: "none", lines: [], plain: "" };

/** Index of the line being sung at `seconds`, or -1 before the first line. */
export function activeLine(lines: readonly LyricLine[], seconds: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((lines[mid]?.t ?? Infinity) <= seconds) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}

/** The text that stands in for lyrics that aren't ready or don't exist. */
export function lyricsMessage(l: Lyrics | null): string {
  if (!l) return "Loading lyrics…";
  switch (l.status) {
    case "none": return "No lyrics found for this song";
    case "instrumental": return "Instrumental";
    case "plain": return "Lyrics aren't synced for this song. Open to read them.";
    default: return "";
  }
}

/* Songs from uploads already carry their lyrics. Songs playing on Spotify are looked up as they change. */
const cache = new Map<string, Lyrics | "loading">();
const listeners = new Set<() => void>();

export function onLyricsLoaded(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Lyrics for a Spotify song, or null while they are still loading. */
export function lyricsForSpotify(sp: SpotifyActivity): Lyrics | null {
  const key = `${sp.artist}|${sp.title}`.toLowerCase();
  const hit = cache.get(key);
  if (hit === "loading") return null;
  if (hit) return hit;
  cache.set(key, "loading");
  api
    .lyrics({ title: sp.title, artist: sp.artist.split(",")[0]?.trim() ?? sp.artist, album: sp.album, duration: (sp.end - sp.start) / 1000 })
    .catch(() => NO_LYRICS)
    .then(l => { cache.set(key, l); listeners.forEach(fn => fn()); });
  return null;
}
