import type { Lyrics } from "../../shared/types";
import { lyrics as config } from "../config";
import { parseLrc, type LyricsQuery } from "./lrclib";

/**
 * Lyrics from Musixmatch's official API (https://developer.musixmatch.com), using the key in MUSIXMATCH_API_KEY.
 *
 * Timed lyrics (`matcher.subtitle.get`) are only given to accounts whose plan includes them. When the
 * account does not have them, the plain words are used. Free accounts get a shortened version of the
 * plain words from Musixmatch, which is their rule and not something this site can change.
 */
const BASE = "https://api.musixmatch.com/ws/1.1";

interface Envelope<T> { message?: { header?: { status_code?: number }; body?: T } }

export const musixmatchReady = (): boolean => Boolean(config.musixmatchKey);

async function call<T>(method: string, params: Record<string, string>): Promise<T | null> {
  const url = `${BASE}/${method}?${new URLSearchParams({ ...params, apikey: config.musixmatchKey, format: "json" })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  const json = (await res.json()) as Envelope<T>;
  // Musixmatch answers 200 on the HTTP level and puts the real result in the header.
  if (json.message?.header?.status_code !== 200) return null;
  return json.message.body ?? null;
}

export async function findMusixmatchLyrics(q: LyricsQuery): Promise<Lyrics | null> {
  if (!config.musixmatchKey) return null;
  const who = { q_track: q.title, q_artist: q.artist };
  const timed = await call<{ subtitle?: { subtitle_body?: string } }>("matcher.subtitle.get", {
    ...who, subtitle_format: "lrc", ...(q.duration ? { f_subtitle_length: String(Math.round(q.duration)), f_subtitle_length_max_deviation: "4" } : {}),
  }).catch(() => null);
  const lrc = timed?.subtitle?.subtitle_body;
  if (lrc) {
    const lines = parseLrc(lrc);
    if (lines.length) return { status: "synced", lines, plain: lines.map(l => l.text).join("\n"), source: "musixmatch" };
  }
  const plainBody = await call<{ lyrics?: { lyrics_body?: string; instrumental?: number } }>("matcher.lyrics.get", who).catch(() => null);
  if (plainBody?.lyrics?.instrumental) return { status: "instrumental", lines: [], plain: "", source: "musixmatch" };
  // The plain text ends with a note about the rest of the song and a tracking line; neither is part of the words.
  const text = (plainBody?.lyrics?.lyrics_body ?? "").split(/\n\*{3,}/)[0]!.trim();
  return text ? { status: "plain", lines: [], plain: text, source: "musixmatch" } : null;
}
