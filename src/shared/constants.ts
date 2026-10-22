import {
  LYRIC_PROVIDERS, PAGE_LAYOUTS, VIP_BG_TYPES,
  type BgType, type BoardBox, type BoxAlign, type BoxFill, type BoxFit, type FontKey, type IconName, type LyricProvider, type PageSettings, type PresenceStatus, type Profile, type ProfileColors, type ThemeName,
} from "./types";

export const LIMITS = {
  links: 20,
  groups: 8,
  tracks: 12,
  bio: 600,
  audioBytes: 30 * 1024 * 1024,
  imageBytes: 3 * 1024 * 1024,
} as const;

/** A short random id for a link or a group. */
export function newId(): string {
  let out = "";
  for (let i = 0; i < 8; i++) out += Math.floor(Math.random() * 36).toString(36);
  return out;
}

export const USERNAME_RE = /^[a-z0-9._-]{3,20}$/;

/** The first of `list` that matches `value`, or nothing. */
export const oneOf = <T extends string>(list: readonly T[], value: unknown): T | undefined =>
  (list as readonly string[]).includes(String(value)) ? (value as T) : undefined;

/** Paths the app uses itself, plus a few names nobody should be able to claim. */
export const RESERVED_USERNAMES: readonly string[] = [
  "api", "auth", "media", "dashboard", "login", "logout", "assets", "static", "admin", "root",
  "support", "help", "www", "dusk", "settings", "about", "terms", "privacy", "explore",
  "community", "favicon.ico", "robots.txt", "index.html", "official", "staff", "null", "undefined",
];

export const PRESENCE_COLORS: Record<PresenceStatus, string> = {
  online: "#2ecc71",
  idle: "#f1c40f",
  dnd: "#e74c3c",
  offline: "#747f8d",
};

export const THEMES: Record<ThemeName, { name: string; bgType: BgType; colors: ProfileColors }> = {
  dusk:     { name: "Dusk",     bgType: "aurora",    colors: { bg: "#07060f", bg2: "#1b1140", text: "#f3f0ff", dim: "#8d86b3", accent: "#ffb066" } },
  midnight: { name: "Midnight", bgType: "particles", colors: { bg: "#000000", bg2: "#0b0b12", text: "#ffffff", dim: "#888888", accent: "#ffffff" } },
  frost:    { name: "Frost",    bgType: "solid",     colors: { bg: "#eef1f5", bg2: "#dfe6ee", text: "#0d1117", dim: "#5b6472", accent: "#0d1117" } },
  neon:     { name: "Neon",     bgType: "aurora",    colors: { bg: "#07030f", bg2: "#1b0a3a", text: "#f5f0ff", dim: "#9a8cc0", accent: "#b26bff" } },
  sunset:   { name: "Sunset",   bgType: "gradient",  colors: { bg: "#1a0b1f", bg2: "#5a1a2e", text: "#fff4ee", dim: "#c99a9a", accent: "#ff7a59" } },
  ocean:    { name: "Ocean",    bgType: "gradient",  colors: { bg: "#021520", bg2: "#064a5e", text: "#eafaff", dim: "#7fb2c0", accent: "#4fd1ff" } },
  forest:   { name: "Forest",   bgType: "grid",      colors: { bg: "#04140c", bg2: "#0a2a1a", text: "#eafff3", dim: "#7fb59a", accent: "#5eea9b" } },
  rose:     { name: "Rose",     bgType: "aurora",    colors: { bg: "#14060c", bg2: "#3a0f22", text: "#fff0f5", dim: "#c28ba0", accent: "#ff5d8f" } },
  slate:    { name: "Slate",    bgType: "solid",     colors: { bg: "#111418", bg2: "#1a1f26", text: "#e8ecf1", dim: "#7d8793", accent: "#e8ecf1" } },
  ember:    { name: "Ember",    bgType: "gradient",  colors: { bg: "#150809", bg2: "#40140d", text: "#fff0e6", dim: "#c08d78", accent: "#ff7a45" } },
  lilac:    { name: "Lilac",    bgType: "bokeh",     colors: { bg: "#0d0919", bg2: "#2a1c4a", text: "#f6f1ff", dim: "#a394c8", accent: "#c9a6ff" } },
  moss:     { name: "Moss",     bgType: "dots",      colors: { bg: "#07120b", bg2: "#123020", text: "#eafff1", dim: "#7fae94", accent: "#7ce0a0" } },
};

export const FONTS: Record<FontKey, { label: string; css: string }> = {
  inter: { label: "Inter", css: '"Inter", -apple-system, "Segoe UI", sans-serif' },
  dm: { label: "DM Sans", css: '"DM Sans", system-ui, sans-serif' },
  syne: { label: "Syne (wide, bold)", css: '"Syne", "Inter", sans-serif' },
  mono: { label: "JetBrains Mono", css: '"JetBrains Mono", ui-monospace, monospace' },
  serif: { label: "Playfair Display", css: '"Playfair Display", Georgia, serif' },
  bebas: { label: "Bebas Neue (tall caps)", css: '"Bebas Neue", Impact, sans-serif' },
  space: { label: "Space Grotesk", css: '"Space Grotesk", "Inter", sans-serif' },
  outfit: { label: "Outfit (round, clean)", css: '"Outfit", "Inter", sans-serif' },
  caveat: { label: "Caveat (handwriting)", css: '"Caveat", "Segoe Script", cursive' },
};

export const LINK_PRESETS: ReadonlyArray<{ label: string; icon: IconName }> = [
  { label: "Discord", icon: "discord" }, { label: "Spotify", icon: "spotify" }, { label: "YouTube", icon: "youtube" },
  { label: "GitHub", icon: "github" }, { label: "Instagram", icon: "instagram" }, { label: "TikTok", icon: "tiktok" },
  { label: "Twitch", icon: "twitch" }, { label: "X", icon: "x" }, { label: "Reddit", icon: "reddit" },
  { label: "SoundCloud", icon: "soundcloud" }, { label: "Steam", icon: "steam" }, { label: "Portfolio", icon: "globe" },
  { label: "Shop", icon: "bag" }, { label: "Blog", icon: "pen" },
];

/* ---------- the free-form page ---------- */

/** The pieces of the page that can be placed on the board, and how big they start. */
export const PAGE_WIDGETS = [
  { id: "profile", label: "Profile", w: 420, h: 300 },
  { id: "links", label: "Links", w: 420, h: 420 },
  { id: "music", label: "Music", w: 330, h: 200 },
  { id: "discord", label: "Discord", w: 330, h: 200 },
  { id: "views", label: "Views", w: 200, h: 70 },
] as const satisfies ReadonlyArray<{ id: string; label: string; w: number; h: number }>;

export type PageWidgetId = (typeof PAGE_WIDGETS)[number]["id"];

/** The ways a piece can be filled in. */
export const BOX_FILLS: readonly BoxFill[] = ["soft", "solid", "outline", "glass", "none"];

/** The ways a piece can be lined up inside its box. */
export const BOX_ALIGNS: readonly BoxAlign[] = ["center", "left"];

/** The ways the content of a piece can be fitted into it. */
export const BOX_FITS: readonly BoxFit[] = ["scale", "fixed"];

/** The size of the board, in pixels. The page is scaled to fit the screen. */
export const BOARD_W = 1200;
export const BOARD_H = 1000;

/** A tidy page to start from, so switching to the experimental layout shows something. */
export function defaultBoard(): BoardBox[] {
  return [
    { id: "profile", x: 390, y: 40, w: 420, h: 300 },
    { id: "links", x: 390, y: 360, w: 420, h: 560 },
    { id: "music", x: 40, y: 60, w: 330, h: 200 },
    { id: "discord", x: 830, y: 60, w: 330, h: 200 },
    { id: "views", x: 500, y: 930, w: 200, h: 60 },
  ];
}

/** The names the settings use for the lyrics services. */
export const LYRIC_PROVIDER_NAMES: Record<LyricProvider, string> = {
  lrclib: "LRCLIB",
  polaris: "Polaris",
  polarisMono: "Polaris Mono",
  genius: "Genius",
};

/** A new account starts with a clean page: nothing but the person's Discord name. */
export function defaultProfile(name: string): Profile {
  return {
    name: name.slice(0, 32),
    bio: "",
    typewriter: true,
    location: "",
    showLocation: true,
    avatar: { kind: "discord", emoji: "", shape: "circle", ring: true, ringWidth: 4, size: 110 },
    hiddenRoles: [],
    tagStyle: "pill",
    links: [],
    groups: [],
    linkLayout: "rows",
    iconColor: "theme",
    linkHover: "lift",
    theme: "dusk",
    colors: { ...THEMES.dusk.colors },
    bgType: THEMES.dusk.bgType,
    gradAngle: 160,
    gridSize: 40,
    gridPush: 60,
    density: 1,
    bgImage: "",
    bgBlur: 0,
    bgDim: 0,
    bgSpeed: 1,
    linkGap: 12,
    nameTracking: -3,
    nameCase: "normal",
    bioScale: 100,
    card: { style: "glass", radius: 32, blur: 25, width: 420, align: "center", border: true, borderColor: "text", shadow: 50 },
    font: "inter",
    nameSize: 40,
    nameWeight: 800,
    nameGlow: false,
    nameGradient: false,
    effects: { tilt: true, cursorGlow: false, entrance: "rise" },
    page: { views: true, share: true, enter: true, enterText: "tap to enter", layout: "regular", board: [], lyricsProvider: "lrclib" },
    music: { enabled: true, autoplay: true, loop: true, showProgress: true, showLyrics: true, lyricsOpen: false, lyricsStyle: "panel", volume: 0.7 },
    discord: { enabled: true, showCard: true, showActivity: true, showSpotify: true, showProgress: true, showLyrics: true, lyricsOpen: false, lyricsStyle: "panel" },
  };
}

/**
 * Fill in anything a saved profile is missing (settings added in later versions) and drop
 * anything it no longer has, so older accounts keep working after an update.
 */
export function normalizeProfile(saved: Partial<Profile> | undefined, name: string): Profile {
  const d = defaultProfile(name);
  const s = saved ?? {};
  const groups = Array.isArray(s.groups)
    ? s.groups.filter(g => g && typeof g.id === "string" && typeof g.label === "string").slice(0, LIMITS.groups)
    : [];
  const known = new Set(groups.map(g => g.id));
  const links = Array.isArray(s.links)
    ? s.links.map(l => ({
      ...l,
      id: l && typeof l.id === "string" && l.id ? l.id : newId(),
      group: l && typeof l.group === "string" && known.has(l.group) ? l.group : undefined,
    }))
    : [];
  const page: Partial<PageSettings> = s.page ?? {};
  return {
    ...d,
    ...s,
    hiddenRoles: Array.isArray(s.hiddenRoles) ? s.hiddenRoles : [],
    groups,
    links,
    avatar: { ...d.avatar, ...s.avatar },
    colors: { ...d.colors, ...s.colors },
    card: { ...d.card, ...s.card },
    effects: { ...d.effects, ...s.effects },
    page: {
      ...d.page,
      ...page,
      layout: oneOf(PAGE_LAYOUTS, page.layout) ?? d.page.layout,
      lyricsProvider: oneOf(LYRIC_PROVIDERS, page.lyricsProvider) ?? d.page.lyricsProvider,
      board: normalizeBoard(page.board),
    },
    music: { ...d.music, ...s.music },
    discord: { ...d.discord, ...s.discord },
  };
}

/** Keep only the boxes that make sense: a known piece, and numbers that are numbers. */
export function normalizeBoard(board: unknown): BoardBox[] {
  if (!Array.isArray(board)) return [];
  const known = new Set<string>(PAGE_WIDGETS.map(w => w.id));
  const out: BoardBox[] = [];
  for (const b of board) {
    if (!b || typeof b !== "object") continue;
    const box = b as Partial<BoardBox>;
    if (typeof box.id !== "string" || !known.has(box.id)) continue;
    if (![box.x, box.y, box.w, box.h].every(n => typeof n === "number" && Number.isFinite(n))) continue;
    if (out.some(o => o.id === box.id)) continue;
    const piece: BoardBox = { id: box.id, x: box.x!, y: box.y!, w: Math.max(60, box.w!), h: Math.max(40, box.h!) };
    // The look of a piece is kept only when it is one of the choices.
    if (box.align === "center" || box.align === "left") piece.align = box.align;
    if (box.fill && BOX_FILLS.includes(box.fill)) piece.fill = box.fill;
    if (box.fit && BOX_FITS.includes(box.fit)) piece.fit = box.fit;
    if (typeof box.pad === "number" && Number.isFinite(box.pad)) piece.pad = Math.min(60, Math.max(0, Math.round(box.pad)));
    if (typeof box.radius === "number" && Number.isFinite(box.radius)) piece.radius = Math.min(80, Math.max(0, Math.round(box.radius)));
    out.push(piece);
    if (out.length >= PAGE_WIDGETS.length) break;
  }
  return out;
}

/** The parts of a profile that make up its look. A template is a copy of these, never anyone's links, bio or music. */
export const STYLE_KEYS = [
  "linkLayout", "iconColor", "linkHover", "tagStyle", "theme", "colors", "bgType", "gradAngle", "gridSize", "gridPush",
  "density", "bgImage", "bgBlur", "bgDim", "bgSpeed", "linkGap", "nameTracking", "nameCase", "bioScale", "card", "font", "nameSize", "nameWeight", "nameGlow", "nameGradient", "effects",
] as const satisfies ReadonlyArray<keyof Profile>;

export type TemplateStyle = Pick<Profile, (typeof STYLE_KEYS)[number]>;

export function pickStyle(p: Profile): TemplateStyle {
  const out: Record<string, unknown> = {};
  for (const k of STYLE_KEYS) out[k] = structuredClone(p[k]);
  return out as unknown as TemplateStyle;
}

export function applyStyle(p: Profile, style: TemplateStyle): Profile {
  return { ...p, ...structuredClone(style) };
}

/** Is this background one only VIP members may use? */
export const isVipBg = (b: BgType): boolean => VIP_BG_TYPES.includes(b);

/**
 * What a person may keep on their page. Regular members lose the VIP-only choices (Dynamic Island,
 * premium and picture backgrounds); everything else stays as they set it. VIP members are untouched.
 */
export function limitProfile(p: Profile, vip: boolean): Profile {
  if (vip) return p;
  const needs = isVipBg(p.bgType) || p.bgImage || p.music.lyricsStyle === "island" || p.discord.lyricsStyle === "island";
  if (!needs) return p;
  return {
    ...p,
    bgType: isVipBg(p.bgType) ? "gradient" : p.bgType,
    bgImage: "",
    music: { ...p.music, lyricsStyle: "panel" },
    discord: { ...p.discord, lyricsStyle: "panel" },
  };
}
