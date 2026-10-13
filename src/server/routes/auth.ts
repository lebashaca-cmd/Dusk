import crypto from "node:crypto";
import { Router } from "express";
import { defaultProfile } from "../../shared/constants";
import type { RoleTag } from "../../shared/types";
import { checkUsernameFormat, cleanUsername } from "../../shared/url";
import { config, discordConfigured, guildConfigured } from "../config";
import { announceSignup } from "../services/signuplog";
import { db, ownerOf, type UserRecord } from "../db";
import { asyncHandler } from "../http";
import { rateLimit } from "../rateLimit";
import { parseCookies, startSession } from "../session";
import { memberRoles } from "../services/guild";
import { authorizeUrl, exchangeCode, fetchDiscordUser, type DiscordUser } from "../services/discord";

export const authRouter = Router();
authRouter.use(rateLimit(60_000, 40));

const OAUTH_COOKIE = "dusk_oauth";

/** The name they asked for if it is free, otherwise something based on their Discord username. */
function pickUsername(wanted: string, discordUsername: string): string {
  const base = cleanUsername(discordUsername);
  for (const c of [wanted, base]) {
    if (c && !checkUsernameFormat(c) && !db.usernameTaken(c)) return c;
  }
  const stem = (base || "user").padEnd(3, "x").slice(0, 15);
  for (let i = 0; i < 50; i++) {
    const candidate = `${stem}${crypto.randomInt(100, 9999)}`;
    if (!checkUsernameFormat(candidate) && !db.usernameTaken(candidate)) return candidate;
  }
  return `user${crypto.randomBytes(4).toString("hex")}`;
}

function upsertUser(du: DiscordUser, wantedUsername: string, ip: string | undefined, roles: RoleTag[] = []): UserRecord {
  const displayName = du.global_name || du.username;
  const pages = db.pagesOf(du.id);
  if (pages.length) {
    for (const page of pages) {
      page.discordName = displayName;
      page.discordAvatar = du.avatar;
      page.discordHandle = du.username;
      page.roles = roles;
      page.rolesAt = Date.now();
    }
    db.save();
    return pages[0]!;
  }
  const user: UserRecord = {
    id: du.id,
    username: pickUsername(wantedUsername, du.username),
    discordName: displayName,
    discordAvatar: du.avatar,
    profile: defaultProfile(displayName),
    roles,
    rolesAt: Date.now(),
    avatarFile: null,
    avatarMime: null,
    avatarVersion: 0,
    views: 0,
    createdAt: Date.now(),
    discordHandle: du.username,
    signupIp: ip ?? null,
  };
  db.addUser(user);
  announceSignup(user);
  return user;
}

/** Step 1: send the visitor to Discord. `?claim=name` remembers the username they asked for. */
authRouter.get("/discord", (req, res) => {
  if (!discordConfigured) {
    res.status(503).type("text").send("Discord login is not set up on this server yet. See the README for the three settings it needs.");
    return;
  }
  const state = crypto.randomBytes(16).toString("hex");
  const claim = cleanUsername(String(req.query.claim ?? ""));
  res.cookie(OAUTH_COOKIE, JSON.stringify({ state, claim }), {
    httpOnly: true, sameSite: "lax", secure: config.secureCookies, maxAge: 10 * 60 * 1000, path: "/auth",
  });
  res.redirect(authorizeUrl(state));
});

/** Step 2: Discord sends them back with a one-time code. */
authRouter.get("/discord/callback", asyncHandler(async (req, res) => {
  const { code, state, error } = req.query;
  const raw = parseCookies(req.headers.cookie)[OAUTH_COOKIE];
  res.clearCookie(OAUTH_COOKIE, { path: "/auth" });
  if (error) { res.redirect("/?login=cancelled"); return; }

  let saved: { state?: string; claim?: string } = {};
  try { saved = raw ? JSON.parse(raw) as typeof saved : {}; } catch { /* treated as missing below */ }
  if (typeof code !== "string" || typeof state !== "string" || !saved.state || saved.state !== state) {
    res.redirect("/?login=failed");
    return;
  }

  try {
    const token = await exchangeCode(code);
    const discordUser = await fetchDiscordUser(token);
    let roles: RoleTag[] = [];
    if (guildConfigured) {
      const found = await memberRoles(discordUser.id);
      if (!found) { res.redirect("/?login=join"); return; }
      roles = found;
    }
    const user = upsertUser(discordUser, saved.claim ?? "", req.ip, roles);
    startSession(res, ownerOf(user));
    res.redirect("/dashboard");
  } catch (e) {
    console.error("Discord login failed:", e);
    res.redirect("/?login=failed");
  }
}));

/**
 * Local testing without a Discord app: logs in a throwaway test account.
 * Only exists when DEV_LOGIN=1 and the server is not in production.
 */
if (config.devLogin) {
  authRouter.get("/dev", (req, res) => {
    const name = cleanUsername(String(req.query.as ?? "")) || "tester";
    const user = upsertUser({ id: `dev-${name}`, username: name, global_name: name, avatar: null }, name, req.ip);
    startSession(res, ownerOf(user));
    res.redirect("/dashboard");
  });
}
