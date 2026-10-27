import "dotenv/config";
import path from "node:path";

const env = process.env;
const port = Number(env.PORT ?? 3000);
const baseUrl = (env.BASE_URL ?? `http://localhost:${port}`).replace(/\/+$/, "");
const isProd = env.NODE_ENV === "production";

const DEV_SECRET = "dev-only-secret-change-me";
const sessionSecret = env.SESSION_SECRET || DEV_SECRET;
if (isProd && sessionSecret === DEV_SECRET) {
  throw new Error("SESSION_SECRET must be set to a long random string in production.");
}

export const config = {
  port,
  baseUrl,
  isProd,
  /** Cookies are only marked Secure when the site is served over https. */
  secureCookies: baseUrl.startsWith("https://"),
  trustProxy: env.TRUST_PROXY === "1",
  sessionSecret,
  dataDir: path.resolve(env.DATA_DIR ?? "data"),
  webDir: path.resolve("dist/web"),
  /** /auth/dev logs in a throwaway test account. Never enabled in production. */
  devLogin: env.DEV_LOGIN === "1" && !isProd,
  discord: {
    clientId: env.DISCORD_CLIENT_ID ?? "",
    clientSecret: env.DISCORD_CLIENT_SECRET ?? "",
    redirectUri: env.DISCORD_REDIRECT_URI ?? `${baseUrl}/auth/discord/callback`,
    /** The server people must join. Roles are read with the bot token. */
    guildId: env.DISCORD_GUILD_ID ?? "",
    botToken: env.DISCORD_BOT_TOKEN ?? "",
    inviteUrl: env.DISCORD_INVITE_URL ?? "",
    /** Where "Risk" in the footer links. Defaults to the invite link above. */
    creditUrl: env.DUSK_CREDIT_URL || env.DISCORD_INVITE_URL || "",
  },
} as const;

const list = (v: string | undefined): string[] => (v ?? "").split(",").map(x => x.trim()).filter(Boolean);

/** Who may create more than one page: listed Discord IDs, or anyone with a matching role in the Discord server. */
export const multiPage = {
  ids: new Set([...list(env.DUSK_OWNER_IDS), ...list(env.DUSK_DEV_IDS)]),
  roles: list(env.DUSK_PAGE_ROLES ?? "owner,dev,developer").map(r => r.toLowerCase()),
  max: Math.min(50, Math.max(1, Number(env.DUSK_MAX_PAGES) || 10)),
};

export const guildConfigured = Boolean(config.discord.guildId && config.discord.botToken);
export const discordConfigured = Boolean(config.discord.clientId && config.discord.clientSecret);

/**
 * Where lyrics come from.
 *
 * LRCLIB, Genius and PetitLyrics answer on their own. Spicy Lyrics and Musixmatch need a key
 * from their developer sites; until one is set, LRCLIB is used instead so a song still gets its words.
 */
export const lyrics = {
  /** A Genius access token. Optional: the public search works without one. */
  geniusToken: env.GENIUS_TOKEN ?? "",
  /** A Spicy Lyrics secret key (sl_sk_...), from https://developers.spicylyrics.org. */
  spicyKey: env.SPICYLYRICS_API_KEY ?? "",
  /** A Musixmatch API key, from https://developer.musixmatch.com. */
  musixmatchKey: env.MUSIXMATCH_API_KEY ?? "",
} as const;

/**
 * VIP members get the Dynamic Island, the premium backgrounds and picture backgrounds.
 * Owners and devs are always VIP. Everyone else needs their Discord ID in DUSK_VIP_IDS,
 * or a role in the Discord server whose name is in DUSK_VIP_ROLES.
 */
export const vipAccess = {
  ids: new Set([...multiPage.ids, ...list(env.DUSK_VIP_IDS)]),
  roles: list(env.DUSK_VIP_ROLES ?? "vip,owner,dev,developer").map(r => r.toLowerCase()),
};
