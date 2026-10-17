import crypto from "node:crypto";
import { Router, type RequestHandler } from "express";
import { config } from "../config";
import { db } from "../db";
import { resetPage } from "../pages";
import { HttpError, asyncHandler } from "../http";
import { rateLimit } from "../rateLimit";
import { signupEntry } from "../services/signuplog";

/* Used by the Discord bot's /dusklogs command. Protected by DUSK_ADMIN_TOKEN, a bearer token, and off when it is not set. */

const token = process.env.DUSK_ADMIN_TOKEN ?? "";
export const adminEnabled = token.length >= 24;

const requireAdmin: RequestHandler = (req, _res, next) => {
  const given = Buffer.from((req.headers.authorization ?? "").replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(token);
  if (!adminEnabled || given.length !== want.length || !crypto.timingSafeEqual(given, want)) throw new HttpError(401, "Not allowed.");
  next();
};

export const adminRouter = Router();
adminRouter.use(rateLimit(60_000, 60), requireAdmin);

adminRouter.get("/logs", (_req, res) => {
  res.json({ channelId: db.logChannel(), total: db.counts().users });
});

adminRouter.put("/logs", (req, res) => {
  const id = (req.body as { channelId?: unknown }).channelId;
  if (id !== null && !(typeof id === "string" && /^\d{15,25}$/.test(id))) throw new HttpError(400, "Send a channel id, or null to turn logging off.");
  db.setLogChannel(id as string | null);
  res.json({ channelId: db.logChannel() });
});

adminRouter.get("/signups", (req, res) => {
  const limit = Math.min(25, Math.max(1, Number(req.query.limit) || 10));
  res.json(db.recentSignups(limit).map(signupEntry));
});

/* ---------- account reset (the bot's /duskreset command) ---------- */

/** What the website knows about an account, for the security message the bot sends. */
function accountDetails(discordId: string) {
  const pages = db.pagesOf(discordId);
  const first = pages[0];
  if (!first) return null;
  const latest = pages.reduce((a, b) => ((b.lastLoginAt ?? 0) > (a.lastLoginAt ?? 0) ? b : a), first);
  return {
    discordId,
    discordUsername: first.discordHandle ?? first.discordName,
    createdAt: new Date(first.createdAt).toISOString(),
    signupIp: first.signupIp ?? null,
    lastLoginIp: latest.lastLoginIp ?? null,
    lastLoginAt: latest.lastLoginAt ? new Date(latest.lastLoginAt).toISOString() : null,
    pages: pages.map(p => ({ username: p.username, links: p.profile.links.length, songs: db.tracksOf(p.id).length, listed: Boolean(p.listed) })),
  };
}

const isDiscordId = (id: string): boolean => /^\d{15,25}$/.test(id) || (config.devLogin && /^dev-[a-z0-9_]+$/.test(id));

adminRouter.get("/accounts/:discordId", (req, res) => {
  const id = String(req.params.discordId);
  const details = isDiscordId(id) ? accountDetails(id) : null;
  if (!details) throw new HttpError(404, "No dusk account is connected to that Discord account.");
  res.json(details);
});

/** Reset every page on the account to its starting state and log it out everywhere. Returns the details for the DM. */
adminRouter.post("/accounts/:discordId/reset", rateLimit(60_000, 10), asyncHandler(async (req, res) => {
  const id = String(req.params.discordId);
  const before = isDiscordId(id) ? accountDetails(id) : null;
  if (!before) throw new HttpError(404, "No dusk account is connected to that Discord account.");
  let songs = 0;
  let links = 0;
  for (const page of db.pagesOf(id)) {
    const s = await resetPage(page);
    songs += s.songs;
    links += s.links;
  }
  const loggedOut = db.removeSessionsOf(id);
  console.log(`Account reset for ${id}: ${songs} songs, ${links} links, ${loggedOut} sessions.`);
  res.json({ ...before, reset: { pages: before.pages.length, songs, links, loggedOutSessions: loggedOut, at: new Date().toISOString() } });
}));
