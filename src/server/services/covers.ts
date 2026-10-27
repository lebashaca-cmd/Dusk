/**
 * Finding the cover of a game or a song.
 *
 * Games are searched in the Steam store and songs in the iTunes catalogue. Both are public and need no key.
 * A game that is not on Steam has no cover here: the owner adds a picture of their own instead.
 */
export interface CoverHit {
  name: string;
  /** What is under the name: the kind of thing, or the artist. */
  sub?: string;
  /** The tall or square picture to use. */
  cover: string;
  /** A small picture for the list of results. */
  thumb: string;
}

const HEADERS = { "User-Agent": "Dusk/1.0 (link-in-bio)", Accept: "application/json" };

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8_000) });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

/** The tall picture Steam keeps for a game, and the wide one it has for every game. */
export const steamTall = (id: number): string => `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`;
export const steamWide = (id: number): string => `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`;

export async function searchGames(q: string): Promise<CoverHit[]> {
  const data = await getJson<{ items?: Array<{ id?: number; name?: string; tiny_image?: string; type?: string }> }>(
    `https://store.steampowered.com/api/storesearch/?${new URLSearchParams({ term: q, l: "english", cc: "US" })}`,
  );
  return (data?.items ?? [])
    .filter(i => typeof i.id === "number" && i.name)
    .slice(0, 10)
    .map(i => ({ name: i.name!, sub: "Steam", cover: steamTall(i.id!), thumb: i.tiny_image || steamWide(i.id!) }));
}

/** iTunes gives a 100 pixel picture; the same address with a bigger size gives a sharp one. */
const bigger = (url: string): string => url.replace(/\/\d+x\d+(bb)?\.(jpg|png|webp)$/i, "/600x600bb.$2");

export async function searchMusic(q: string): Promise<CoverHit[]> {
  type Row = { trackName?: string; collectionName?: string; artistName?: string; artworkUrl100?: string };
  const ask = async (entity: "song" | "album"): Promise<Row[]> =>
    (await getJson<{ results?: Row[] }>(`https://itunes.apple.com/search?${new URLSearchParams({ term: q, media: "music", entity, limit: "6" })}`).catch(() => null))?.results ?? [];
  const [songs, albums] = await Promise.all([ask("song"), ask("album")]);
  const seen = new Set<string>();
  const out: CoverHit[] = [];
  for (const [rows, label] of [[songs, "Song"], [albums, "Album"]] as const) {
    for (const r of rows) {
      const name = label === "Song" ? r.trackName : r.collectionName;
      if (!name || !r.artworkUrl100) continue;
      const key = `${name}|${r.artistName}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, sub: r.artistName ? `${r.artistName} · ${label}` : label, cover: bigger(r.artworkUrl100), thumb: r.artworkUrl100 });
    }
  }
  return out.slice(0, 10);
}

/** Only these places are fetched from: the covers the searches above point to. */
export function coverAllowed(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" || u.port) return false;
  const host = u.hostname.toLowerCase();
  return /(^|\.)steamstatic\.com$/.test(host) || host === "steamcdn-a.akamaihd.net" || /(^|\.)mzstatic\.com$/.test(host);
}

/** The picture at an allowed address, or null. A game without a tall picture gets its wide one. */
export async function downloadCover(url: string, max = 3 * 1048576): Promise<Buffer | null> {
  if (!coverAllowed(url)) return null;
  const get = async (u: string): Promise<Buffer | null> => {
    const res = await fetch(u, { headers: { "User-Agent": HEADERS["User-Agent"] }, redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length"));
    if (Number.isFinite(len) && len > max) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length <= max ? buf : null;
  };
  const first = await get(url).catch(() => null);
  if (first) return first;
  const m = url.match(/\/steam\/apps\/(\d+)\/library_600x900\.jpg$/);
  return m ? get(steamWide(Number(m[1]))).catch(() => null) : null;
}
