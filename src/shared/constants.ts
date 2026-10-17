import {
  VIP_BG_TYPES,
  type BgType, type FontKey, type IconName, type PresenceStatus, type Profile, type ProfileColors, type ThemeName,
} from "./types";

export const LIMITS = {
  links: 20,
  tracks: 12,
  bio: 600,
  audioBytes: 30 * 1024 * 1024,
  imageBytes: 3 * 1024 * 1024,
} as const;

export const USERNAME_RE = /^[a-z0-9._-]{3,20}$/;

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
  midnight: { name: "Midnight", bgType: "particles", colors: { bg: "#000000", bg2: "#0b0b12", text: "#ffffff", dim: "#888888", accent: "#ffffff" } },
  frost:    { name: "Frost",    bgType: "solid",     colors: { bg: "#eef1f5", bg2: "#dfe6ee", text: "#0d1117", dim: "#5b6472", accent: "#0d1117" } },
  neon:     { name: "Neon",     bgType: "aurora",    colors: { bg: "#07030f", bg2: "#1b0a3a", text: "#f5f0ff", dim: "#9a8cc0", accent: "#b26bff" } },
  sunset:   { name: "Sunset",   bgType: "gradient",  colors: { bg: "#1a0b1f", bg2: "#5a1a2e", text: "#fff4ee", dim: "#c99a9a", accent: "#ff7a59" } },
  ocean:    { name: "Ocean",    bgType: "gradient",  colors: { bg: "#021520", bg2: "#064a5e", text: "#eafaff", dim: "#7fb2c0", accent: "#4fd1ff" } },
  forest:   { name: "Forest",   bgType: "grid",      colors: { bg: "#04140c", bg2: "#0a2a1a", text: "#eafff3", dim: "#7fb59a", accent: "#5eea9b" } },
  rose:     { name: "Rose",     bgType: "aurora",    colors: { bg: "#14060c", bg2: "#3a0f22", text: "#fff0f5", dim: "#c28ba0", accent: "#ff5d8f" } },
  slate:    { name: "Slate",    bgType: "solid",     colors: { bg: "#111418", bg2: "#1a1f26", text: "#e8ecf1", dim: "#7d8793", accent: "#e8ecf1" } },
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
    linkLayout: "rows",
    iconColor: "theme",
    linkHover: "lift",
    theme: "midnight",
    colors: { ...THEMES.midnight.colors },
    bgType: THEMES.midnight.bgType,
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
    page: { views: true, share: true, enter: true, enterText: "tap to enter" },
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
  return {
    ...d,
    ...s,
    hiddenRoles: Array.isArray(s.hiddenRoles) ? s.hiddenRoles : [],
    avatar: { ...d.avatar, ...s.avatar },
    colors: { ...d.colors, ...s.colors },
    card: { ...d.card, ...s.card },
    effects: { ...d.effects, ...s.effects },
    page: { ...d.page, ...s.page },
    music: { ...d.music, ...s.music },
    discord: { ...d.discord, ...s.discord },
  };
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
