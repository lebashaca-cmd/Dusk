import type { NextFunction, Request, Response } from "express";

/** A small in-memory limiter: at most `max` requests per `windowMs` for each client address. */
export function rateLimit(windowMs: number, max: number) {
  const hits = new Map<string, { count: number; reset: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) { hits.set(key, { count: 1, reset: now + windowMs }); next(); return; }
    entry.count += 1;
    if (entry.count > max) {
      res.status(429).json({ error: "Too many requests. Wait a moment and try again." });
      return;
    }
    next();
  };
}
