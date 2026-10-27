import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { guildConfigured } from "../config";
import { memberRoles } from "../services/guild";
import { rateLimit } from "../rateLimit";
import { checkUsernameFormat, cleanUsername, USERNAME_HELP } from "../../shared/url";
import type { Insights } from "../../shared/types";
import { db, ownerOf, userDir, type UserRecord } from "../db";
import { asyncHandler, currentUser, HttpError } from "../http";
import { toMe } from "../mappers";
import { endSession, requireAuth } from "../session";
import { dropFile, pushFile } from "../storage";
import { imageUpload, mediaUpload } from "../uploads";
import { imageMime, mediaType } from "../services/audio";
import { extForMime } from "../services/cover";
import { parseProfile } from "../validation";
import { LIMITS, limitProfile } from "../../shared/constants";
import { isVip } from "../pages";
import { coverAllowed, downloadCover, searchGames, searchMusic } from "../services/covers";

export const profileRouter = Router();

/** Re-read the person's roles from the Discord server. A failure keeps the roles we already have. */
async function refreshRoles(user: ReturnType<typeof currentUser>): Promise<void> {
  const owner = ownerOf(user);
  if (!guildConfigured || owner.startsWith("dev-") || !/^\d{15,25}$/.test(owner)) return;
  try {
    const roles = await memberRoles(owner);
    for (const page of db.pagesOf(owner)) { page.roles = roles ?? []; page.rolesAt = Date.now(); }
    db.save();
  } catch (e) {
    console.error("Role refresh failed:", e);
  }
}

profileRouter.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const user = currentUser(req);
  if (Date.now() - user.rolesAt > 5 * 60_000) await refreshRoles(user);
  res.json(toMe(user));
}));

profileRouter.post("/roles/refresh", requireAuth, rateLimit(60_000, 6), asyncHandler(async (req, res) => {
  const user = currentUser(req);
  await refreshRoles(user);
  res.json(toMe(user));
}));

profileRouter.put("/profile", requireAuth, (req, res) => {
  const user = currentUser(req);
  const parsed = parseProfile(req.body);
  if (!parsed.ok) throw new HttpError(400, parsed.error);
  user.profile = limitProfile(parsed.value, isVip(user));
  db.save();
  res.json(user.profile);
});

profileRouter.put("/username", requireAuth, (req, res) => {
  const user = currentUser(req);
  const wanted = cleanUsername(String((req.body as { username?: unknown })?.username ?? ""));
  const problem = checkUsernameFormat(wanted);
  if (problem === "format") throw new HttpError(400, USERNAME_HELP);
  if (problem === "reserved") throw new HttpError(400, "That name is reserved. Try another.");
  if (db.usernameTaken(wanted, user.id)) throw new HttpError(409, "That username is taken.");
  if (wanted !== user.username) db.rename(user, wanted);
  res.json({ username: user.username });
});

/** A custom profile picture. The web app crops it square and shrinks it before uploading. */
profileRouter.post("/avatar", requireAuth, imageUpload.single("file"), asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const file = req.file;
  if (!file) throw new HttpError(400, "Choose an image.");
  const mime = await imageMime(file.path);
  if (!mime) { await fs.rm(file.path, { force: true }); throw new HttpError(400, "Use a JPEG, PNG or WebP image."); }
  const name = `avatar.${extForMime(mime)}`;
  if (user.avatarFile && user.avatarFile !== name) { await fs.rm(path.join(userDir(user.id), user.avatarFile), { force: true }); await dropFile(user.id, user.avatarFile); }
  await fs.rename(file.path, path.join(userDir(user.id), name));
  await pushFile(user.id, name);
  user.avatarFile = name;
  user.avatarMime = mime;
  user.avatarVersion += 1;
  db.save();
  res.json(toMe(user));
}));

/** A picture or a short video for a page: a background, or an image piece. Returns the address to use. */
profileRouter.post("/media", requireAuth, rateLimit(60_000, 20), mediaUpload.single("file"), asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const file = req.file;
  if (!file) throw new HttpError(400, "Choose a picture or a video.");
  const kind = await mediaType(file.path);
  if (!kind) { await fs.rm(file.path, { force: true }); throw new HttpError(400, "Use a JPEG, PNG, WebP or GIF picture, or an MP4, WebM or OGG video."); }
  if (!kind.video && file.size > LIMITS.mediaImageBytes) { await fs.rm(file.path, { force: true }); throw new HttpError(400, `Pictures can be up to ${Math.round(LIMITS.mediaImageBytes / 1048576)} MB.`); }
  const name = `m-${crypto.randomBytes(8).toString("hex")}.${kind.ext}`;
  await fs.rename(file.path, path.join(userDir(user.id), name));
  await pushFile(user.id, name);
  await pruneMedia(user, name);
  res.json({ url: `/media/file/${user.id}/${name}`, video: kind.video });
}));

/** Looks up covers for the games and music lists on the page board. */
profileRouter.get("/covers", requireAuth, rateLimit(60_000, 30), asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? "").trim().slice(0, 80);
  if (q.length < 2) { res.json({ results: [] }); return; }
  const results = String(req.query.kind) === "music" ? await searchMusic(q).catch(() => []) : await searchGames(q).catch(() => []);
  res.json({ results });
}));

/** Keeps a cover that was found: it is copied into the person's own uploads, so the page never depends on someone else's server. */
profileRouter.post("/covers/save", requireAuth, rateLimit(60_000, 30), asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const url = String((req.body as { url?: unknown })?.url ?? "");
  if (!coverAllowed(url)) throw new HttpError(400, "That cover can't be used.");
  const data = await downloadCover(url);
  if (!data) throw new HttpError(502, "The cover could not be fetched. Try another one, or add a picture of your own.");
  const tmp = path.join(userDir(user.id), `tmp-${crypto.randomBytes(6).toString("hex")}`);
  await fs.writeFile(tmp, data);
  const kind = await mediaType(tmp);
  if (!kind || kind.video) { await fs.rm(tmp, { force: true }); throw new HttpError(400, "That is not a picture."); }
  const name = `m-${crypto.randomBytes(8).toString("hex")}.${kind.ext}`;
  await fs.rename(tmp, path.join(userDir(user.id), name));
  await pushFile(user.id, name);
  res.json({ url: `/media/file/${user.id}/${name}` });
}));

/** Uploaded pictures and videos nothing on the page uses any more are removed, unless they are only minutes old. */
async function pruneMedia(user: UserRecord, keep: string): Promise<void> {
  const dir = userDir(user.id);
  const used = JSON.stringify(user.profile);
  for (const f of await fs.readdir(dir)) {
    if (!/^m-[a-f0-9]{16}\.[a-z0-9]+$/.test(f) || f === keep || used.includes(f)) continue;
    const age = Date.now() - (await fs.stat(path.join(dir, f))).mtimeMs;
    if (age < 10 * 60_000) continue;
    await fs.rm(path.join(dir, f), { force: true });
    await dropFile(user.id, f);
  }
}

profileRouter.delete("/avatar", requireAuth, asyncHandler(async (req, res) => {
  const user = currentUser(req);
  if (user.avatarFile) { await fs.rm(path.join(userDir(user.id), user.avatarFile), { force: true }); await dropFile(user.id, user.avatarFile); }
  user.avatarFile = null;
  user.avatarMime = null;
  user.avatarVersion += 1;
  if (user.profile.avatar.kind === "image") user.profile.avatar.kind = "discord";
  db.save();
  res.json(toMe(user));
}));

profileRouter.post("/logout", (req, res) => {
  endSession(req, res);
  res.status(204).end();
});

/** How the page has been doing: views per day for a month, and which links people actually open. */
profileRouter.get("/insights", requireAuth, (req, res) => {
  const user = currentUser(req);
  const days: Insights["days"] = [];
  const now = new Date();
  for (let back = 29; back >= 0; back--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({ day: key, count: user.viewsByDay?.[key] ?? 0 });
  }
  const counts = user.clicks ?? {};
  const clicks = user.profile.links
    .map(l => ({ id: l.id, label: l.label || l.url || "Link", count: counts[l.id] ?? 0 }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);
  const clicksTotal = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const body: Insights = { views: user.views, days, clicks, clicksTotal };
  res.json(body);
});
