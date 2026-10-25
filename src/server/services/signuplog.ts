import { config } from "../config";
import { db, type UserRecord } from "../db";

/** One sign-up as the log shows it. */
export function signupEntry(u: UserRecord) {
  return {
    username: u.username,
    discordUsername: u.discordHandle ?? (u.email ? "(email sign-up, no Discord)" : u.discordName),
    ip: u.signupIp ?? null,
    createdAt: new Date(u.createdAt).toISOString(),
  };
}

/** Post a new sign-up to the log channel, if one was set with the bot command. Never blocks or breaks a sign-up. */
export function announceSignup(user: UserRecord): void {
  const channel = db.logChannel();
  if (!channel || !config.discord.botToken) return;
  const e = signupEntry(user);
  const body = {
    allowed_mentions: { parse: [] as string[] },
    embeds: [{
      title: "New dusk sign-up",
      color: 0xffffff,
      fields: [
        { name: "Username", value: `\`${e.username}\``, inline: true },
        { name: "Discord", value: `\`${e.discordUsername}\``, inline: true },
        { name: "IP", value: `\`${e.ip ?? "unknown"}\``, inline: true },
        { name: "Created", value: `<t:${Math.floor(user.createdAt / 1000)}:F>`, inline: false },
      ],
      timestamp: e.createdAt,
    }],
  };
  void fetch(`https://discord.com/api/v10/channels/${channel}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${config.discord.botToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(async r => { if (!r.ok) console.error(`Sign-up log failed (${r.status}): ${(await r.text()).slice(0, 200)}`); })
    .catch(err => console.error("Sign-up log failed:", err));
}
