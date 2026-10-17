import fs from "node:fs/promises";
import path from "node:path";
import { multiPage, vipAccess } from "./config";
import { defaultProfile } from "../shared/constants";
import { db, ownerOf, userDir, type UserRecord } from "./db";
import { dropFile } from "./storage";

/** Owners and devs (by Discord ID, or by a role in the Discord server) may have more than one page. */
export function canHaveManyPages(u: UserRecord): boolean {
  if (multiPage.ids.has(ownerOf(u))) return true;
  return u.roles.some(r => multiPage.roles.includes(r.name.trim().toLowerCase()));
}

/** VIP: owners, devs, listed IDs, or anyone with a VIP role in the Discord server. */
export function isVip(u: UserRecord): boolean {
  if (vipAccess.ids.has(ownerOf(u))) return true;
  return u.roles.some(r => vipAccess.roles.includes(r.name.trim().toLowerCase()));
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

/** Put a page back to how it was on day one: default look, no songs, no uploaded picture, not listed. The name and link stay. */
export async function resetPage(user: UserRecord): Promise<{ songs: number; links: number }> {
  const summary = { songs: db.tracksOf(user.id).length, links: user.profile.links.length };
  const files: string[] = [];
  if (user.avatarFile) files.push(user.avatarFile);
  for (const t of db.removePageTracks(user.id)) {
    files.push(t.audioFile);
    if (t.coverFile) files.push(t.coverFile);
  }
  const dir = userDir(user.id);
  for (const name of files) {
    await fs.rm(path.join(dir, name), { force: true });
    await dropFile(user.id, name).catch(e => console.error("Could not remove stored file:", e));
  }
  user.avatarFile = null;
  user.avatarMime = null;
  user.avatarVersion += 1;
  user.profile = defaultProfile(user.discordName);
  user.listed = false;
  user.views = 0;
  db.save();
  return summary;
}
