import type { LyricProvider, LyricProviderInfo, Lyrics } from "../../shared/types";
import { LYRIC_PROVIDER_NAMES } from "../../shared/constants";
import { findGeniusLyrics } from "./genius";
import { findLyrics, NO_LYRICS, type LyricsQuery } from "./lrclib";
import { findMusixmatchLyrics, musixmatchReady } from "./musixmatch";
import { findPetitLyrics } from "./petitlyrics";

/**
 * The lyrics service the person picked in the settings.
 *
 * LRCLIB, Genius and PetitLyrics answer on their own. Musixmatch needs a key on the server.
 * Whenever the chosen service has nothing, LRCLIB is asked, so a song still gets its words.
 */
export async function findLyricsFor(provider: LyricProvider, q: LyricsQuery): Promise<Lyrics> {
  const first = async (): Promise<Lyrics | null> => {
    switch (provider) {
      case "genius": return (await findGeniusLyrics(q)) || null;
      case "musixmatch": return findMusixmatchLyrics(q);
      case "petit": return findPetitLyrics(q);
      default: return null;
    }
  };
  const own = await first().catch(() => null);
  if (own && own.status !== "none") return own;
  if (provider === "genius") return NO_LYRICS;
  return findLyrics(q);
}

/* A short-lived cache for the public lyrics endpoint, so a popular song is fetched once. */
const cache = new Map<string, { at: number; value: Lyrics }>();
const TTL = 6 * 60 * 60 * 1000;

/** The same lookup, but remembered for a while. Used for songs playing on Spotify. */
export async function findLyricsForCached(provider: LyricProvider, q: LyricsQuery): Promise<Lyrics> {
  const key = [provider, q.title, q.artist, q.album ?? "", Math.round(q.duration ?? 0),].join("|").toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const value = await findLyricsFor(provider, q);
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** What each service can do on this server, so the settings can say so. */
export function providerInfo(): LyricProviderInfo[] {
  return [
    { id: "lrclib", name: LYRIC_PROVIDER_NAMES.lrclib, ready: true, note: "Free and open. Timed lyrics where the song has them." },
    { id: "genius", name: LYRIC_PROVIDER_NAMES.genius, ready: true, note: "The words of the song, without timings." },
    { id: "musixmatch", name: LYRIC_PROVIDER_NAMES.musixmatch, ready: musixmatchReady(), note: musixmatchReady() ? "Musixmatch's catalogue. Timed lyrics depend on the plan of the key." : "Set MUSIXMATCH_API_KEY on the server. LRCLIB is used until then." },
    { id: "petit", name: LYRIC_PROVIDER_NAMES.petit, ready: true, note: "Plain words, strongest for Japanese songs. LRCLIB is used when it has nothing." },
  ];
}
