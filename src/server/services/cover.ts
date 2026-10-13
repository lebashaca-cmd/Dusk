/**
 * LRCLIB only has lyrics, so song covers come from two places:
 * the artwork embedded in the MP3 itself, or a lookup on the iTunes Search API.
 */

export interface CoverImage {
  data: Buffer;
  mime: string;
}

const MAX_BYTES = 5 * 1024 * 1024;

interface ItunesResult {
  trackName?: string;
  artistName?: string;
  artworkUrl100?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function findItunesCover(title: string, artist: string): Promise<CoverImage | null> {
  const params = new URLSearchParams({ term: `${artist} ${title}`.trim(), media: "music", entity: "song", limit: "8" });
  const res = await fetch(`https://itunes.apple.com/search?${params}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  const json = (await res.json()) as { results?: ItunesResult[] };
  const wantTitle = norm(title);
  const wantArtist = norm(artist);
  const hit = (json.results ?? []).find(r => {
    if (!r.artworkUrl100) return false;
    const t = norm(r.trackName ?? "");
    const a = norm(r.artistName ?? "");
    return (t.includes(wantTitle) || wantTitle.includes(t)) && (!wantArtist || a.includes(wantArtist) || wantArtist.includes(a));
  });
  if (!hit?.artworkUrl100) return null;
  const big = hit.artworkUrl100.replace(/\/\d+x\d+bb\./, "/600x600bb.");
  const img = await fetch(big, { signal: AbortSignal.timeout(10_000) });
  const mime = img.headers.get("content-type") ?? "";
  if (!img.ok || !mime.startsWith("image/")) return null;
  const data = Buffer.from(await img.arrayBuffer());
  if (data.length > MAX_BYTES) return null;
  return { data, mime };
}

export function extForMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}
