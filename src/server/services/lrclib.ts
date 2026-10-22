import type { LyricLine, Lyrics } from "../../shared/types";

/**
 * Lyrics come from LRCLIB (https://lrclib.net), a free, open lyrics database.
 * It returns synced lyrics in LRC format: one "[mm:ss.xx] line" per line.
 */
const BASE = "https://lrclib.net/api";
const HEADERS = { "User-Agent": "Dusk/1.0 (self-hosted link-in-bio)" };

interface LrclibRecord {
  trackName: string;
  artistName: string;
  albumName: string | null;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

export interface LyricsQuery {
  title: string;
  artist: string;
  album?: string;
  /** Seconds. Helps LRCLIB pick the right version of a song. */
  duration?: number;
}

export const NO_LYRICS: Lyrics = { status: "none", lines: [], plain: "" };

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`LRCLIB answered ${res.status}`);
  return (await res.json()) as T;
}

export function parseLrc(text: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
    if (!m) continue;
    lines.push({ t: Number(m[1]) * 60 + parseFloat(m[2] ?? "0"), text: (m[3] ?? "").trim() || "♪" });
  }
  return lines.sort((a, b) => a.t - b.t);
}

function toLyrics(rec: LrclibRecord): Lyrics {
  if (rec.syncedLyrics) {
    const lines = parseLrc(rec.syncedLyrics);
    if (lines.length) return { status: "synced", lines, plain: rec.plainLyrics ?? "", source: "lrclib" };
  }
  if (rec.plainLyrics?.trim()) return { status: "plain", lines: [], plain: rec.plainLyrics, source: "lrclib" };
  if (rec.instrumental) return { status: "instrumental", lines: [], plain: "", source: "lrclib" };
  return NO_LYRICS;
}

/** Prefer a synced match whose length is close to the file's length. */
function pickBest(results: LrclibRecord[], duration?: number): LrclibRecord | null {
  const usable = results.filter(r => r.syncedLyrics || r.plainLyrics || r.instrumental);
  if (!usable.length) return null;
  const close = (r: LrclibRecord) => duration === undefined || r.duration === null || Math.abs(r.duration - duration) <= 4;
  return (
    usable.find(r => r.syncedLyrics && close(r)) ??
    usable.find(r => r.syncedLyrics) ??
    usable.find(r => close(r)) ??
    usable[0] ??
    null
  );
}

export async function findLyrics(q: LyricsQuery): Promise<Lyrics> {
  const title = q.title.trim();
  const artist = q.artist.trim();
  if (!title) return NO_LYRICS;

  // 1. Exact lookup, when we know the album and length.
  if (artist && q.album && q.duration) {
    const params = new URLSearchParams({
      track_name: title, artist_name: artist, album_name: q.album, duration: String(Math.round(q.duration)),
    });
    const exact = await getJson<LrclibRecord>(`${BASE}/get?${params}`).catch(() => null);
    if (exact) {
      const lyrics = toLyrics(exact);
      if (lyrics.status !== "none") return lyrics;
    }
  }

  // 2. Search by title and artist.
  const search = new URLSearchParams({ track_name: title });
  if (artist) search.set("artist_name", artist);
  const found = await getJson<LrclibRecord[]>(`${BASE}/search?${search}`);
  const best = pickBest(found ?? [], q.duration);
  if (best) return toLyrics(best);

  // 3. Looser free-text search.
  const loose = await getJson<LrclibRecord[]>(`${BASE}/search?${new URLSearchParams({ q: `${artist} ${title}`.trim() })}`);
  const looseBest = pickBest(loose ?? [], q.duration);
  return looseBest ? toLyrics(looseBest) : NO_LYRICS;
}

/* A short-lived cache for the public lyrics endpoint, so a popular song is fetched once. */
const cache = new Map<string, { at: number; value: Lyrics }>();
const TTL = 6 * 60 * 60 * 1000;

export async function findLyricsCached(q: LyricsQuery): Promise<Lyrics> {
  const key = [q.title, q.artist, q.album ?? "", Math.round(q.duration ?? 0)].join("|").toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const value = await findLyrics(q);
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), value });
  return value;
}
