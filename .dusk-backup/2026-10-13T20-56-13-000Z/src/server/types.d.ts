import type { UserRecord } from "./db";

declare global {
  namespace Express {
    interface Request {
      /** Set by the session middleware when the visitor is logged in. */
      user?: UserRecord;
    }
  }
}

export {};
