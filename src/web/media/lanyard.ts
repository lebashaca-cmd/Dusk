import type { PresenceStatus } from "../../shared/types";

/**
 * Live Discord presence through Lanyard (https://github.com/Phineas/lanyard).
 * Lanyard is a free service that watches Discord accounts that joined its server and
 * publishes their status, activity and Spotify song. We connect to it from the visitor's browser.
 */

export interface SpotifyActivity {
  id: string;
  title: string;
  artist: string;
  album: string;
  art: string | null;
  /** Epoch milliseconds. */
  start: number;
  end: number;
}

export interface PresenceData {
  status: PresenceStatus;
  name: string;
  username: string;
  avatar: string | null;
  custom: { emoji: string; text: string } | null;
  game: { name: string; details: string; state: string } | null;
  spotify: SpotifyActivity | null;
}

export type LanyardStatus = "idle" | "connecting" | "live" | "error";

interface RawActivity {
  type: number;
  name: string;
  state?: string;
  details?: string;
  emoji?: { name?: string };
}

interface RawPresence {
  discord_status?: PresenceStatus;
  discord_user?: { id: string; username: string; global_name?: string | null; display_name?: string | null; avatar?: string | null };
  activities?: RawActivity[];
  listening_to_spotify?: boolean;
  spotify?: { track_id: string; song: string; artist: string; album: string; album_art_url: string; timestamps: { start: number; end: number } } | null;
}

const SOCKET_URL = "wss://api.lanyard.rest/socket";
const REST_URL = "https://api.lanyard.rest/v1/users/";
const NOT_TRACKED = "Lanyard can't see this Discord account yet. Join the Lanyard Discord server, then reload.";
const UNREACHABLE = "Couldn't reach Lanyard. Trying again shortly.";

function normalize(raw: RawPresence): PresenceData {
  const user = raw.discord_user;
  const acts = raw.activities ?? [];
  const custom = acts.find(a => a.type === 4);
  const game = acts.find(a => a.type !== 4 && a.type !== 2 && a.name !== "Spotify");
  const s = raw.listening_to_spotify ? raw.spotify : null;
  const avatar = user?.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}?size=128`
    : null;
  return {
    status: raw.discord_status ?? "offline",
    name: user?.global_name || user?.display_name || user?.username || "",
    username: user?.username ?? "",
    avatar,
    custom: custom ? { emoji: custom.emoji?.name ?? "", text: custom.state ?? "" } : null,
    game: game ? { name: game.name, details: game.details ?? "", state: game.state ?? "" } : null,
    spotify: s
      ? {
          id: s.track_id,
          title: s.song,
          artist: String(s.artist ?? "").replace(/;\s*/g, ", "),
          album: s.album ?? "",
          art: s.album_art_url ?? null,
          start: s.timestamps.start,
          end: s.timestamps.end,
        }
      : null,
  };
}

class LanyardClient {
  status: LanyardStatus = "idle";
  message = "";
  data: PresenceData | null = null;

  private id: string | null = null;
  private generation = 0;
  private socket: WebSocket | null = null;
  private heartbeat: number | undefined;
  private poll: number | undefined;
  private retry: number | undefined;
  private listeners = new Set<() => void>();

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(status: LanyardStatus, message: string): void {
    this.status = status;
    this.message = message;
    this.listeners.forEach(fn => fn());
  }

  /** Follow this Discord user, or stop following when null. Safe to call again with the same ID. */
  ensure(id: string | null): void {
    if (id === this.id) return;
    this.stop();
    this.id = id;
    this.data = null;
    if (!id) { this.set("idle", ""); return; }
    if (!/^\d{15,21}$/.test(id)) { this.set("idle", "Live status needs a real Discord account."); return; }
    this.start(id);
  }

  /** Try again right now. */
  reconnect(): void {
    const id = this.id;
    this.id = null;
    this.ensure(id);
  }

  private stop(): void {
    this.generation++;
    window.clearInterval(this.heartbeat);
    window.clearInterval(this.poll);
    window.clearTimeout(this.retry);
    if (this.socket) {
      this.socket.onclose = null;
      try { this.socket.close(); } catch { /* already closed */ }
      this.socket = null;
    }
  }

  private start(id: string): void {
    const gen = this.generation;
    const live = () => gen === this.generation;
    let gotData = false;
    this.set("connecting", "Connecting to Lanyard…");

    const accept = (raw: RawPresence, how = "") => {
      if (!live()) return;
      gotData = true;
      this.data = normalize(raw);
      this.set("live", "Connected" + how);
    };
    const fail = (message: string) => {
      if (!live()) return;
      window.clearInterval(this.poll);
      this.set("error", message);
      this.retry = window.setTimeout(() => { if (live()) this.start(id); }, 30_000);
    };

    const restFallback = () => {
      if (!live()) return;
      const pull = () => {
        fetch(REST_URL + id)
          .then(r => r.json() as Promise<{ success: boolean; data?: RawPresence }>)
          .then(j => { if (!live()) return; if (j.success && j.data) accept(j.data, " (refreshing every 15 seconds)"); else fail(NOT_TRACKED); })
          .catch(() => fail(UNREACHABLE));
      };
      pull();
      this.poll = window.setInterval(pull, 15_000);
    };

    try {
      const ws = new WebSocket(SOCKET_URL);
      this.socket = ws;
      ws.onmessage = ev => {
        if (!live()) return;
        let msg: { op: number; t?: string; d?: unknown };
        try { msg = JSON.parse(String(ev.data)); } catch { return; }
        if (msg.op === 1) {
          ws.send(JSON.stringify({ op: 2, d: { subscribe_to_id: id } }));
          const every = (msg.d as { heartbeat_interval?: number } | undefined)?.heartbeat_interval ?? 30_000;
          window.clearInterval(this.heartbeat);
          this.heartbeat = window.setInterval(() => { try { ws.send(JSON.stringify({ op: 3 })); } catch { /* socket closed */ } }, every);
        } else if (msg.op === 0 && (msg.t === "INIT_STATE" || msg.t === "PRESENCE_UPDATE")) {
          const d = msg.d as RawPresence & Record<string, RawPresence | undefined>;
          const presence = d.discord_status ? d : d[id];
          if (presence?.discord_status) accept(presence); else fail(NOT_TRACKED);
        }
      };
      ws.onerror = () => { /* onclose follows and handles it */ };
      ws.onclose = () => {
        if (!live()) return;
        window.clearInterval(this.heartbeat);
        if (!gotData) restFallback();
        else {
          this.set("connecting", "Reconnecting…");
          this.retry = window.setTimeout(() => { if (live()) this.start(id); }, 3_000);
        }
      };
    } catch {
      restFallback();
    }
  }
}

export const lanyard = new LanyardClient();
