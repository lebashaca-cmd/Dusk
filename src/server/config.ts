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
