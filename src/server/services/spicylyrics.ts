import type { LyricLine, Lyrics } from "../../shared/types";
import { lyrics as config } from "../config";
import { NO_LYRICS, type LyricsQuery } from "./lrclib";

/**
 * Lyrics from Spicy Lyrics (https://developers.spicylyrics.org).
 *
 * The service looks songs up by Spotify track id, so it can only answer for a song playing on Spotify.
 * It needs a secret key, which is kept in SPICYLYRICS_API_KEY and never sent to the browser.
 */
const BASE = "https://api.spicylyrics.org/v1/lyrics";

interface Syllable { Text?: string; StartTime?: number; EndTime?: number; IsPartOfWord?: boolean }
interface Line { Syllables?: Syllable[]; StartTime?: number; EndTime?: number; Text?: string }
interface Reply {
  Body?: { Type?: string; StartTime?: number; EndTime?: number; Content?: Array<{ Lead?: Line }> };
}

export const spicyReady = (): boolean => Boolean(config.spicyKey);

const lineText = (l: Line): string => {
  if (!l.Syllables?.length) return (l.Text ?? "").trim();
  return l.Syllables.map((s, i) => (s.Text ?? "") + (s.IsPartOfWord || i === l.Syllables!.length - 1 ? "" : " ")).join("").replace(/\s+/g, " ").trim();
};

export async function findSpicyLyrics(q: LyricsQuery): Promise<Lyrics | null> {
  if (!config.spicyKey || !q.spotifyId || !/^[A-Za-z0-9]{22}$/.test(q.spotifyId)) return null;
  const res = await fetch(`${BASE}/${q.spotifyId}`, {
    headers: { Authorization: `Bearer ${config.spicyKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Spicy Lyrics answered ${res.status}`);
  const body = ((await res.json()) as Reply).Body;
  const content = body?.Content ?? [];
  if (!body || !content.length) return null;

  const rows = content.map(c => c.Lead).filter((l): l is Line => Boolean(l));
  const texts = rows.map(lineText);
  const plain = texts.filter(Boolean).join("\n");
  if (body.Type === "Static" || rows.every(r => typeof r.StartTime !== "number")) {
    return plain ? { status: "plain", lines: [], plain, source: "spicy" } : null;
  }
  // The times are not documented as seconds or milliseconds. A song is never hours long, so a huge number means milliseconds.
  const longest = Math.max(...rows.map(r => r.EndTime ?? r.StartTime ?? 0));
  const k = (q.duration && longest > q.duration * 20) || longest > 20_000 ? 0.001 : 1;
  const lines: LyricLine[] = [];
  rows.forEach((r, i) => { if (texts[i]) lines.push({ t: (r.StartTime ?? 0) * k, text: texts[i]! }); });
  lines.sort((a, b) => a.t - b.t);
  return lines.length ? { status: "synced", lines, plain, source: "spicy" } : null;
}

export { NO_LYRICS };
