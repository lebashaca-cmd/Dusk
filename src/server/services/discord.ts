import { config } from "../config";

const API = "https://discord.com/api/v10";

export interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
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

export function discordAvatarUrl(id: string, hash: string | null, size = 256): string | null {
  if (!hash) return null;
  const ext = hash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${id}/${hash}.${ext}?size=${size}`;
}
