import type { Lyrics } from "../../shared/types";
import { lyrics as config } from "../config";
import { type LyricsQuery, parseLrc } from "./lrclib";

/**
 * Lyrics from a Polaris lyrics service.
 *
 * Polaris is self-hosted, so the server says where it is: POLARIS_LYRICS_URL for the
 * timed lyrics and POLARIS_MONO_LYRICS_URL for the plain ones. The address may hold
 * {title}, {artist}, {album} and {duration}, which are filled in with the song.
 *
 * The service may answer with JSON ({"syncedLyrics": "...", "plainLyrics": "..."}) or
 * with plain text. Text that carries timestamps is read as LRC; anything else is the
 * words of the song.
 */

const HEADERS = { "User-Agent": "Dusk/1.0 (self-hosted link-in-bio)" };

/** Is a Polaris service set up? */
export const polarisReady = (mono: boolean): boolean => Boolean(mono ? config.polarisMonoUrl || config.polarisUrl : config.polarisUrl);

function fill(template: string, q: LyricsQuery): string {
  const values: Record<string, string> = {
    title: q.title.trim(),
    artist: q.artist.trim(),
    album: (q.album ?? "").trim(),
    duration: q.duration === undefined ? "" : String(Math.round(q.duration)),
  };
  return template.replace(/\{(title|artist|album|duration)\}/g, (_m, key: string) => values[key] ?? "");
}

/** Read a Polaris answer, whatever shape it came in. */
function readLyrics(body: string, contentType: string, mono: boolean): Lyrics | null {
  if (contentType.includes("json") || body.trim().startsWith("{")) {
    let data: Record<string, unknown>;
    try { data = JSON.parse(body) as Record<string, unknown>; } catch { return null; }
    const pick = (...keys: string[]): string => {
      for (const k of keys) {
        const v = data[k];
        if (typeof v === "string" && v.trim()) return v;
      }
      return "";
    };
    const synced = pick("syncedLyrics", "synced", "lrc", "timedLyrics");
    const plain = pick("plainLyrics", "plain", "lyrics", "text", "body");
    if (!synced && !plain) return null;
    if (!mono && synced) {
      const lines = parseLrc(synced);
      if (lines.length) return { status: "synced", lines, plain, source: "polaris" };
    }
    if (plain.trim()) return { status: "plain", lines: [], plain, source: mono ? "polarisMono" : "polaris" };
    return null;
  }

  // Plain text. Timed lines mean it is LRC.
  const lines = parseLrc(body);
  if (!mono && lines.length) return { status: "synced", lines, plain: "", source: "polaris" };
  const text = body.trim();
  if (!text) return null;
  return { status: "plain", lines: [], plain: text, source: mono ? "polarisMono" : "polaris" };
}

/**
 * Ask the Polaris service for a song. Returns null when Polaris is not set up, or when
 * it had nothing for this song.
 */
export async function findPolarisLyrics(q: LyricsQuery, mono: boolean): Promise<Lyrics | null> {
  const template = mono ? config.polarisMonoUrl || config.polarisUrl : config.polarisUrl;
  if (!template) return null;
  if (!q.title.trim()) return null;

  const url = fill(template, q);
  let res: Response;
  try {
    res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12_000) });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const body = await res.text().catch(() => "");
  if (!body.trim()) return null;
  return readLyrics(body, res.headers.get("content-type") ?? "", mono);
}
