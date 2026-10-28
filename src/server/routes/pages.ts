import { Router } from "express";
import { defaultProfile } from "../../shared/constants";
import { checkUsernameFormat, cleanUsername, USERNAME_HELP } from "../../shared/url";
import crypto from "node:crypto";
import { multiPage } from "../config";
import { db, ownerOf, type UserRecord } from "../db";
import { asyncHandler, currentUser, HttpError } from "../http";
import { toMe } from "../mappers";
import { canHaveManyPages, deletePage } from "../pages";
import { rateLimit } from "../rateLimit";
import { endSession, requireAuth, setActivePage } from "../session";

export const pagesRouter = Router();
pagesRouter.use(requireAuth);

/** Make a new, empty page. Only owners and devs may have more than one. */
pagesRouter.post("/", rateLimit(60_000, 10), (req, res) => {
  const current = currentUser(req);
  const owner = ownerOf(current);
  if (!canHaveManyPages(current)) throw new HttpError(403, "Only owners and devs can create more than one page.");
  if (db.pagesOf(owner).length >= multiPage.max) throw new HttpError(400, `You can have up to ${multiPage.max} pages.`);

  const wanted = cleanUsername(String((req.body as { username?: unknown })?.username ?? ""));
  const problem = checkUsernameFormat(wanted);
  if (problem === "format") throw new HttpError(400, USERNAME_HELP);
  if (problem === "reserved") throw new HttpError(400, "That name is reserved. Try another.");
  if (db.usernameTaken(wanted)) throw new HttpError(409, "That username is taken.");

  const page: UserRecord = {
    id: `${owner}-${crypto.randomBytes(4).toString("hex")}`,
    ownerId: owner,
    username: wanted,
    discordName: current.discordName,
    discordHandle: current.discordHandle,
    discordBanner: current.discordBanner,
    discordAccent: current.discordAccent,
    discordServerTag: current.discordServerTag,
    discordServerId: current.discordServerId,
    discordServerBadge: current.discordServerBadge,
    discordAvatar: current.discordAvatar,
    profile: defaultProfile(current.discordName),
    roles: current.roles,
    rolesAt: current.rolesAt,
    avatarFile: null,
    avatarMime: null,
    avatarVersion: 0,
    views: 0,
    createdAt: Date.now(),
  };
  db.addUser(page);
  setActivePage(res, page.id);
  res.json(toMe(page));
});

/** Choose which of your pages the dashboard edits. */
pagesRouter.put("/active", (req, res) => {
  const owner = ownerOf(currentUser(req));
  const id = String((req.body as { id?: unknown })?.id ?? "");
  const page = db.pagesOf(owner).find(p => p.id === id);
  if (!page) throw new HttpError(404, "Page not found.");
  setActivePage(res, page.id);
  res.json(toMe(page));
});

/** Delete one of your pages for good, with its songs and files. Deleting your last page ends your account and logs you out. */
pagesRouter.delete("/:id", asyncHandler(async (req, res) => {
  const owner = ownerOf(currentUser(req));
  const page = db.pagesOf(owner).find(p => p.id === String(req.params.id));
  if (!page) throw new HttpError(404, "Page not found.");
  await deletePage(page);
  const left = db.pagesOf(owner);
  if (!left.length) {
    endSession(req, res);
    res.json({ loggedOut: true });
    return;
  }
  setActivePage(res, left[0]!.id);
  res.json({ loggedOut: false });
}));
