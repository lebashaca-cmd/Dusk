import fs from "node:fs";
import path from "node:path";
import { normalizeProfile, type TemplateStyle } from "../shared/constants";
import type { CoverSource, Lyrics, Profile, RoleTag } from "../shared/types";
import { config } from "./config";
import { loadState, remoteEnabled, saveState } from "./storage";

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
  /** Views per day, keyed by YYYY-MM-DD. Only the last 90 days are kept. */
  viewsByDay?: Record<string, number>;
  /** How many times each link was opened, keyed by the link's id. */
  clicks?: Record<string, number>;
  createdAt: number;
  /** Discord's own @handle, as opposed to the display name above. Older accounts may not have it. */
  discordHandle?: string;
  /** IP address the account was created from, kept for abuse prevention. Never sent to the web app. */
  signupIp?: string | null;
  /** Discord ID of the account that owns this page. Missing on a first page, where the ID is the owner. */
  ownerId?: string;
  /** Shown in the Community tab when true. */
  listed?: boolean;
  /** Where and when this account last logged in. Kept for security notices. Never shown on a page. */
  lastLoginIp?: string | null;
  lastLoginAt?: number;
  /** Set when the account was made with an email and a password instead of Discord. Lowercase. */
  email?: string;
  /** scrypt hash of the password ("scrypt$salt$hash"). Never sent anywhere. Only on email accounts. */
  passHash?: string;
}

export interface TemplateRecord {
  id: string;
  ownerId: string;
  author: string;
  name: string;
  description: string;
  style: TemplateStyle;
  uses: number;
  createdAt: number;
}

export const ownerOf = (u: { id: string; ownerId?: string }): string => u.ownerId ?? u.id;

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
  settings: { logChannelId: string | null };
  templates: Record<string, TemplateRecord>;
}

/* ---------- a small JSON file store ---------- */

class Database {
  private data: Shape = { users: {}, usernames: {}, tracks: {}, sessions: {}, settings: { logChannelId: null }, templates: {} };
  private timer: NodeJS.Timeout | null = null;
  private readonly file: string;

  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, "db.json");
    if (!remoteEnabled && fs.existsSync(this.file)) this.load(JSON.parse(fs.readFileSync(this.file, "utf8")) as Partial<Shape>);
    process.on("exit", () => { if (!remoteEnabled) this.flush(); });
    for (const sig of ["SIGINT", "SIGTERM"] as const) {
      process.on(sig, () => { void this.drain().finally(() => process.exit(0)); });
    }
  }

  private load(raw: Partial<Shape>): void {
    this.data = {
      users: Object.fromEntries(Object.entries(raw.users ?? {}).map(([id, u]) => [id, {
        ...u,
        roles: u.roles ?? [],
        rolesAt: u.rolesAt ?? 0,
        viewsByDay: u.viewsByDay ?? {},
        clicks: u.clicks ?? {},
        profile: normalizeProfile(u.profile, u.discordName),
      }])),
      usernames: raw.usernames ?? {},
      tracks: raw.tracks ?? {},
      sessions: raw.sessions ?? {},
      settings: { logChannelId: raw.settings?.logChannelId ?? null },
      templates: raw.templates ?? {},
    };
  }

  /** Load from Supabase when it is configured. Call once before the server starts. */
  async init(): Promise<void> {
    if (!remoteEnabled) return;
    const raw = (await loadState()) as Partial<Shape> | null;
    if (raw) this.load(raw);
  }

  private pushing = false;
  private again = false;

  private async pushRemote(): Promise<void> {
    if (this.pushing) { this.again = true; return; }
    this.pushing = true;
    try {
      do {
        this.again = false;
        try { await saveState(this.data); } catch (e) { console.error(e); }
      } while (this.again);
    } finally { this.pushing = false; }
  }

  /** Finish any pending write. Used when the process is asked to stop. */
  async drain(): Promise<void> {
    this.flush();
    while (this.pushing) await new Promise(r => setTimeout(r, 50));
  }

  /** Write soon. Many changes in a row become one write. */
  save(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 200);
  }

  flush(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (remoteEnabled) { void this.pushRemote(); return; }
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

  userByEmail(email: string): UserRecord | undefined {
    return Object.values(this.data.users).find(u => u.email === email);
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

  /* analytics */

  /** Count one view: in total, and for today. */
  recordView(user: UserRecord): void {
    user.views += 1;
    const days = user.viewsByDay ?? (user.viewsByDay = {});
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    days[today] = (days[today] ?? 0) + 1;
    // Keep the last 90 days only, so the file does not grow forever.
    const keys = Object.keys(days).sort();
    for (const old of keys.slice(0, Math.max(0, keys.length - 90))) delete days[old];
    this.save();
  }

  /** Count one open of a link. */
  recordClick(user: UserRecord, linkId: string): void {
    const clicks = user.clicks ?? (user.clicks = {});
    clicks[linkId] = (clicks[linkId] ?? 0) + 1;
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

  /** Every page an account owns, oldest first. */
  pagesOf(ownerId: string): UserRecord[] {
    return Object.values(this.data.users).filter(u => ownerOf(u) === ownerId).sort((a, b) => a.createdAt - b.createdAt);
  }

  /** Remove a page's songs, keeping the page. Returns them so their files can be deleted. */
  removePageTracks(userId: string): TrackRecord[] {
    const tracks = this.tracksOf(userId);
    for (const t of tracks) delete this.data.tracks[t.id];
    if (tracks.length) this.save();
    return tracks;
  }

  /** Remove a page and its songs. Returns the songs so their files can be deleted. */
  removePage(user: UserRecord): TrackRecord[] {
    const tracks = this.tracksOf(user.id);
    for (const t of tracks) delete this.data.tracks[t.id];
    delete this.data.users[user.id];
    if (this.data.usernames[user.username] === user.id) delete this.data.usernames[user.username];
    this.save();
    return tracks;
  }

  /** Totals for the front page. A page counts once it has a bio, a link or a song on it. */
  counts(): { users: number; pages: number } {
    const users = Object.values(this.data.users);
    const owners = new Set(users.map(ownerOf));
    const withSong = new Set(Object.values(this.data.tracks).map(t => t.userId));
    // A first page counts once it has a bio, a link or a song. An extra page counts as soon as it is made, since someone chose to make it.
    const pages = users.filter(u => (u.ownerId && u.ownerId !== u.id) || u.profile.bio.trim() || u.profile.links.length > 0 || withSong.has(u.id)).length;
    return { users: owners.size, pages };
  }

  /* community */

  listedPages(): UserRecord[] {
    return Object.values(this.data.users).filter(u => u.listed);
  }

  templates(): TemplateRecord[] {
    return Object.values(this.data.templates);
  }

  template(id: string): TemplateRecord | undefined {
    return this.data.templates[id];
  }

  addTemplate(t: TemplateRecord): void {
    this.data.templates[t.id] = t;
    this.save();
  }

  removeTemplate(id: string): void {
    delete this.data.templates[id];
    this.save();
  }

  /* sign-up log */

  logChannel(): string | null {
    return this.data.settings.logChannelId;
  }

  setLogChannel(id: string | null): void {
    this.data.settings.logChannelId = id;
    this.save();
  }

  recentSignups(limit: number): UserRecord[] {
    return Object.values(this.data.users).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
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

  /** Log an account out everywhere. */
  removeSessionsOf(userId: string): number {
    let n = 0;
    for (const [id, s] of Object.entries(this.data.sessions)) if (s.userId === userId) { delete this.data.sessions[id]; n++; }
    if (n) this.save();
    return n;
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
