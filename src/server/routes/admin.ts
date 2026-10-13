import crypto from "node:crypto";
import { Router, type RequestHandler } from "express";
import { db } from "../db";
import { HttpError } from "../http";
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
