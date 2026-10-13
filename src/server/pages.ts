import fs from "node:fs/promises";
import path from "node:path";
import { multiPage } from "./config";
import { db, ownerOf, userDir, type UserRecord } from "./db";
import { dropFile } from "./storage";

/** Owners and devs (by Discord ID, or by a role in the Discord server) may have more than one page. */
export function canHaveManyPages(u: UserRecord): boolean {
  if (multiPage.ids.has(ownerOf(u))) return true;
  return u.roles.some(r => multiPage.roles.includes(r.name.trim().toLowerCase()));
}

/** Delete a page: its songs, covers and picture on disk and in storage, then the page itself. */
export async function deletePage(user: UserRecord): Promise<void> {
  const files: string[] = [];
  if (user.avatarFile) files.push(user.avatarFile);
  for (const t of db.removePage(user)) {
    files.push(t.audioFile);
    if (t.coverFile) files.push(t.coverFile);
  }
  const dir = userDir(user.id);
  for (const name of files) {
    await fs.rm(path.join(dir, name), { force: true });
    await dropFile(user.id, name).catch(e => console.error("Could not remove stored file:", e));
  }
}
