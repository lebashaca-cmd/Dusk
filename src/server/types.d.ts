import type { UserRecord } from "./db";

declare global {
  namespace Express {
    interface Request {
      /** Set by the session middleware when the visitor is logged in. */
      user?: UserRecord;
      /** Discord ID of the logged-in account (the owner of req.user, which is the page being edited). */
      ownerId?: string;
    }
  }
}

export {};
