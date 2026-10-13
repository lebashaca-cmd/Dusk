import crypto from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { config } from "./config";
import { db } from "./db";

const COOKIE = "dusk_sid";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const sign = (value: string): string =>
  crypto.createHmac("sha256", config.sessionSecret).update(value).digest("base64url");

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (!key) continue;
    try { out[key] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore a broken cookie */ }
  }
  return out;
}

export function startSession(res: Response, userId: string): void {
  const id = crypto.randomBytes(24).toString("base64url");
  db.addSession({ id, userId, expires: Date.now() + MAX_AGE_MS });
  res.cookie(COOKIE, `${id}.${sign(id)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.secureCookies,
    maxAge: MAX_AGE_MS,
    path: "/",
  });
}

function sessionId(req: Request): string | null {
  const raw = parseCookies(req.headers.cookie)[COOKIE];
  if (!raw) return null;
  const [id, sig] = raw.split(".");
  if (!id || !sig) return null;
  const expected = Buffer.from(sign(id));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  return id;
}

export function endSession(req: Request, res: Response): void {
  const id = sessionId(req);
  if (id) db.removeSession(id);
  res.clearCookie(COOKIE, { path: "/" });
}

/** Looks up the logged-in user, if any, and puts it on req.user. */
export const attachUser: RequestHandler = (req, _res, next) => {
  const id = sessionId(req);
  const session = id ? db.session(id) : undefined;
  req.user = session ? db.user(session.userId) : undefined;
  next();
};

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) { res.status(401).json({ error: "Log in with Discord first." }); return; }
  next();
}

/**
 * Cross-site forms cannot set custom headers, so requiring one on every change
 * is a simple guard against cross-site request forgery.
 */
export function csrfGuard(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") { next(); return; }
  if (req.headers["x-dusk"] !== "1") { res.status(403).json({ error: "Request blocked." }); return; }
  next();
}
