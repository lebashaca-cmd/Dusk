import path from "node:path";
import { Router } from "express";
import { checkUsernameFormat, cleanUsername, USERNAME_HELP } from "../../shared/url";
import { LYRIC_PROVIDERS, type LyricProvider, type SiteConfig, type SiteStats, type UsernameCheck } from "../../shared/types";
import { ensureLocal } from "../storage";
import { db, userDir } from "../db";
import { HttpError, asyncHandler } from "../http";
import { toPublic } from "../mappers";
import { rateLimit } from "../rateLimit";
import { parseCookies } from "../session";
import { checkIn, onlineCount } from "../services/online";
import { findLyricsForCached } from "../services/lyrics";
import { config, guildConfigured } from "../config";

/** JSON endpoints anyone can call: public profiles, username checks, lyrics lookups. */
export const publicRouter = Router();

publicRouter.get("/config", (_req, res) => {
  const body: SiteConfig = { guildRequired: guildConfigured, inviteUrl: config.discord.inviteUrl || null, creditUrl: config.discord.creditUrl || null };
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
    db.recordView(user);
    res.cookie(cookieName, "1", { maxAge: 12 * 60 * 60 * 1000, sameSite: "lax", secure: config.secureCookies, path: "/" });
  }
  res.json({ views: user.views });
});

/** Counts one open of one link, so the owner can see which of their links people actually use. */
publicRouter.post("/public/:username/click", rateLimit(60_000, 120), (req, res) => {
  const user = db.userByName(cleanUsername(String(req.params.username)));
  if (!user) throw new HttpError(404, "No page lives at that username.");
  const id = String((req.body as { id?: unknown } | undefined)?.id ?? "").slice(0, 40);
  // Only count a link that is actually on the page.
  if (/^[a-z0-9_-]{4,40}$/i.test(id) && user.profile.links.some(l => l.id === id)) db.recordClick(user, id);
  res.json({ ok: true });
});

const xml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A small picture of the page, for a README or a message. */
publicRouter.get("/public/:username/badge.svg", (req, res) => {
  const user = db.userByName(cleanUsername(String(req.params.username)));
  if (!user) throw new HttpError(404, "No page lives at that username.");
  const p = user.profile;
  const c = p.colors;
  const name = (p.name || user.username).slice(0, 28);
  const views = `${user.views} view${user.views === 1 ? "" : "s"}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80" viewBox="0 0 320 80" role="img" aria-label="${xml(name)} on dusk">
  <defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${xml(c.bg)}"/><stop offset="1" stop-color="${xml(c.bg2)}"/></linearGradient></defs>
  <rect width="320" height="80" rx="16" fill="url(#b)" stroke="${xml(c.accent)}" stroke-opacity=".45"/>
  <path d="M28 50a12 12 0 0 1 24 0z" fill="${xml(c.accent)}" opacity=".45"/>
  <path d="M28 50h24" stroke="${xml(c.accent)}" stroke-width="2" stroke-linecap="round" fill="none"/>
  <circle cx="40" cy="39" r="5" fill="none" stroke="${xml(c.accent)}" stroke-width="2"/>
  <text x="68" y="37" font-family="Inter,Segoe UI,sans-serif" font-size="18" font-weight="700" fill="${xml(c.text)}">${xml(name)}</text>
  <text x="68" y="57" font-family="Inter,Segoe UI,sans-serif" font-size="13" fill="${xml(c.dim)}">@${xml(user.username)} &#183; ${xml(views)}</text>
</svg>`;
  res.type("image/svg+xml").set("Cache-Control", "public, max-age=300").send(svg);
});

/** Lyrics for a song playing on Spotify, found the same way as for uploaded songs. */
publicRouter.get("/lyrics", rateLimit(60_000, 40), asyncHandler(async (req, res) => {
  const title = String(req.query.title ?? "").slice(0, 150);
  const artist = String(req.query.artist ?? "").slice(0, 150);
  if (!title) throw new HttpError(400, "Send a song title.");
  const album = String(req.query.album ?? "").slice(0, 150);
  const duration = Number(req.query.duration);
  // The page asks for the service its owner picked, when it says which one.
  const wanted = String(req.query.provider ?? "").slice(0, 20);
  const provider = LYRIC_PROVIDERS.includes(wanted as LyricProvider) ? (wanted as LyricProvider) : "lrclib";
  const lyrics = await findLyricsForCached(provider, { title, artist, album, duration: Number.isFinite(duration) && duration > 0 ? duration : undefined });
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
