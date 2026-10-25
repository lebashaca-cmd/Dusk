import fs from "node:fs/promises";
import { parseFile } from "music-metadata";
import type { CoverImage } from "./cover";

export interface AudioInfo {
  /** Seconds. */
  duration: number;
  title: string;
  artist: string;
  album: string;
  embeddedCover: CoverImage | null;
}

/** An MP3 starts with an ID3 tag or with an MPEG frame sync (11 set bits). */
export async function looksLikeMp3(file: string): Promise<boolean> {
  const handle = await fs.open(file, "r");
  try {
    const buf = Buffer.alloc(3);
    const { bytesRead } = await handle.read(buf, 0, 3, 0);
    if (bytesRead < 3) return false;
    if (buf.toString("latin1") === "ID3") return true;
    return buf[0] === 0xff && ((buf[1] ?? 0) & 0xe0) === 0xe0;
  } finally {
    await handle.close();
  }
}

export async function readAudio(file: string): Promise<AudioInfo> {
  const meta = await parseFile(file, { duration: true });
  const pic = meta.common.picture?.[0];
  return {
    duration: Math.round(meta.format.duration ?? 0),
    title: meta.common.title ?? "",
    artist: meta.common.artist ?? "",
    album: meta.common.album ?? "",
    embeddedCover: pic ? { data: Buffer.from(pic.data), mime: pic.format || "image/jpeg" } : null,
  };
}

/** A picture or a video put on a page, judged by its first bytes. Returns the type and the file ending, or null. */
export async function mediaType(file: string): Promise<{ mime: string; ext: string; video: boolean } | null> {
  const handle = await fs.open(file, "r");
  try {
    const b = Buffer.alloc(16);
    await handle.read(b, 0, 16, 0);
    if (b[0] === 0xff && b[1] === 0xd8) return { mime: "image/jpeg", ext: "jpg", video: false };
    if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png", video: false };
    if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return { mime: "image/webp", ext: "webp", video: false };
    if (b.subarray(0, 4).toString("latin1") === "GIF8") return { mime: "image/gif", ext: "gif", video: false };
    if (b.subarray(4, 8).toString("latin1") === "ftyp") return { mime: "video/mp4", ext: "mp4", video: true };
    if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { mime: "video/webm", ext: "webm", video: true };
    if (b.subarray(0, 4).toString("latin1") === "OggS") return { mime: "video/ogg", ext: "ogg", video: true };
    return null;
  } finally {
    await handle.close();
  }
}

/** Image uploads: JPEG, PNG or WebP, judged by their first bytes and not by the file name. */
export async function imageMime(file: string): Promise<string | null> {
  const handle = await fs.open(file, "r");
  try {
    const b = Buffer.alloc(12);
    await handle.read(b, 0, 12, 0);
    if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
    if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
    if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
    return null;
  } finally {
    await handle.close();
  }
}
