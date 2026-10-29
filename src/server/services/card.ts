import crypto from "node:crypto";
import { statSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { ownerOf, userDir, type UserRecord } from "../db";
import { defaultEmbedDesign, embedSvg, type EmbedCtx } from "../../shared/embedcard";
import type { EmbedDesign } from "../../shared/types";
import { isVip } from "../pages";
import { ensureLocal } from "../storage";
import { discordAvatarUrl } from "./discord";

/**
 * The picture that shows when a link to a page is posted in a chat or on a feed, at 1200 by 630. It is drawn from the design
 * the owner arranged in the Embed section (or the standard one, which follows every update) as SVG, then turned into a PNG,
 * because link previews do not draw SVG. Inter is shipped with the site, so the text looks the same on a server with no fonts.
 */

const FONTS = ["Regular", "Medium", "SemiBold", "Bold", "ExtraBold"].map(w => path.resolve("assets/fonts", `Inter-${w}.otf`));
const FONT_OPTS = { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "Inter" } as const;

/** Changes with every deploy, so previews are drawn again after an update. */
export const BUILD_ID: string = (() => {
  try { return Math.floor(statSync(process.argv[1] ?? "").mtimeMs / 1000).toString(36); } catch { return Date.now().toString(36); }
})();

const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
const MAX_IMAGE = 5 * 1024 * 1024;
const OWN_MEDIA = /^\/media\/file\/([A-Za-z0-9_-]{1,40})\/(m-[a-f0-9]{16}\.(?:jpg|png|webp|gif))$/;

/** A picture someone uploaded to their own page, as a data address a drawing can hold. Only their own files are read. */
async function ownFile(user: UserRecord, url: string | undefined): Promise<string | null> {
  const m = url ? OWN_MEDIA.exec(url) : null;
  if (!m || m[1] !== user.id) return null;
  if (!(await ensureLocal(user.id, m[2]!))) return null;
  const file = path.join(userDir(user.id), m[2]!);
  const stat = await fs.stat(file).catch(() => null);
  if (!stat || stat.size > MAX_IMAGE) return null;
  return `data:${MIME[m[2]!.split(".")[1]!]};base64,${(await fs.readFile(file)).toString("base64")}`;
}

const remote = new Map<string, { at: number; value: string | null }>();

/** A Discord profile picture, fetched from Discord's own picture server and remembered for a while. */
async function discordPicture(url: string): Promise<string | null> {
  const hit = remote.get(url);
  if (hit && Date.now() - hit.at < 60 * 60 * 1000) return hit.value;
  let value: string | null = null;
  try {
    const u = new URL(url);
    if (u.protocol === "https:" && u.hostname === "cdn.discordapp.com") {
      const res = await fetch(url.replace(/\.gif(\?|$)/, ".png$1"), { signal: AbortSignal.timeout(5000) });
      const type = res.headers.get("content-type") ?? "";
      if (res.ok && /^image\/(png|jpeg|webp)/.test(type)) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length <= MAX_IMAGE) value = `data:${type.split(";")[0]};base64,${buf.toString("base64")}`;
      }
    }
  } catch { /* the picture is simply left out */ }
  if (remote.size > 300) remote.clear();
  remote.set(url, { at: Date.now(), value });
  return value;
}

const firstLine = (s: string): string => s.split("\n").map(l => l.trim()).find(Boolean) ?? "";

function designOf(user: UserRecord): EmbedDesign {
  return user.profile.embed.design ?? defaultEmbedDesign();
}

function linkWords(user: UserRecord): string[] {
  return user.profile.links.map(l => l.label.trim() || l.url.trim()).filter(Boolean).slice(0, 8);
}

/** Changes whenever the picture would: used to name the picture's address, so a preview is fetched again when it changes. */
export function embedRev(user: UserRecord): string {
  const p = user.profile;
  const design = designOf(user);
  const json = JSON.stringify(design);
  const state = [
    BUILD_ID, json, p.colors, p.name, user.username, firstLine(p.bio), linkWords(user), user.discordServerTag ?? "",
    user.avatarVersion, user.discordAvatar ?? "", isVip(user) ? p.bgImage : "",
    json.includes("{views}") ? Math.floor(user.views / 25) : 0,
  ];
  return crypto.createHash("sha1").update(JSON.stringify(state)).digest("hex").slice(0, 10);
}

/** Every picture the design needs, loaded before drawing. */
async function pictures(user: UserRecord, design: EmbedDesign): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const want: Array<["avatar" | "background" | "media", string | undefined]> = [];
  if (design.bg.mode === "image") want.push([design.bg.src, design.bg.url]);
  for (const b of design.boxes) if (b.id.startsWith("avatar") || b.id.startsWith("image")) want.push([b.src ?? (b.id.startsWith("avatar") ? "avatar" : "background"), b.url]);
  for (const [src, url] of want) {
    const key = `${src}|${url ?? ""}`;
    if (out.has(key)) continue;
    let href: string | null = null;
    if (src === "avatar") {
      if (user.avatarFile && (await ensureLocal(user.id, user.avatarFile))) {
        const buf = await fs.readFile(path.join(userDir(user.id), user.avatarFile)).catch(() => null);
        if (buf && buf.length <= MAX_IMAGE) href = `data:${user.avatarMime ?? "image/jpeg"};base64,${buf.toString("base64")}`;
      }
      if (!href) {
        const d = discordAvatarUrl(ownerOf(user), user.discordAvatar ?? null, 256);
        href = d ? await discordPicture(d) : null;
      }
    } else if (src === "background") {
      href = isVip(user) ? await ownFile(user, user.profile.bgImage) : null;
    } else href = await ownFile(user, url);
    if (href) out.set(key, href);
  }
  return out;
}

/** The picture as SVG, with the pictures it holds inside it. */
export async function embedSvgFor(user: UserRecord): Promise<string> {
  const p = user.profile;
  const design = designOf(user);
  const loaded = await pictures(user, design);
  const ctx: EmbedCtx = {
    colors: p.colors,
    name: p.name || user.username,
    username: user.username,
    bio: firstLine(p.bio),
    views: user.views,
    links: linkWords(user),
    tag: user.discordServerTag ?? "",
    href: (src, url) => loaded.get(`${src}|${url ?? ""}`) ?? null,
  };
  return embedSvg(design, ctx, "e");
}

const cache = new Map<string, Buffer>();

/** The card as a PNG. It is remembered until something it shows changes, so a busy link does not redraw it each time. */
export async function renderCard(user: UserRecord): Promise<Buffer> {
  const key = `${user.id}|${embedRev(user)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const png = new Resvg(await embedSvgFor(user), { font: FONT_OPTS }).render().asPng();
  if (cache.size >= 300) cache.delete(cache.keys().next().value as string);
  cache.set(key, png);
  return png;
}
