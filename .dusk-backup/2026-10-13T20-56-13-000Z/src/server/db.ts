import fs from "node:fs";
import path from "node:path";
import { normalizeProfile } from "../shared/constants";
import type { CoverSource, Lyrics, Profile, RoleTag } from "../shared/types";
import { config } from "./config";

/* ---------- records ---------- */

export interface UserRecord {
  /** Discord user ID. */
  id: string;
  username: string;
  discordName: string;
  /** Discord avatar hash, or null for the default avatar. */
  discordAvatar: string | null;
  profile: Profile;
  /** Roles in the Discord server as of `rolesAt`. */
  roles: RoleTag[];
  rolesAt: number;
  /** File name inside the user's upload folder, when a custom avatar was uploaded. */
  avatarFile: string | null;
  avatarMime: string | null;
  avatarVersion: number;
  views: number;
  createdAt: number;
}

export interface TrackRecord {
  id: string;
  userId: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  audioFile: string;
  coverFile: string | null;
  coverMime: string | null;
  coverSource: CoverSource;
  lyrics: Lyrics;
  order: number;
  updatedAt: number;
  createdAt: number;
}

export interface SessionRecord {
  id: string;
  userId: string;
  expires: number;
}

interface Shape {
  users: Record<string, UserRecord>;
  /** username -> user id */
  usernames: Record<string, string>;
  tracks: Record<string, TrackRecord>;
  sessions: Record<string, SessionRecord>;
}

/* ---------- a small JSON file store ---------- */

class Database {
  private data: Shape = { users: {}, usernames: {}, tracks: {}, sessions: {} };
  private timer: NodeJS.Timeout | null = null;
  private readonly file: string;

  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, "db.json");
    if (fs.existsSync(this.file)) {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8")) as Partial<Shape>;
      this.data = {
        users: Object.fromEntries(Object.entries(raw.users ?? {}).map(([id, u]) => [id, {
          ...u,
          roles: u.roles ?? [],
          rolesAt: u.rolesAt ?? 0,
          profile: normalizeProfile(u.profile, u.discordName),
        }])),
        usernames: raw.usernames ?? {},
        tracks: raw.tracks ?? {},
        sessions: raw.sessions ?? {},
      };
    }
    process.on("exit", () => this.flush());
    for (const sig of ["SIGINT", "SIGTERM"] as const) {
      process.on(sig, () => { this.flush(); process.exit(0); });
    }
  }

  /** Write soon. Many changes in a row become one write. */
  save(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 200);
  }

  flush(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }

  /* users */

  user(id: string): UserRecord | undefined {
    return this.data.users[id];
  }

  userByName(username: string): UserRecord | undefined {
    const id = this.data.usernames[username];
    return id ? this.data.users[id] : undefined;
  }

  usernameTaken(username: string, exceptUserId?: string): boolean {
    const id = this.data.usernames[username];
    return id !== undefined && id !== exceptUserId;
  }

  addUser(user: UserRecord): void {
    this.data.users[user.id] = user;
    this.data.usernames[user.username] = user.id;
    this.save();
  }

  rename(user: UserRecord, username: string): void {
    delete this.data.usernames[user.username];
    user.username = username;
    this.data.usernames[username] = user.id;
    this.save();
  }

  /* tracks */

  track(id: string): TrackRecord | undefined {
    return this.data.tracks[id];
  }

  tracksOf(userId: string): TrackRecord[] {
    return Object.values(this.data.tracks)
      .filter(t => t.userId === userId)
      .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  }

  addTrack(track: TrackRecord): void {
    this.data.tracks[track.id] = track;
    this.save();
  }

  removeTrack(id: string): void {
    delete this.data.tracks[id];
    this.save();
  }

  /** Totals for the front page. A page counts once it has a bio, a link or a song on it. */
  counts(): { users: number; pages: number } {
    const users = Object.values(this.data.users);
    const withSong = new Set(Object.values(this.data.tracks).map(t => t.userId));
    const pages = users.filter(u => u.profile.bio.trim() || u.profile.links.length > 0 || withSong.has(u.id)).length;
    return { users: users.length, pages };
  }

  /* sessions */

  session(id: string): SessionRecord | undefined {
    const s = this.data.sessions[id];
    if (s && s.expires < Date.now()) { delete this.data.sessions[id]; this.save(); return undefined; }
    return s;
  }

  addSession(session: SessionRecord): void {
    this.data.sessions[session.id] = session;
    this.save();
  }

  removeSession(id: string): void {
    delete this.data.sessions[id];
    this.save();
  }
}

export const db = new Database(config.dataDir);

/** Where one user's uploaded files live. */
export function userDir(userId: string): string {
  const dir = path.join(config.dataDir, "uploads", userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
