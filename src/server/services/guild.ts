import type { RoleTag } from "../../shared/types";
import { config } from "../config";

const API = "https://discord.com/api/v10";
const headers = { Authorization: `Bot ${config.discord.botToken}` };

interface RawRole { id: string; name: string; color: number; position: number; managed: boolean }

let roleCache: { at: number; roles: Map<string, RawRole> } | null = null;

async function guildRoles(): Promise<Map<string, RawRole>> {
  if (roleCache && Date.now() - roleCache.at < 5 * 60_000) return roleCache.roles;
  const res = await fetch(`${API}/guilds/${config.discord.guildId}/roles`, { headers, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Could not read the server's roles (${res.status}). Is the bot in the server?`);
  const list = (await res.json()) as RawRole[];
  roleCache = { at: Date.now(), roles: new Map(list.map(r => [r.id, r])) };
  return roleCache.roles;
}

const hex = (n: number): string => (n ? `#${n.toString(16).padStart(6, "0")}` : "#99aab5");

/**
 * The person's roles in the server, highest first, or null when they are not a member.
 * The @everyone role and roles that belong to bots or integrations are left out.
 */
export async function memberRoles(userId: string): Promise<RoleTag[] | null> {
  const res = await fetch(`${API}/guilds/${config.discord.guildId}/members/${userId}`, { headers, signal: AbortSignal.timeout(10_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not check the Discord server (${res.status}). Is the bot in the server?`);
  const member = (await res.json()) as { roles: string[] };
  const all = await guildRoles();
  return member.roles
    .map(id => all.get(id))
    .filter((r): r is RawRole => Boolean(r) && !r!.managed && r!.id !== config.discord.guildId)
    .sort((a, b) => b.position - a.position)
    .map(r => ({ id: r.id, name: r.name, color: hex(r.color) }));
}
