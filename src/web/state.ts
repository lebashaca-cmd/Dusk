import type { MeResponse, Profile, RenderModel } from "../shared/types";
import { api, ApiError } from "./api";

export type SaveState = "idle" | "saving" | "saved" | "error";
type Listener = () => void;

/** The logged-in person's account, plus change notifications and automatic saving. */
class AppStore {
  me: MeResponse | null = null;
  saveState: SaveState = "idle";
  private listeners = new Set<Listener>();
  private saveTimer: number | undefined;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(): void {
    this.listeners.forEach(fn => fn());
  }

  /** Called once at startup. A visitor who isn't logged in simply stays null. */
  async load(): Promise<void> {
    try {
      this.me = await api.me();
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) console.error(e);
      this.me = null;
    }
  }

  get profile(): Profile {
    if (!this.me) throw new Error("Not logged in");
    return this.me.profile;
  }

  /** What the profile renderer needs, built from the owner's own data. */
  get model(): RenderModel | null {
    const me = this.me;
    if (!me) return null;
    return {
      username: me.user.username,
      profile: me.profile,
      avatarUrl: me.avatarUrl,
      discordAvatarUrl: me.user.discordAvatarUrl,
      discordTag: me.user.discordTag,
      discordBannerUrl: me.user.discordBannerUrl,
      discordAccent: me.user.discordAccent,
      serverTag: me.user.serverTag,
      discordId: me.ownerId,
      tracks: me.tracks,
      views: me.views,
      roles: me.roles.filter(r => !me.profile.hiddenRoles.includes(r.id)),
    };
  }

  setMe(me: MeResponse | null): void {
    this.me = me;
    this.emit();
  }

  /** The profile was edited: redraw everything that shows it, then save shortly after the last change. */
  profileChanged(): void {
    this.emit();
    this.setSave("saving");
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.saveNow(), 600);
  }

  async saveNow(): Promise<void> {
    if (!this.me) return;
    try {
      await api.saveProfile(this.me.profile);
      this.setSave("saved");
    } catch {
      this.setSave("error");
    }
  }

  /** Send an edit that is still waiting for its delayed save, e.g. before leaving the editor. */
  async flush(): Promise<void> {
    window.clearTimeout(this.saveTimer);
    if (this.saveState === "saving") await this.saveNow();
  }

  private setSave(state: SaveState): void {
    if (state === this.saveState) return;
    this.saveState = state;
    this.listeners.forEach(fn => fn());
  }
}

export const store = new AppStore();
