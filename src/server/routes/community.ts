import crypto from "node:crypto";
import { Router } from "express";
import { applyStyle, pickStyle } from "../../shared/constants";
import type { CommunityMe, CommunityProfile, CommunityTemplate } from "../../shared/types";
import { db, ownerOf, type TemplateRecord, type UserRecord } from "../db";
import { asyncHandler, currentUser, HttpError } from "../http";
import { customAvatarUrl, toMe } from "../mappers";
import { rateLimit } from "../rateLimit";
import { requireAuth } from "../session";
import { cleanText, parseProfile } from "../validation";
import { discordAvatarUrl } from "../services/discord";

export const communityRouter = Router();

const MAX_TEMPLATES_PER_PERSON = 10;

function toCommunityProfile(u: UserRecord): CommunityProfile {
  return {
    username: u.username,
    name: u.profile.name || u.username,
    bio: u.profile.bio.replace(/\s+/g, " ").trim().slice(0, 200),
    avatarUrl: customAvatarUrl(u),
    discordAvatarUrl: discordAvatarUrl(ownerOf(u), u.discordAvatar),
    colors: u.profile.colors,
    bgType: u.profile.bgType,
    views: u.views,
  };
}

function toCommunityTemplate(t: TemplateRecord, viewer: string | undefined): CommunityTemplate {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    author: t.author,
    colors: t.style.colors,
    bgType: t.style.bgType,
    font: t.style.font,
    uses: t.uses,
    createdAt: t.createdAt,
    mine: viewer !== undefined && t.ownerId === viewer,
  };
}

/** Pages that chose to be shown here. Most viewed first. */
communityRouter.get("/profiles", (_req, res) => {
  const list = db.listedPages().sort((a, b) => b.views - a.views || b.createdAt - a.createdAt).slice(0, 60);
  res.json(list.map(toCommunityProfile));
});

communityRouter.get("/templates", (req, res) => {
  const list = db.templates().sort((a, b) => b.uses - a.uses || b.createdAt - a.createdAt).slice(0, 60);
  res.json(list.map(t => toCommunityTemplate(t, req.ownerId)));
});

/** Whether the open page is listed. */
communityRouter.get("/me", requireAuth, (req, res) => {
  const u = currentUser(req);
  const me: CommunityMe = { listed: Boolean(u.listed), hasBio: u.profile.bio.trim().length > 0 };
  res.json(me);
});

communityRouter.put("/listing", requireAuth, rateLimit(60_000, 20), (req, res) => {
  const u = currentUser(req);
  const listed = (req.body as { listed?: unknown })?.listed === true;
  if (listed && !u.profile.bio.trim()) throw new HttpError(400, "Write a bio first. The Community shows your name and your bio.");
  u.listed = listed;
  db.save();
  const me: CommunityMe = { listed, hasBio: u.profile.bio.trim().length > 0 };
  res.json(me);
});

/** Share the look of the open page as a template. Only the style is copied, never links, bio or music. */
communityRouter.post("/templates", requireAuth, rateLimit(60_000, 10), (req, res) => {
  const u = currentUser(req);
  const owner = ownerOf(u);
  const body = req.body as { name?: unknown; description?: unknown };
  const name = cleanText(body.name, 40);
  const description = cleanText(body.description, 140);
  if (name.length < 2) throw new HttpError(400, "Give the template a name (at least 2 characters).");
  if (db.templates().filter(t => t.ownerId === owner).length >= MAX_TEMPLATES_PER_PERSON) {
    throw new HttpError(400, `You can share up to ${MAX_TEMPLATES_PER_PERSON} templates. Delete one to make room.`);
  }
  const record: TemplateRecord = {
    id: crypto.randomBytes(6).toString("hex"),
    ownerId: owner,
    author: u.username,
    name,
    description,
    style: pickStyle(u.profile),
    uses: 0,
    createdAt: Date.now(),
  };
  db.addTemplate(record);
  res.json(toCommunityTemplate(record, owner));
});

communityRouter.delete("/templates/:id", requireAuth, (req, res) => {
  const t = db.template(String(req.params.id));
  if (!t || t.ownerId !== req.ownerId) throw new HttpError(404, "Template not found.");
  db.removeTemplate(t.id);
  res.status(204).end();
});

/** Put a template's look on the open page. The page's own name, bio, links and music stay. */
communityRouter.post("/templates/:id/use", requireAuth, rateLimit(60_000, 20), asyncHandler(async (req, res) => {
  const u = currentUser(req);
  const t = db.template(String(req.params.id));
  if (!t) throw new HttpError(404, "Template not found.");
  const parsed = parseProfile(applyStyle(u.profile, t.style));
  if (!parsed.ok) throw new HttpError(400, "That template can't be applied.");
  u.profile = parsed.value;
  if (t.ownerId !== ownerOf(u)) t.uses += 1;
  db.save();
  res.json(toMe(u));
}));
