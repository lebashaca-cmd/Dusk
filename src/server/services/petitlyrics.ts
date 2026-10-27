import type { Lyrics } from "../../shared/types";
import type { LyricsQuery } from "./lrclib";

/**
 * Lyrics from PetitLyrics (https://petitlyrics.com), a Japanese lyrics site.
 *
 * It has no public API, so this does what the site's own page does: search for the song, read the page's
 * token, and ask for the words of the first match. What comes back is plain text without timings. It is
 * strongest for Japanese songs. If the site changes, the lookup fails quietly and LRCLIB is used instead.
 */
const SITE = "https://petitlyrics.com";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  "Accept-Language": "ja,en;q=0.8",
};

const get = async (url: string): Promise<string> => {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`PetitLyrics answered ${res.status}`);
  return res.text();
};

export async function findPetitLyrics(q: LyricsQuery): Promise<Lyrics | null> {
  const found = await get(`${SITE}/search_lyrics?${new URLSearchParams({ title: q.title, artist: q.artist, album: q.album ?? "" })}`);
  const list = found.slice(Math.max(0, found.indexOf('id="lyrics_list"')));
  const id = list.match(/\/lyrics\/(\d+)/)?.[1];
  if (!id) return null;
  const script = await get(`${SITE}/lib/pl-lib.js`);
  const token = script.match(/'X-CSRF-Token',\s*'([^']+)'/)?.[1];
  if (!token) return null;
  const res = await fetch(`${SITE}/com/get_lyrics.ajax`, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest", "X-CSRF-Token": token, Referer: `${SITE}/lyrics/${id}` },
    body: new URLSearchParams({ lyrics_id: id }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const rows = [...(await res.text()).matchAll(/"lyrics"\s*:\s*"([^"]*)"/g)].map(m => Buffer.from((m[1] ?? "").replace(/\\\//g, "/"), "base64").toString("utf8").replace(/[\r\n]+$/, ""));
  const plain = rows.join("\n").trim();
  return plain ? { status: "plain", lines: [], plain, source: "petit" } : null;
}
