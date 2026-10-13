import path from "node:path";
import { Router } from "express";
import { checkUsernameFormat, cleanUsername, USERNAME_HELP } from "../../shared/url";
import type { SiteConfig, SiteStats, UsernameCheck } from "../../shared/types";
import { ensureLocal } from "../storage";
import { db, userDir } from "../db";
import { HttpError, asyncHandler } from "../http";
import { toPublic } from "../mappers";
import { rateLimit } from "../rateLimit";
import { parseCookies } from "../session";
import { checkIn, onlineCount } from "../services/online";
import { findLyricsCached } from "../services/lrclib";
import { config, guildConfigured } from "../config";

/** JSON endpoints anyone can call: public profiles, username checks, lyrics lookups. */
export const publicRouter = Router();

publicRouter.get("/config", (_req, res) => {
  const body: SiteConfig = { guildRequired: guildConfigured, inviteUrl: config.discord.inviteUrl || null };
  res.json(body);
});

publicRouter.get("/stats", rateLimit(60_000, 60), (_req, res) => {
  const body: SiteStats = { ...db.counts(), online: onlineCount() };
  res.json(body);
});

/** A browser with the site open says hello with a random id it made up. Nothing about the person is stored. */
publicRouter.post("/ping", rateLimit(60_000, 12), (req, res) => {
  const id = (req.body as { id?: unknown } | undefined)?.id;
  if (typeof id !== "string" || !/^[a-z0-9]{8,40}$/i.test(id)) throw new HttpError(400, "Bad id.");
  checkIn(id);
  res.status(204).end();
});

publicRouter.get("/username/:name", rateLimit(60_000, 60), (req, res) => {
  const name = cleanUsername(String(req.params.name));
  const problem = checkUsernameFormat(name);
  let result: UsernameCheck;
  if (problem === "format") result = { available: false, reason: USERNAME_HELP };
  else if (problem === "reserved") result = { available: false, reason: "That name is reserved. Try another." };
  else if (db.userByName(name)) result = { available: false, reason: "That username is taken." };
  else result = { available: true, reason: "" };
  res.json(result);
});

publicRouter.get("/public/:username", (req, res) => {
  const user = db.userByName(cleanUsername(String(req.params.username)));
  if (!user) throw new HttpError(404, "No page lives at that username.");
  res.json(toPublic(user));
});

/** Counts one view per visitor per profile every 12 hours. The owner's own visits are not counted. */
publicRouter.post("/public/:username/view", (req, res) => {
  const user = db.userByName(cleanUsername(String(req.params.username)));
  if (!user) throw new HttpError(404, "No page lives at that username.");
  const cookieName = `dusk_v_${user.id}`.replace(/[^A-Za-z0-9_]/g, "_");
  const seen = parseCookies(req.headers.cookie)[cookieName] === "1";
  if (!seen && req.user?.id !== user.id) {
    user.views += 1;
    db.save();
    res.cookie(cookieName, "1", { maxAge: 12 * 60 * 60 * 1000, sameSite: "lax", secure: config.secureCookies, path: "/" });
  }
  res.json({ views: user.views });
});

/** Lyrics for a song playing on Spotify, found the same way as for uploaded songs. */
publicRouter.get("/lyrics", rateLimit(60_000, 40), asyncHandler(async (req, res) => {
  const title = String(req.query.title ?? "").slice(0, 150);
  const artist = String(req.query.artist ?? "").slice(0, 150);
  if (!title) throw new HttpError(400, "Send a song title.");
  const album = String(req.query.album ?? "").slice(0, 150);
  const duration = Number(req.query.duration);
  const lyrics = await findLyricsCached({ title, artist, album, duration: Number.isFinite(duration) && duration > 0 ? duration : undefined });
  res.json(lyrics);
}));

/** Uploaded files: songs, covers and profile pictures. They are addressed by random id. */
export const mediaRouter = Router();
const ID = /^[a-f0-9]{16}$/;

mediaRouter.get("/track/:id/audio", async (req, res, next) => {
  const id = String(req.params.id);
  const track = ID.test(id) ? db.track(id) : undefined;
  if (!track) { res.sendStatus(404); return; }
  try { if (!(await ensureLocal(track.userId, track.audioFile))) { res.sendStatus(404); return; } } catch (e) { next(e); return; }
  res.type("audio/mpeg").sendFile(path.join(userDir(track.userId), track.audioFile), { maxAge: "1h", acceptRanges: true }, err => { if (err) next(err); });
});

mediaRouter.get("/track/:id/cover", async (req, res, next) => {
  const id = String(req.params.id);
  const track = ID.test(id) ? db.track(id) : undefined;
  if (!track?.coverFile) { res.sendStatus(404); return; }
  try { if (!(await ensureLocal(track.userId, track.coverFile))) { res.sendStatus(404); return; } } catch (e) { next(e); return; }
  res.type(track.coverMime ?? "image/jpeg").sendFile(path.join(userDir(track.userId), track.coverFile), { maxAge: "7d" }, err => { if (err) next(err); });
});

mediaRouter.get("/avatar/:userId", async (req, res, next) => {
  const user = db.user(String(req.params.userId));
  if (!user?.avatarFile) { res.sendStatus(404); return; }
  try { if (!(await ensureLocal(user.id, user.avatarFile))) { res.sendStatus(404); return; } } catch (e) { next(e); return; }
  res.type(user.avatarMime ?? "image/jpeg").sendFile(path.join(userDir(user.id), user.avatarFile), { maxAge: "7d" }, err => { if (err) next(err); });
});
