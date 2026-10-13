import type { NextFunction, Request, RequestHandler, Response } from "express";

/** An error with an HTTP status and a message that is safe to show to the person. */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Lets route handlers be async functions: a thrown error goes to the error handler. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => { fn(req, res, next).catch(next); };
}

/** The logged-in user, or a 401. Use after requireAuth, which guarantees it. */
export function currentUser(req: Request) {
  if (!req.user) throw new HttpError(401, "Log in with Discord first.");
  return req.user;
}
