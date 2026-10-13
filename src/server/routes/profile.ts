import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { guildConfigured } from "../config";
import { memberRoles } from "../services/guild";
import { rateLimit } from "../rateLimit";
import { checkUsernameFormat, cleanUsername, USERNAME_HELP } from "../../shared/url";
import { db, userDir } from "../db";
import { asyncHandler, currentUser, HttpError } from "../http";
import { toMe } from "../mappers";
import { endSession, requireAuth } from "../session";
import { dropFile, pushFile } from "../storage";
import { imageUpload } from "../uploads";
import { imageMime } from "../services/audio";
import { extForMime } from "../services/cover";
import { parseProfile } from "../validation";

export const profileRouter = Router();

/** Re-read the person's roles from the Discord server. A failure keeps the roles we already have. */
async function refreshRoles(user: ReturnType<typeof currentUser>): Promise<void> {
  if (!guildConfigured || user.id.startsWith("dev-")) return;
  try {
    const roles = await memberRoles(user.id);
    user.roles = roles ?? [];
    user.rolesAt = Date.now();
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
  user.profile = parsed.value;
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
