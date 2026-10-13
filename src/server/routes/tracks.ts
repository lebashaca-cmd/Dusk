import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Request } from "express";
import { Router } from "express";
import { LIMITS } from "../../shared/constants";
import { db, userDir, type TrackRecord } from "../db";
import { asyncHandler, currentUser, HttpError } from "../http";
import { toTrack } from "../mappers";
import { rateLimit } from "../rateLimit";
import { requireAuth } from "../session";
import { audioUpload, imageUpload } from "../uploads";
import { imageMime, looksLikeMp3, readAudio } from "../services/audio";
import { extForMime, findItunesCover, type CoverImage } from "../services/cover";
import { findLyrics, NO_LYRICS } from "../services/lrclib";
import { cleanText } from "../validation";

export const tracksRouter = Router();
tracksRouter.use(requireAuth);

function ownTrack(req: Request): TrackRecord {
  const user = currentUser(req);
  const track = db.track(String(req.params.id));
  if (!track || track.userId !== user.id) throw new HttpError(404, "Song not found.");
  return track;
}

async function saveCover(track: TrackRecord, cover: CoverImage, source: TrackRecord["coverSource"]): Promise<void> {
  const dir = userDir(track.userId);
  const name = `${track.id}.cover.${extForMime(cover.mime)}`;
  if (track.coverFile && track.coverFile !== name) await fs.rm(path.join(dir, track.coverFile), { force: true });
  await fs.writeFile(path.join(dir, name), cover.data);
  track.coverFile = name;
  track.coverMime = cover.mime;
  track.coverSource = source;
}

/** Add a song: an MP3 plus its name and artist. Lyrics and a cover are looked up for it. */
tracksRouter.post("/", rateLimit(60_000, 20), audioUpload.single("file"), asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const file = req.file;
  if (!file) throw new HttpError(400, "Choose an MP3 file.");
  const discard = () => fs.rm(file.path, { force: true });

  if (db.tracksOf(user.id).length >= LIMITS.tracks) {
    await discard();
    throw new HttpError(400, `You can add up to ${LIMITS.tracks} songs. Delete one to make room.`);
  }
  if (!(await looksLikeMp3(file.path))) {
    await discard();
    throw new HttpError(400, "That file isn't an MP3.");
  }
  const info = await readAudio(file.path).catch(() => null);
  if (!info) { await discard(); throw new HttpError(400, "Couldn't read that MP3. Is it damaged?"); }

  const body = req.body as { title?: unknown; artist?: unknown };
  const title = cleanText(body.title, 120) || cleanText(info.title, 120);
  const artist = cleanText(body.artist, 120) || cleanText(info.artist, 120);
  if (!title || !artist) {
    await discard();
    throw new HttpError(400, "Enter the song name and the artist.");
  }

  const id = crypto.randomBytes(8).toString("hex");
  const audioFile = `${id}.mp3`;
  await fs.rename(file.path, path.join(userDir(user.id), audioFile));

  const now = Date.now();
  const existing = db.tracksOf(user.id);
  const record: TrackRecord = {
    id, userId: user.id, title, artist, album: cleanText(info.album, 120), duration: info.duration,
    audioFile, coverFile: null, coverMime: null, coverSource: "none", lyrics: NO_LYRICS,
    order: (existing.at(-1)?.order ?? 0) + 1, updatedAt: now, createdAt: now,
  };

  // Lyrics and cover are independent, so look both up at once. Either can fail without losing the song.
  const [lyrics, itunes] = await Promise.all([
    findLyrics({ title, artist, album: record.album, duration: info.duration }).catch(() => NO_LYRICS),
    info.embeddedCover ? Promise.resolve(null) : findItunesCover(title, artist).catch(() => null),
  ]);
  record.lyrics = lyrics;
  if (info.embeddedCover) await saveCover(record, info.embeddedCover, "embedded");
  else if (itunes) await saveCover(record, itunes, "itunes");

  db.addTrack(record);
  res.status(201).json(toTrack(record));
}));

/** Change the name or artist, then look the lyrics (and a missing cover) up again. */
tracksRouter.post("/:id/lookup", rateLimit(60_000, 30), asyncHandler(async (req, res) => {
  const track = ownTrack(req);
  const body = req.body as { title?: unknown; artist?: unknown };
  const title = cleanText(body.title, 120) || track.title;
  const artist = cleanText(body.artist, 120) || track.artist;
  track.title = title;
  track.artist = artist;

  const [lyrics, itunes] = await Promise.all([
    findLyrics({ title, artist, album: track.album, duration: track.duration }).catch(() => null),
    track.coverSource === "none" || track.coverSource === "itunes" ? findItunesCover(title, artist).catch(() => null) : Promise.resolve(null),
  ]);
  if (lyrics) track.lyrics = lyrics;
  if (itunes) await saveCover(track, itunes, "itunes");
  track.updatedAt = Date.now();
  db.save();
  res.json(toTrack(track));
}));

/** Use your own cover instead. */
tracksRouter.post("/:id/cover", imageUpload.single("file"), asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, "Choose an image.");
  let track: TrackRecord;
  try { track = ownTrack(req); } catch (e) { await fs.rm(file.path, { force: true }); throw e; }
  const mime = await imageMime(file.path);
  if (!mime) { await fs.rm(file.path, { force: true }); throw new HttpError(400, "Use a JPEG, PNG or WebP image."); }
  const data = await fs.readFile(file.path);
  await fs.rm(file.path, { force: true });
  await saveCover(track, { data, mime }, "upload");
  track.updatedAt = Date.now();
  db.save();
  res.json(toTrack(track));
}));

tracksRouter.put("/order", (req, res) => {
  const user = currentUser(req);
  const ids = (req.body as { ids?: unknown }).ids;
  if (!Array.isArray(ids) || ids.some(i => typeof i !== "string")) throw new HttpError(400, "Send the song ids in the new order.");
  const mine = db.tracksOf(user.id);
  const known = new Set(mine.map(t => t.id));
  const ordered = (ids as string[]).filter(i => known.has(i));
  if (ordered.length !== mine.length) throw new HttpError(400, "That order doesn't match your songs.");
  ordered.forEach((id, i) => { const t = db.track(id); if (t) t.order = i + 1; });
  db.save();
  res.json(db.tracksOf(user.id).map(toTrack));
});

tracksRouter.delete("/:id", asyncHandler(async (req, res) => {
  const track = ownTrack(req);
  const dir = userDir(track.userId);
  await fs.rm(path.join(dir, track.audioFile), { force: true });
  if (track.coverFile) await fs.rm(path.join(dir, track.coverFile), { force: true });
  db.removeTrack(track.id);
  res.status(204).end();
}));
