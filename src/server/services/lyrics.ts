import type { LyricProvider, LyricProviderInfo, Lyrics } from "../../shared/types";
import { LYRIC_PROVIDER_NAMES } from "../../shared/constants";
import { findGeniusLyrics } from "./genius";
import { findLyrics, NO_LYRICS, type LyricsQuery } from "./lrclib";
import { findPolarisLyrics, polarisReady } from "./polaris";

/**
 * The lyrics service the person picked in the settings.
 *
 * LRCLIB and Genius answer on their own. Polaris is self-hosted: when the server has no
 * address for it, LRCLIB is used instead, so a song still gets its words.
 */
export async function findLyricsFor(provider: LyricProvider, q: LyricsQuery): Promise<Lyrics> {
  switch (provider) {
    case "genius":
      return (await findGeniusLyrics(q).catch(() => NO_LYRICS)) || NO_LYRICS;
    case "polaris":
      return (await findPolarisLyrics(q, false).catch(() => null)) ?? (await findLyrics(q));
    case "polarisMono":
      return (await findPolarisLyrics(q, true).catch(() => null)) ?? (await findLyrics(q));
    default:
      return findLyrics(q);
  }
}

/* A short-lived cache for the public lyrics endpoint, so a popular song is fetched once. */
const cache = new Map<string, { at: number; value: Lyrics }>();
const TTL = 6 * 60 * 60 * 1000;

/** The same lookup, but remembered for a while. Used for songs playing on Spotify. */
export async function findLyricsForCached(provider: LyricProvider, q: LyricsQuery): Promise<Lyrics> {
  const key = [provider, q.title, q.artist, q.album ?? "", Math.round(q.duration ?? 0)].join("|").toLowerCase();
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
    { id: "polaris", name: LYRIC_PROVIDER_NAMES.polaris, ready: polarisReady(false), note: polarisReady(false) ? "Your own Polaris service." : "Set POLARIS_LYRICS_URL on the server. LRCLIB is used until then." },
    { id: "polarisMono", name: LYRIC_PROVIDER_NAMES.polarisMono, ready: polarisReady(true), note: polarisReady(true) ? "Your own Polaris service, plain words only." : "Set POLARIS_MONO_LYRICS_URL on the server. LRCLIB is used until then." },
    { id: "genius", name: LYRIC_PROVIDER_NAMES.genius, ready: true, note: "The words of the song, without timings." },
  ];
}
