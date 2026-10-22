import type { Lyrics } from "../../shared/types";
import { lyrics as config } from "../config";
import type { LyricsQuery } from "./lrclib";
import { NO_LYRICS } from "./lrclib";

/**
 * Lyrics from Genius (https://genius.com).
 *
 * Genius has no timed lyrics, so what comes back is the plain text of the song. The
 * public search endpoint needs no key; a GENIUS_TOKEN is used when it is set, because
 * the official API is steadier than the public one.
 */

const HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

interface GeniusSong {
  id: number;
  title: string;
  url: string;
  path: string;
  artist_names?: string;
  primary_artist_names?: string;
  lyrics_state?: string;
}

interface GeniusSearch {
  response?: {
    sections?: Array<{ type?: string; hits?: Array<{ type?: string; result?: GeniusSong }> }>;
  };
}

async function getJson<T>(url: string): Promise<T | null> {
  const headers: Record<string, string> = { ...HEADERS };
  if (config.geniusToken) headers.Authorization = `Bearer ${config.geniusToken}`;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Genius answered ${res.status}`);
  return (await res.json()) as T;
}

/** The words on a Genius page, with the markup taken out. */
function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#8217;/g, "’")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map(l => l.trim())
    .join("\n")
    .trim();
}

/**
 * The lyrics on a song page.
 *
 * Genius puts the words in blocks marked with data-lyrics-container. The first block on
 * a page is a list of translations, so the blocks with real line breaks in them are the
 * ones to keep.
 */
function lyricsFromPage(html: string): string {
  const blocks = [...html.matchAll(/data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi)].map(m => m[1] ?? "");
  const withLines = blocks
    .map(b => plainText(b))
    .filter(t => t.length > 0 && t.includes("\n"))
    .filter(t => !/^\d+\s*Contributors\s*Translations/i.test(t));
  if (withLines.length) return withLines.join("\n\n");
  // A song with one line only, or a page that marks the words differently.
  const any = blocks.map(b => plainText(b)).filter(t => t.length > 20 && !/Contributors\s*Translations/i.test(t));
  return any.sort((a, b) => b.length - a.length)[0] ?? "";
}

/** Find the song on Genius. */
async function search(q: LyricsQuery): Promise<GeniusSong | null> {
  const title = q.title.trim();
  const artist = q.artist.trim();
  if (!title) return null;

  if (config.geniusToken) {
    const params = new URLSearchParams({ q: `${title} ${artist}`.trim() });
    const official = await getJson<{ response?: { hits?: Array<{ result?: GeniusSong }> } }>(`https://api.genius.com/search?${params}`).catch(() => null);
    const hit = official?.response?.hits?.find(h => h.result)?.result;
    if (hit) return hit;
  }

  const params = new URLSearchParams({ q: `${title} ${artist}`.trim() });
  const found = await getJson<GeniusSearch>(`https://genius.com/api/search/multi?${params}`).catch(() => null);
  const songs = (found?.response?.sections ?? []).flatMap(s => s.hits ?? []).map(h => h.result).filter((r): r is GeniusSong => Boolean(r?.url));
  if (!songs.length) return null;

  // The song whose title and artist match best wins.
  const wanted = title.toLowerCase();
  const wantedArtist = artist.toLowerCase();
  const score = (s: GeniusSong): number => {
    const t = s.title.toLowerCase();
    const a = (s.primary_artist_names ?? s.artist_names ?? "").toLowerCase();
    let n = 0;
    if (t === wanted) n += 6;
    else if (t.includes(wanted) || wanted.includes(t)) n += 3;
    if (a && wantedArtist) {
      if (a === wantedArtist) n += 6;
      else if (a.includes(wantedArtist) || wantedArtist.includes(a)) n += 3;
    }
    return n;
  };
  return songs.sort((a, b) => score(b) - score(a))[0] ?? null;
}

export async function findGeniusLyrics(q: LyricsQuery): Promise<Lyrics> {
  const song = await search(q);
  if (!song) return NO_LYRICS;
  const page = await fetch(`https://genius.com${song.path}`, { headers: HEADERS, signal: AbortSignal.timeout(12_000) })
    .then(r => (r.ok ? r.text() : ""))
    .catch(() => "");
  if (!page) return NO_LYRICS;
  const text = lyricsFromPage(page);
  if (!text) return NO_LYRICS;
  return { status: "plain", lines: [], plain: text, source: "genius" };
}
