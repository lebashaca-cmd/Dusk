import { config } from "../config";

const API = "https://discord.com/api/v10";

export interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  /** The banner hash and the accent colour, when the account has them. */
  banner?: string | null;
  accent_color?: number | null;
  /** The server tag the account shows next to its name, when it has one switched on. */
  primary_guild?: { identity_guild_id?: string | null; identity_enabled?: boolean | null; tag?: string | null; badge?: string | null } | null;
}

/** The server tag of a Discord account: the 2 to 4 letters, the server it belongs to and its badge hash. Null when none is shown. */
export function serverTagOf(du: DiscordUser): { tag: string; guildId: string | null; badge: string | null } | null {
  const g = du.primary_guild;
  if (!g || g.identity_enabled === false || !g.tag || !g.tag.trim()) return null;
  return { tag: g.tag.trim().slice(0, 4), guildId: g.identity_guild_id ?? null, badge: g.badge ?? null };
}

/** The little badge picture of a server tag. */
export function serverBadgeUrl(guildId: string | null | undefined, hash: string | null | undefined): string | null {
  if (!guildId || !hash || !/^\d{5,25}$/.test(guildId) || !/^[a-f0-9]{8,64}$/i.test(hash)) return null;
  return `https://cdn.discordapp.com/guild-tag-badges/${guildId}/${hash}.png?size=64`;
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.discord.clientId,
    response_type: "code",
    scope: "identify",
    redirect_uri: config.discord.redirectUri,
    state,
    prompt: "none",
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}

/** Swap the one-time code from the redirect for an access token. */
export async function exchangeCode(code: string): Promise<string> {
  const res = await fetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.discord.clientId,
      client_secret: config.discord.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: config.discord.redirectUri,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Discord rejected the login (${res.status}).`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Discord did not return an access token.");
  return json.access_token;
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch(`${API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Could not read your Discord account (${res.status}).`);
  return (await res.json()) as DiscordUser;
}

/** The banner picture of a Discord account, if it has one. */
export function discordBannerUrl(id: string, hash: string | null | undefined, size = 600): string | null {
  if (!hash) return null;
  const ext = hash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/banners/${id}/${hash}.${ext}?size=${size}`;
}

/** The accent colour of a Discord account as #rrggbb, when it has one. */
export function discordAccentHex(n: number | null | undefined): string | null {
  return typeof n === "number" && n >= 0 && n <= 0xffffff ? `#${n.toString(16).padStart(6, "0")}` : null;
}

export function discordAvatarUrl(id: string, hash: string | null, size = 256): string | null {
  if (!hash) return null;
  const ext = hash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${id}/${hash}.${ext}?size=${size}`;
}
