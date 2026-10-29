import type { EmbedBackground, EmbedBox, EmbedDesign, EmbedKind, ProfileColors } from "./types";
import { EMBED_KINDS } from "./types";

/**
 * The picture a link preview shows, drawn from a design the owner arranged: a background and pieces
 * (text, links, a picture, a shape, the mark). The same function draws it on the server (turned into a PNG for
 * Discord and the like) and in the editor (as SVG on the page), so what is arranged is what is posted.
 */

export const EMBED_W = 1200;
export const EMBED_H = 630;
export const MAX_EMBED_BOXES = 20;

const xml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const hexOk = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
const hexOf = (v: string | undefined, dflt: string): string => (hexOk(v) ? v : dflt);
const num = (v: unknown, min: number, max: number, dflt: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : dflt;

export const embedKindOf = (id: string): EmbedKind | null => {
  const k = id.split(":")[0] ?? "";
  return (EMBED_KINDS as readonly string[]).includes(k) ? (k as EmbedKind) : null;
};

/** What a person can put in a text piece, which is filled in when the picture is drawn. */
export const EMBED_TOKENS = ["name", "username", "bio", "views", "links", "tag"] as const;

export interface EmbedCtx {
  colors: ProfileColors;
  name: string;
  username: string;
  /** The first line of the bio. */
  bio: string;
  views: number;
  /** The words of the links, in order. */
  links: string[];
  /** The Discord server tag, or empty. */
  tag: string;
  /** The address (or data address) of a picture, or null when there is none. */
  href(src: "avatar" | "background" | "media", url?: string): string | null;
}

export function fillEmbedText(text: string, ctx: Pick<EmbedCtx, "name" | "username" | "bio" | "views" | "links" | "tag">): string {
  const vars: Record<string, string> = { name: ctx.name, username: ctx.username, bio: ctx.bio, views: String(ctx.views), links: String(ctx.links.length), tag: ctx.tag };
  return text.replace(/\{(name|username|bio|views|links|tag)\}/g, (_m, k: string) => vars[k] ?? "");
}

/* ---------- the standard picture ---------- */

/** The picture every page starts with, and keeps until its owner arranges their own. */
export function defaultEmbedDesign(): EmbedDesign {
  return {
    bg: { mode: "page", c1: "#07060f", c2: "#1b1140", angle: 160, glow: true, src: "background", url: "", dim: 40 },
    boxes: [
      { id: "logo", x: 900, y: 64, w: 220, h: 112, op: 100 },
      { id: "text:1", x: 84, y: 104, w: 800, h: 100, text: "{name}", size: 78, wt: 800, align: "left" },
      { id: "text:2", x: 84, y: 198, w: 800, h: 44, text: "@{username}", size: 28, wt: 500, color: "dim", align: "left" },
      { id: "text:3", x: 84, y: 254, w: 1032, h: 54, text: "{bio}", size: 32, wt: 400, op: 82, align: "left" },
      { id: "links", x: 84, y: 462, w: 1032, h: 60, size: 24, count: 3, align: "left" },
      { id: "text:4", x: 84, y: 546, w: 240, h: 40, text: "dusk", size: 24, wt: 700, color: "dim", align: "left" },
    ].map(b => ({ ...b, fixedH: true })) as EmbedBox[],
  };
}

/* ---------- checking what comes in ---------- */

const WEIGHTS = [400, 500, 600, 700, 800] as const;

function normalizeBox(raw: unknown): EmbedBox | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Partial<EmbedBox>;
  if (typeof b.id !== "string" || !/^[a-z]{3,6}(:\d{1,3})?$/.test(b.id) || !embedKindOf(b.id)) return null;
  const kind = embedKindOf(b.id)!;
  const out: EmbedBox = {
    id: b.id,
    x: Math.round(num(b.x, -600, EMBED_W, 0)),
    y: Math.round(num(b.y, -600, EMBED_H, 0)),
    w: Math.round(num(b.w, 8, 1600, 200)),
    h: Math.round(num(b.h, 8, 1000, 60)),
    fixedH: true,
  };
  if (b.locked === true) out.locked = true;
  if (b.ratio === true) out.ratio = true;
  const op = num(b.op, 10, 100, 100);
  if (op < 100) out.op = Math.round(op);
  if (typeof b.color === "string" && (hexOk(b.color) || b.color === "dim" || b.color === "accent")) out.color = b.color;
  if (kind === "text" || kind === "links") {
    out.size = Math.round(num(b.size, 8, 200, kind === "links" ? 24 : 40));
    if (b.align === "left" || b.align === "center" || b.align === "right") out.align = b.align;
  }
  if (kind === "text") {
    if (typeof b.text === "string") out.text = b.text.slice(0, 300);
    if (typeof b.wt === "number" && (WEIGHTS as readonly number[]).includes(b.wt)) out.wt = b.wt as EmbedBox["wt"];
  }
  if (kind === "links") {
    out.count = Math.round(num(b.count, 1, 8, 3));
    if (hexOk(b.fill)) out.fill = b.fill;
    if (typeof b.fillOp === "number") out.fillOp = Math.round(num(b.fillOp, 0, 100, 7));
  }
  if (kind === "shape") {
    if (hexOk(b.fill) || b.fill === "accent" || b.fill === "dim" || b.fill === "text") out.fill = b.fill as string;
    out.fillOp = Math.round(num(b.fillOp, 0, 100, 100));
    if (hexOk(b.stroke) || b.stroke === "accent" || b.stroke === "dim" || b.stroke === "text") out.stroke = b.stroke as string;
    out.strokeW = Math.round(num(b.strokeW, 0, 40, 0));
    out.radius = Math.round(num(b.radius, 0, 400, 24));
  }
  if (kind === "avatar" || kind === "image") {
    out.src = b.src === "avatar" || b.src === "background" || b.src === "media" ? b.src : kind === "avatar" ? "avatar" : "background";
    if (typeof b.url === "string" && /^\/media\/file\/[A-Za-z0-9_-]{1,40}\/m-[a-f0-9]{16}\.(jpg|png|webp|gif)$/.test(b.url)) out.url = b.url;
    out.fit = b.fit === "contain" ? "contain" : "cover";
    out.shape = b.shape === "circle" || b.shape === "square" || b.shape === "round" ? b.shape : kind === "avatar" ? "circle" : "round";
    out.radius = Math.round(num(b.radius, 0, 400, 28));
    if (hexOk(b.stroke) || b.stroke === "accent" || b.stroke === "dim" || b.stroke === "text") out.stroke = b.stroke as string;
    out.strokeW = Math.round(num(b.strokeW, 0, 40, 0));
  }
  if (kind === "logo" && b.ratio !== true) { /* the mark keeps its own shape whatever the box is */ }
  return out;
}

/** The design with anything odd put right, or null when there is none. */
export function normalizeDesign(raw: unknown, fallback: EmbedDesign | null = null): EmbedDesign | null {
  if (!raw || typeof raw !== "object") return fallback;
  const d = raw as { bg?: Partial<EmbedBackground>; boxes?: unknown };
  const dflt = defaultEmbedDesign().bg;
  const bg: Partial<EmbedBackground> = d.bg && typeof d.bg === "object" ? d.bg : {};
  const boxes: EmbedBox[] = [];
  const seen = new Set<string>();
  if (Array.isArray(d.boxes)) {
    for (const r of d.boxes) {
      const b = normalizeBox(r);
      if (!b || seen.has(b.id)) continue;
      seen.add(b.id);
      boxes.push(b);
      if (boxes.length >= MAX_EMBED_BOXES) break;
    }
  }
  const url = typeof bg.url === "string" && /^\/media\/file\/[A-Za-z0-9_-]{1,40}\/m-[a-f0-9]{16}\.(jpg|png|webp|gif)$/.test(bg.url) ? bg.url : "";
  return {
    bg: {
      mode: bg.mode === "solid" || bg.mode === "gradient" || bg.mode === "image" ? bg.mode : "page",
      c1: hexOf(bg.c1, dflt.c1),
      c2: hexOf(bg.c2, dflt.c2),
      angle: Math.round(num(bg.angle, 0, 360, dflt.angle)),
      glow: bg.glow !== false,
      src: bg.src === "media" ? "media" : "background",
      url,
      dim: Math.round(num(bg.dim, 0, 90, dflt.dim)),
    },
    boxes,
  };
}

/** Is this text only a filled-in value, like "@{username}", with no words of the owner's own? */
const onlyTokens = (t: string): boolean => !/[\p{L}\p{N}]/u.test(t.replace(/\{[a-z]+\}/g, ""));

/** The design without what its owner wrote or uploaded, for sharing as a template: the arrangement stays. */
export function stripDesign(d: EmbedDesign): EmbedDesign {
  const out = structuredClone(d);
  for (const b of out.boxes) {
    if (embedKindOf(b.id) === "text" && b.text && !onlyTokens(b.text)) b.text = "";
    if (b.src === "media") delete b.url;
  }
  if (out.bg.src === "media") { out.bg.url = ""; if (out.bg.mode === "image") out.bg.mode = "page"; }
  return out;
}

/* ---------- text ---------- */

/** How wide a letter is, as a share of the text size. Close enough to Inter to decide where a line breaks. */
function charWidth(c: string): number {
  const code = c.codePointAt(0) ?? 0;
  if (code > 0x2e80) return 1;
  if (" ".includes(c)) return 0.27;
  if ("iIl.,:;'|!`".includes(c)) return 0.27;
  if ("jtfr()[]-/\\".includes(c)) return 0.36;
  if ("mwMW@%".includes(c)) return 0.88;
  if (c >= "A" && c <= "Z") return 0.69;
  if (c >= "0" && c <= "9") return 0.62;
  if (code > 0x7f) return 0.66;
  return 0.59;
}
const WEIGHT_K: Record<number, number> = { 400: 0.96, 500: 0.98, 600: 1, 700: 1.03, 800: 1.06 };

/** Roughly how wide a line is when drawn. */
export function textWidth(text: string, size: number, weight: number): number {
  let w = 0;
  for (const c of text) w += charWidth(c);
  return w * size * (WEIGHT_K[weight] ?? 1) * 1.02;
}

/** The lines a text breaks into inside a width, at most `maxLines`, the last one ending with an ellipsis when more was left. */
export function wrapText(text: string, size: number, weight: number, maxW: number, maxLines: number): string[] {
  const width = (s: string): number => textWidth(s, size, weight);
  const all: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { all.push(""); continue; }
    let cur = "";
    for (let word of words) {
      // A word longer than the line is cut where it no longer fits.
      while (width(word) > maxW && word.length > 1) {
        let n = word.length - 1;
        while (n > 1 && width(word.slice(0, n)) > maxW) n--;
        if (cur) { all.push(cur); cur = ""; }
        all.push(word.slice(0, n));
        word = word.slice(n);
      }
      const next = cur ? `${cur} ${word}` : word;
      if (cur && width(next) > maxW) { all.push(cur); cur = word; } else cur = next;
    }
    if (cur) all.push(cur);
  }
  while (all.length && !all[all.length - 1]) all.pop();
  const out = all.slice(0, Math.max(1, maxLines));
  if (all.length > out.length && out.length) {
    let last = out[out.length - 1]!;
    while (last.length > 1 && width(`${last}…`) > maxW) last = last.slice(0, -1);
    out[out.length - 1] = `${last}…`;
  }
  return out;
}

/* ---------- drawing ---------- */

function colorOf(v: string | undefined, ctx: EmbedCtx, dflt: "text" | "accent" | "dim" = "text"): string {
  if (hexOk(v)) return v;
  const key = v === "dim" || v === "accent" || v === "text" ? v : dflt;
  return hexOf(ctx.colors[key], "#ffffff");
}

function gradientVector(angle: number): { x1: number; y1: number; x2: number; y2: number } {
  const a = (angle * Math.PI) / 180;
  const dx = Math.sin(a) / 2;
  const dy = -Math.cos(a) / 2;
  return { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy };
}

/** The picture as SVG markup. `idp` keeps the ids of two pictures on one page apart. */
export function embedSvg(design: EmbedDesign, ctx: EmbedCtx, idp = "e"): string {
  const W = EMBED_W;
  const H = EMBED_H;
  const c = ctx.colors;
  const accent = hexOf(c.accent, "#ffb066");
  const defs: string[] = [];
  const body: string[] = [];
  let clipN = 0;
  const clip = (x: number, y: number, w: number, h: number, shape?: { rx: number; circle?: boolean }): string => {
    const id = `${idp}c${clipN++}`;
    const inner = shape?.circle
      ? `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${Math.min(w, h) / 2}"/>`
      : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${shape?.rx ?? 0}"/>`;
    defs.push(`<clipPath id="${id}">${inner}</clipPath>`);
    return id;
  };

  // The background.
  const bg = design.bg;
  const bgPicture = bg.mode === "image" ? ctx.href(bg.src, bg.url) : null;
  if (bg.mode === "solid") {
    body.push(`<rect width="${W}" height="${H}" fill="${hexOf(bg.c1, "#07060f")}"/>`);
  } else if (bg.mode === "image" && bgPicture) {
    body.push(`<image href="${xml(bgPicture)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`);
    if (bg.dim > 0) body.push(`<rect width="${W}" height="${H}" fill="#000" fill-opacity="${(bg.dim / 100).toFixed(2)}"/>`);
  } else {
    const [a, b] = bg.mode === "gradient" ? [hexOf(bg.c1, "#07060f"), hexOf(bg.c2, "#1b1140")] : [hexOf(c.bg, "#07060f"), hexOf(c.bg2, "#1b1140")];
    const v = bg.mode === "gradient" ? gradientVector(bg.angle) : { x1: 0, y1: 0, x2: 0.4, y2: 1 };
    defs.push(`<linearGradient id="${idp}sky" x1="${v.x1.toFixed(3)}" y1="${v.y1.toFixed(3)}" x2="${v.x2.toFixed(3)}" y2="${v.y2.toFixed(3)}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`);
    body.push(`<rect width="${W}" height="${H}" fill="url(#${idp}sky)"/>`);
  }
  if (bg.glow && bg.mode !== "image") {
    defs.push(`<radialGradient id="${idp}glow" gradientUnits="userSpaceOnUse" cx="${W * 0.78}" cy="${H * 0.22}" r="${W * 0.55}"><stop offset="0" stop-color="${accent}" stop-opacity="0.4"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>`);
    body.push(`<rect width="${W}" height="${H}" fill="url(#${idp}glow)"/>`);
  }

  // The pieces, from the back to the front.
  for (const b of design.boxes) {
    const kind = embedKindOf(b.id);
    if (!kind) continue;
    const opacity = b.op !== undefined && b.op < 100 ? ` opacity="${(b.op / 100).toFixed(2)}"` : "";
    const parts: string[] = [];
    if (kind === "text") {
      const size = b.size ?? 40;
      const weight = b.wt ?? 600;
      const text = fillEmbedText(b.text ?? "", ctx).trim();
      if (!text) continue;
      const lineH = size * 1.2;
      const maxLines = Math.max(1, Math.floor((b.h + size * 0.1) / lineH));
      const lines = wrapText(text, size, weight, b.w, maxLines);
      const align = b.align ?? "left";
      const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
      const x = align === "center" ? b.x + b.w / 2 : align === "right" ? b.x + b.w : b.x;
      const fill = colorOf(b.color, ctx, "text");
      const id = clip(b.x - 2, b.y, b.w + 4, b.h + size * 0.2);
      parts.push(`<g clip-path="url(#${id})"${opacity}>${lines.map((line, i) =>
        `<text x="${x}" y="${(b.y + size * 0.95 + i * lineH).toFixed(1)}" font-family="Inter, sans-serif" font-weight="${weight}" font-size="${size}" fill="${fill}" text-anchor="${anchor}">${xml(line)}</text>`).join("")}</g>`);
    } else if (kind === "links") {
      const size = b.size ?? 24;
      const count = b.count ?? 3;
      const labels = ctx.links.filter(Boolean).slice(0, count);
      if (!labels.length) continue;
      const padX = size * 0.85;
      const pillH = size * 2.3;
      const gap = Math.max(8, size * 0.55);
      const txt = colorOf(b.color, ctx, "text");
      const fillC = hexOk(b.fill) ? b.fill : txt;
      const fillOp = (b.fillOp ?? 7) / 100;
      // Pills in rows that wrap inside the box.
      const rows: Array<Array<{ label: string; w: number }>> = [[]];
      let rowW = 0;
      for (const label of labels) {
        const w = Math.min(b.w, textWidth(label, size, 600) + padX * 2);
        if (rows[rows.length - 1]!.length && rowW + gap + w > b.w) { rows.push([]); rowW = 0; }
        const row = rows[rows.length - 1]!;
        rowW += (row.length ? gap : 0) + w;
        row.push({ label, w });
      }
      const align = b.align ?? "left";
      const id = clip(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
      rows.forEach((row, ri) => {
        const total = row.reduce((s, p) => s + p.w, 0) + gap * (row.length - 1);
        let x = align === "center" ? b.x + (b.w - total) / 2 : align === "right" ? b.x + b.w - total : b.x;
        const y = b.y + ri * (pillH + gap * 0.6);
        for (const p of row) {
          parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${p.w.toFixed(1)}" height="${pillH.toFixed(1)}" rx="${(pillH / 2).toFixed(1)}" fill="${fillC}" fill-opacity="${fillOp}" stroke="${txt}" stroke-opacity="0.2" stroke-width="1.5"/>`);
          const shown = wrapText(p.label, size, 600, p.w - padX * 2, 1)[0] ?? "";
          parts.push(`<text x="${(x + padX).toFixed(1)}" y="${(y + pillH / 2 + size * 0.35).toFixed(1)}" font-family="Inter, sans-serif" font-weight="600" font-size="${size}" fill="${txt}">${xml(shown)}</text>`);
          x += p.w + gap;
        }
      });
      parts.unshift(`<g clip-path="url(#${id})"${opacity}>`);
      parts.push("</g>");
    } else if (kind === "avatar" || kind === "image") {
      const href = ctx.href(b.src ?? (kind === "avatar" ? "avatar" : "background"), b.url);
      const shape = b.shape ?? (kind === "avatar" ? "circle" : "round");
      const circle = shape === "circle";
      const rx = shape === "square" ? 0 : circle ? 0 : Math.min(b.radius ?? 28, Math.min(b.w, b.h) / 2);
      const id = clip(b.x, b.y, b.w, b.h, { rx, circle });
      if (href) parts.push(`<image href="${xml(href)}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" preserveAspectRatio="${b.fit === "contain" ? "xMidYMid meet" : "xMidYMid slice"}" clip-path="url(#${id})"/>`);
      else if (kind === "avatar") {
        parts.push(`<g clip-path="url(#${id})"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${accent}" fill-opacity="0.25"/><text x="${b.x + b.w / 2}" y="${b.y + b.h / 2 + Math.min(b.w, b.h) * 0.17}" font-family="Inter, sans-serif" font-weight="800" font-size="${Math.min(b.w, b.h) * 0.5}" fill="${hexOf(c.text, "#ffffff")}" text-anchor="middle">${xml((ctx.name.trim()[0] ?? "?").toUpperCase())}</text></g>`);
      } else continue;
      if (b.strokeW && b.strokeW > 0) {
        const sc = colorOf(b.stroke, ctx, "accent");
        const inset = b.strokeW / 2;
        parts.push(circle
          ? `<circle cx="${b.x + b.w / 2}" cy="${b.y + b.h / 2}" r="${Math.max(1, Math.min(b.w, b.h) / 2 - inset)}" fill="none" stroke="${sc}" stroke-width="${b.strokeW}"/>`
          : `<rect x="${b.x + inset}" y="${b.y + inset}" width="${Math.max(1, b.w - b.strokeW)}" height="${Math.max(1, b.h - b.strokeW)}" rx="${Math.max(0, rx - inset)}" fill="none" stroke="${sc}" stroke-width="${b.strokeW}"/>`);
      }
      if (opacity) { parts.unshift(`<g${opacity}>`); parts.push("</g>"); }
    } else if (kind === "shape") {
      const fill = colorOf(b.fill, ctx, "accent");
      const fillOp = (b.fillOp ?? 100) / 100;
      const rx = Math.min(b.radius ?? 24, Math.min(b.w, b.h) / 2);
      const stroke = b.strokeW ? ` stroke="${colorOf(b.stroke, ctx, "text")}" stroke-width="${b.strokeW}"` : "";
      parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${rx}" fill="${fill}" fill-opacity="${fillOp}"${stroke}${opacity}/>`);
    } else if (kind === "logo") {
      const col = colorOf(b.color, ctx, "accent");
      const k = Math.min(b.w / 224, b.h / 104);
      parts.push(`<g transform="translate(${(b.x + b.w / 2).toFixed(1)} ${(b.y + b.h / 2 - 3 * k).toFixed(1)}) scale(${k.toFixed(3)})"${opacity}>
    <circle r="44" fill="none" stroke="${col}" stroke-opacity="0.9" stroke-width="4"/>
    <circle r="40" fill="${col}" fill-opacity="0.22"/>
    <line x1="-110" y1="46" x2="110" y2="46" stroke="${col}" stroke-opacity="0.9" stroke-width="4"/>
  </g>`);
    }
    body.push(...parts);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs.length ? `<defs>${defs.join("")}</defs>` : ""}${body.join("\n")}</svg>`;
}
