import type {
  ApiErrorBody, Lyrics, MeResponse, PublicProfile, SiteConfig, SiteStats, Track, UsernameCheck,
} from "../shared/types";

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: BodyInit | object): Promise<T> {
  const headers: Record<string, string> = { "x-dusk": "1" };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    const message = (json as ApiErrorBody | null)?.error ?? `Request failed (${res.status}).`;
    throw new ApiError(res.status, message);
  }
  return json as T;
}

const get = <T>(url: string) => request<T>("GET", url);
const send = <T>(method: string, url: string, body?: object | FormData) => request<T>(method, url, body);

export const api = {
  me: () => get<MeResponse>("/api/me"),
  stats: () => get<SiteStats>("/api/stats"),
  ping: (id: string) => send<void>("POST", "/api/ping", { id }),
  config: () => get<SiteConfig>("/api/config"),
  refreshRoles: () => send<MeResponse>("POST", "/api/roles/refresh"),
  saveProfile: (profile: object) => send<unknown>("PUT", "/api/profile", profile),
  saveUsername: (username: string) => send<{ username: string }>("PUT", "/api/username", { username }),
  checkUsername: (name: string) => get<UsernameCheck>(`/api/username/${encodeURIComponent(name)}`),
  publicProfile: (username: string) => get<PublicProfile>(`/api/public/${encodeURIComponent(username)}`),
  countView: (username: string) => send<{ views: number }>("POST", `/api/public/${encodeURIComponent(username)}/view`),
  lyrics: (q: { title: string; artist: string; album: string; duration: number }) =>
    get<Lyrics>(`/api/lyrics?${new URLSearchParams({ ...q, duration: String(Math.round(q.duration)) })}`),
  createPage: (username: string) => send<MeResponse>("POST", "/api/pages", { username }),
  switchPage: (id: string) => send<MeResponse>("PUT", "/api/pages/active", { id }),
  deletePage: (id: string) => send<{ loggedOut: boolean }>("DELETE", `/api/pages/${encodeURIComponent(id)}`),
  logout: () => send<void>("POST", "/api/logout"),

  uploadAvatar: (blob: Blob) => {
    const fd = new FormData();
    fd.append("file", blob, "avatar.jpg");
    return send<MeResponse>("POST", "/api/avatar", fd);
  },
  removeAvatar: () => send<MeResponse>("DELETE", "/api/avatar"),

  addTrack: (file: File, title: string, artist: string) => {
    const fd = new FormData();
    fd.append("title", title);
    fd.append("artist", artist);
    fd.append("file", file);
    return send<Track>("POST", "/api/tracks", fd);
  },
  lookupTrack: (id: string, title: string, artist: string) => send<Track>("POST", `/api/tracks/${id}/lookup`, { title, artist }),
  uploadCover: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return send<Track>("POST", `/api/tracks/${id}/cover`, fd);
  },
  orderTracks: (ids: string[]) => send<Track[]>("PUT", "/api/tracks/order", { ids }),
  deleteTrack: (id: string) => send<void>("DELETE", `/api/tracks/${id}`),
};
