import crypto from "node:crypto";
import multer from "multer";
import { LIMITS } from "../shared/constants";
import { currentUser } from "./http";
import { userDir } from "./db";

/** Files land in the user's folder under a temporary name and are checked before they are kept. */
function diskUpload(maxBytes: number) {
  return multer({
    storage: multer.diskStorage({
      destination: (req, _file, cb) => {
        try { cb(null, userDir(currentUser(req).id)); } catch (e) { cb(e as Error, ""); }
      },
      filename: (_req, _file, cb) => cb(null, `upload-${crypto.randomBytes(6).toString("hex")}.tmp`),
    }),
    limits: { fileSize: maxBytes, files: 1 },
  });
}

export const audioUpload = diskUpload(LIMITS.audioBytes);
export const imageUpload = diskUpload(LIMITS.imageBytes);
